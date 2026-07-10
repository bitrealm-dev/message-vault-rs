import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { parse } from "smol-toml";
import { configTomlPath, dbPath, repoRoot } from "./paths";
import { getContact, resetDb } from "./db";
import type { ContactDetail } from "./types";

export type ContactPatch = {
  display?: boolean;
  status?: "current" | "historical";
  tags?: string[];
};

function contactsCsvPath(): string {
  const text = fs.readFileSync(configTomlPath(), "utf8");
  const cfg = parse(text) as {
    paths?: { contacts_csv?: string };
  };
  const rel = cfg.paths?.contacts_csv ?? "config/contacts.csv";
  return path.isAbsolute(rel) ? rel : path.join(repoRoot(), rel);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function updateContactsCsv(
  phones: string[],
  patch: { display: boolean; status: string; tags: string[] },
): void {
  const csvPath = contactsCsvPath();
  if (!fs.existsSync(csvPath)) {
    throw new Error(`contacts CSV not found: ${csvPath}`);
  }

  const phoneSet = new Set(phones);
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0) {
    throw new Error("contacts CSV is empty");
  }

  const header = parseCsvLine(lines[0] ?? "");
  const idx = {
    phones: header.indexOf("phones"),
    display: header.indexOf("display"),
    status: header.indexOf("status"),
    tags: header.indexOf("tags"),
  };
  if (idx.phones < 0 || idx.display < 0 || idx.status < 0 || idx.tags < 0) {
    throw new Error("contacts CSV missing required columns");
  }

  let matched = false;
  const out = lines.map((line, lineNo) => {
    if (lineNo === 0 || !line.trim()) return line;
    const cols = parseCsvLine(line);
    while (cols.length < header.length) cols.push("");
    const rowPhones = (cols[idx.phones] ?? "")
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    if (!rowPhones.some((p) => phoneSet.has(p))) {
      return line;
    }
    matched = true;
    cols[idx.display] = patch.display ? "TRUE" : "FALSE";
    cols[idx.status] = patch.status;
    cols[idx.tags] = patch.tags.join(";");
    return cols.map(escapeCsvField).join(",");
  });

  if (!matched) {
    throw new Error("contact not found in contacts.csv");
  }

  const endsWithNewline = /\r?\n$/.test(raw);
  let body = out.join("\n");
  if (endsWithNewline && !body.endsWith("\n")) body += "\n";
  fs.writeFileSync(csvPath, body, "utf8");
}

function ensureTagId(db: Database.Database, name: string): number {
  db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(name);
  const row = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(name) as
    | { id: number }
    | undefined;
  if (!row) throw new Error(`failed to ensure tag ${name}`);
  return row.id;
}

function findTagId(db: Database.Database, name: string): number | null {
  const row = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(name) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

/** Rewrite the tags column in contacts.csv by mapping old tag names. */
function rewriteCsvTags(mapTag: (tag: string) => string | null): void {
  const csvPath = contactsCsvPath();
  if (!fs.existsSync(csvPath)) {
    throw new Error(`contacts CSV not found: ${csvPath}`);
  }

  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0) {
    throw new Error("contacts CSV is empty");
  }

  const header = parseCsvLine(lines[0] ?? "");
  const tagsIdx = header.indexOf("tags");
  if (tagsIdx < 0) {
    throw new Error("contacts CSV missing tags column");
  }

  const out = lines.map((line, lineNo) => {
    if (lineNo === 0 || !line.trim()) return line;
    const cols = parseCsvLine(line);
    while (cols.length < header.length) cols.push("");
    const tags = (cols[tagsIdx] ?? "")
      .split(";")
      .map((t) => t.trim())
      .filter(Boolean)
      .map(mapTag)
      .filter((t): t is string => Boolean(t));
    // Dedupe while preserving order
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const t of tags) {
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(t);
    }
    cols[tagsIdx] = unique.join(";");
    return cols.map(escapeCsvField).join(",");
  });

  const endsWithNewline = /\r?\n$/.test(raw);
  let body = out.join("\n");
  if (endsWithNewline && !body.endsWith("\n")) body += "\n";
  fs.writeFileSync(csvPath, body, "utf8");
}

export function createTag(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name required");

  const writeDb = new Database(dbPath());
  try {
    const existing = writeDb
      .prepare(`SELECT name FROM tags WHERE name = ? COLLATE NOCASE`)
      .get(trimmed) as { name: string } | undefined;
    if (existing) {
      throw new Error("group already exists");
    }
    writeDb.prepare(`INSERT INTO tags (name) VALUES (?)`).run(trimmed);
  } finally {
    writeDb.close();
  }

  resetDb();
  return trimmed;
}

export function renameTag(from: string, to: string): string {
  const oldName = from.trim();
  const newName = to.trim();
  if (!oldName || !newName) throw new Error("name required");
  if (oldName.toLowerCase() === newName.toLowerCase()) {
    // Same name ignoring case — allow casing fix
    if (oldName === newName) return newName;
  }

  const writeDb = new Database(dbPath());
  try {
    const id = findTagId(writeDb, oldName);
    if (id == null) throw new Error("group not found");

    const clash = writeDb
      .prepare(
        `SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id != ?`,
      )
      .get(newName, id) as { id: number } | undefined;
    if (clash) throw new Error("group already exists");

    writeDb.prepare(`UPDATE tags SET name = ? WHERE id = ?`).run(newName, id);
  } finally {
    writeDb.close();
  }

  resetDb();
  rewriteCsvTags((tag) =>
    tag.toLowerCase() === oldName.toLowerCase() ? newName : tag,
  );
  return newName;
}

export function deleteTag(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name required");

  const writeDb = new Database(dbPath());
  try {
    const id = findTagId(writeDb, trimmed);
    if (id == null) throw new Error("group not found");
    writeDb.prepare(`DELETE FROM contact_tags WHERE tag_id = ?`).run(id);
    writeDb.prepare(`DELETE FROM tags WHERE id = ?`).run(id);
  } finally {
    writeDb.close();
  }

  resetDb();
  rewriteCsvTags((tag) =>
    tag.toLowerCase() === trimmed.toLowerCase() ? null : tag,
  );
}

/** Update display/status/tags in SQLite and contacts.csv; returns refreshed contact. */
export function patchContact(
  id: number,
  patch: ContactPatch,
): ContactDetail {
  const existing = getContact(id);
  if (!existing) {
    throw new Error("contact not found");
  }

  const display = patch.display ?? existing.display;
  const status =
    patch.status ??
    (existing.status === "historical" ? "historical" : "current");
  const tags = patch.tags ?? existing.tags;

  const writeDb = new Database(dbPath());
  try {
    writeDb
      .prepare(`UPDATE contacts SET display = ?, status = ? WHERE id = ?`)
      .run(display ? 1 : 0, status, id);

    if (patch.tags) {
      writeDb.prepare(`DELETE FROM contact_tags WHERE contact_id = ?`).run(id);
      const insert = writeDb.prepare(
        `INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`,
      );
      for (const name of tags) {
        const tagId = ensureTagId(writeDb, name);
        insert.run(id, tagId);
      }
    }
  } finally {
    writeDb.close();
  }

  resetDb();
  updateContactsCsv(existing.phones, { display, status, tags });

  const updated = getContact(id);
  if (!updated) {
    throw new Error("contact missing after update");
  }
  return updated;
}
