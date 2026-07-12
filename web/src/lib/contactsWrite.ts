import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { parse } from "smol-toml";
import { configTomlPath, dbPath, repoRoot } from "./paths";
import { getContact, resetDb } from "./db";
import type { ContactDetail } from "./types";

export type ContactPatch = {
  exclude?: boolean;
  tags?: string[];
  firstName?: string | null;
  lastName?: string | null;
  phones?: string[];
};

const RESERVED_GROUP_NAMES = new Set([
  "excluded",
  "no messages",
  "no-messages",
  "unmatched",
]);

function assertAllowedTagName(name: string): void {
  const key = name.trim().toLowerCase();
  if (RESERVED_GROUP_NAMES.has(key)) {
    throw new Error(
      key === "excluded"
        ? "Excluded is a reserved group"
        : key === "unmatched"
          ? "Unmatched is a reserved group"
          : "No messages is a reserved group",
    );
  }
}

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

const CSV_TAG_COLUMNS = ["tag_1", "tag_2", "tag_3", "tag_4", "tag_5"] as const;

function tagColumnIndexes(header: string[]): number[] {
  return CSV_TAG_COLUMNS.map((name) => header.indexOf(name));
}

function readCsvTags(cols: string[], tagIdx: number[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of tagIdx) {
    if (i < 0) continue;
    const tag = (cols[i] ?? "").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function writeCsvTags(cols: string[], tagIdx: number[], tags: string[]): void {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  for (let i = 0; i < tagIdx.length; i++) {
    const col = tagIdx[i]!;
    if (col < 0) continue;
    cols[col] = unique[i] ?? "";
  }
}

function updateContactsCsv(
  matchPhones: string[],
  matchNames: { firstName: string | null; lastName: string | null },
  patch: {
    exclude: boolean;
    tags: string[];
    firstName?: string | null;
    lastName?: string | null;
    phones?: string[];
  },
): void {
  const csvPath = contactsCsvPath();
  if (!fs.existsSync(csvPath)) {
    throw new Error(`contacts CSV not found: ${csvPath}`);
  }

  const phoneSet = new Set(matchPhones);
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0) {
    throw new Error("contacts CSV is empty");
  }

  const header = parseCsvLine(lines[0] ?? "");
  const idx = {
    phones: header.indexOf("phones"),
    firstName: header.indexOf("first_name"),
    lastName: header.indexOf("last_name"),
    exclude: header.indexOf("exclude"),
  };
  const tagIdx = tagColumnIndexes(header);
  if (idx.phones < 0 || idx.exclude < 0 || tagIdx.some((i) => i < 0)) {
    throw new Error("contacts CSV missing required columns");
  }

  const matchFirst = (matchNames.firstName ?? "").trim().toLowerCase();
  const matchLast = (matchNames.lastName ?? "").trim().toLowerCase();

  let matched = false;
  const out = lines.map((line, lineNo) => {
    if (lineNo === 0 || !line.trim()) return line;
    const cols = parseCsvLine(line);
    while (cols.length < header.length) cols.push("");
    const rowPhones = (cols[idx.phones] ?? "")
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    const phoneHit =
      phoneSet.size > 0 && rowPhones.some((p) => phoneSet.has(p));
    const nameHit =
      !phoneHit &&
      phoneSet.size === 0 &&
      idx.firstName >= 0 &&
      idx.lastName >= 0 &&
      (cols[idx.firstName] ?? "").trim().toLowerCase() === matchFirst &&
      (cols[idx.lastName] ?? "").trim().toLowerCase() === matchLast &&
      (matchFirst !== "" || matchLast !== "");
    if (!phoneHit && !nameHit) {
      return line;
    }
    matched = true;
    if (patch.phones) {
      cols[idx.phones] = patch.phones.join(";");
    }
    if (patch.firstName !== undefined && idx.firstName >= 0) {
      cols[idx.firstName] = patch.firstName ?? "";
    }
    if (patch.lastName !== undefined && idx.lastName >= 0) {
      cols[idx.lastName] = patch.lastName ?? "";
    }
    cols[idx.exclude] = patch.exclude ? "true" : "false";
    writeCsvTags(cols, tagIdx, patch.tags);
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

function appendContactsCsv(row: {
  phones: string[];
  firstName: string | null;
  lastName: string | null;
  exclude: boolean;
  tags: string[];
}): void {
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
  const idx = {
    phones: header.indexOf("phones"),
    firstName: header.indexOf("first_name"),
    lastName: header.indexOf("last_name"),
    exclude: header.indexOf("exclude"),
  };
  const tagIdx = tagColumnIndexes(header);
  if (idx.phones < 0 || idx.exclude < 0 || tagIdx.some((i) => i < 0)) {
    throw new Error("contacts CSV missing required columns");
  }

  const cols = header.map(() => "");
  cols[idx.phones] = row.phones.join(";");
  if (idx.firstName >= 0) cols[idx.firstName] = row.firstName ?? "";
  if (idx.lastName >= 0) cols[idx.lastName] = row.lastName ?? "";
  cols[idx.exclude] = row.exclude ? "true" : "false";
  writeCsvTags(cols, tagIdx, row.tags);

  const line = cols.map(escapeCsvField).join(",");
  const needsNewline = raw.length > 0 && !/\r?\n$/.test(raw);
  fs.writeFileSync(csvPath, `${raw}${needsNewline ? "\n" : ""}${line}\n`, "utf8");
}

export type ContactCreate = {
  firstName?: string | null;
  lastName?: string | null;
  phones?: string[];
  exclude?: boolean;
  tags?: string[];
};

/** Insert a new contact in SQLite and append contacts.csv; returns the contact. */
export function createContact(input: ContactCreate): ContactDetail {
  const firstName = input.firstName?.trim() || null;
  const lastName = input.lastName?.trim() || null;
  if (!firstName && !lastName) {
    throw new Error("first or last name required");
  }
  const phones = (input.phones ?? []).map((p) => p.trim()).filter(Boolean);
  const exclude = input.exclude ?? false;
  const preferredPhone = phones[0] ?? null;
  const tags = (input.tags ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !RESERVED_GROUP_NAMES.has(t.toLowerCase()));

  let newId = 0;
  const writeDb = new Database(dbPath());
  try {
    const tx = writeDb.transaction(() => {
      for (const phone of phones) {
        const owner = phoneOwner(writeDb, phone);
        if (owner != null) {
          throw new Error(`phone ${phone} already belongs to another contact`);
        }
      }

      const result = writeDb
        .prepare(
          `INSERT INTO contacts (first_name, last_name, exclude, preferred_phone)
           VALUES (?, ?, ?, ?)`,
        )
        .run(firstName, lastName, exclude ? 1 : 0, preferredPhone);
      newId = Number(result.lastInsertRowid);

      const insertPhone = writeDb.prepare(
        `INSERT INTO contact_phones (phone_e164, contact_id) VALUES (?, ?)`,
      );
      for (const phone of phones) {
        insertPhone.run(phone, newId);
      }

      if (tags.length > 0) {
        const insertTag = writeDb.prepare(
          `INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`,
        );
        for (const name of tags) {
          const tagId = ensureTagId(writeDb, name);
          insertTag.run(newId, tagId);
        }
      }
    });
    tx();
  } finally {
    writeDb.close();
  }

  resetDb();
  appendContactsCsv({
    phones,
    firstName,
    lastName,
    exclude,
    tags,
  });

  const created = getContact(newId);
  if (!created) {
    throw new Error("contact missing after create");
  }
  return created;
}

function ensureTagId(db: Database.Database, name: string): number {
  assertAllowedTagName(name);
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

/** Rewrite tag_1..tag_5 in contacts.csv by mapping old tag names. */
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
  const tagIdx = tagColumnIndexes(header);
  if (tagIdx.some((i) => i < 0)) {
    throw new Error("contacts CSV missing tag_1..tag_5 columns");
  }

  const out = lines.map((line, lineNo) => {
    if (lineNo === 0 || !line.trim()) return line;
    const cols = parseCsvLine(line);
    while (cols.length < header.length) cols.push("");
    const tags = readCsvTags(cols, tagIdx)
      .map(mapTag)
      .filter((t): t is string => Boolean(t));
    writeCsvTags(cols, tagIdx, tags);
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
  assertAllowedTagName(trimmed);

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
  assertAllowedTagName(newName);
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

function phoneOwner(
  db: Database.Database,
  phone: string,
): number | null {
  const row = db
    .prepare(`SELECT contact_id FROM contact_phones WHERE phone_e164 = ?`)
    .get(phone) as { contact_id: number } | undefined;
  return row?.contact_id ?? null;
}

/**
 * Retarget message/conversation handles when a contact phone changes so the
 * person stays linked to their threads (list filters require phone↔message join).
 */
function remapPhoneHandle(
  db: Database.Database,
  contactId: number,
  from: string,
  to: string,
): void {
  if (from === to) return;

  const owner = phoneOwner(db, to);
  if (owner != null && owner !== contactId) {
    throw new Error(`phone ${to} already belongs to another contact`);
  }

  // Prefer updating the PK in place; if `to` already exists on this contact,
  // drop the old row instead (merge).
  if (owner === contactId) {
    db.prepare(`DELETE FROM contact_phones WHERE phone_e164 = ?`).run(from);
  } else {
    db.prepare(
      `UPDATE contact_phones SET phone_e164 = ? WHERE phone_e164 = ?`,
    ).run(to, from);
  }

  db.prepare(
    `UPDATE conversations SET chat_identifier = ? WHERE chat_identifier = ?`,
  ).run(to, from);
  db.prepare(`UPDATE participants SET handle = ? WHERE handle = ?`).run(to, from);
  db.prepare(`UPDATE messages SET sender = ? WHERE sender = ?`).run(to, from);
  db.prepare(`UPDATE tapbacks SET sender = ? WHERE sender = ?`).run(to, from);
}

function syncContactPhones(
  db: Database.Database,
  contactId: number,
  oldPhones: string[],
  newPhones: string[],
): void {
  const shared = Math.min(oldPhones.length, newPhones.length);
  for (let i = 0; i < shared; i++) {
    const from = oldPhones[i]!;
    const to = newPhones[i]!;
    if (from !== to) {
      remapPhoneHandle(db, contactId, from, to);
    }
  }

  for (let i = shared; i < oldPhones.length; i++) {
    db.prepare(`DELETE FROM contact_phones WHERE phone_e164 = ?`).run(
      oldPhones[i],
    );
  }

  const insert = db.prepare(
    `INSERT INTO contact_phones (phone_e164, contact_id) VALUES (?, ?)`,
  );
  for (let i = shared; i < newPhones.length; i++) {
    const phone = newPhones[i]!;
    const owner = phoneOwner(db, phone);
    if (owner != null && owner !== contactId) {
      throw new Error(`phone ${phone} already belongs to another contact`);
    }
    if (owner == null) {
      insert.run(phone, contactId);
    }
  }
}

/** Update contact fields in SQLite and contacts.csv; returns refreshed contact. */
export function patchContact(
  id: number,
  patch: ContactPatch,
): ContactDetail {
  const existing = getContact(id);
  if (!existing) {
    throw new Error("contact not found");
  }

  const exclude = patch.exclude ?? existing.exclude;
  const tags = patch.tags ?? existing.tags;
  const firstName =
    patch.firstName !== undefined
      ? patch.firstName?.trim() || null
      : existing.firstName;
  const lastName =
    patch.lastName !== undefined
      ? patch.lastName?.trim() || null
      : existing.lastName;
  const phones =
    patch.phones !== undefined
      ? patch.phones.map((p) => p.trim()).filter(Boolean)
      : existing.phones;
  const preferredPhone = phones[0] ?? null;

  const writeDb = new Database(dbPath());
  try {
    const tx = writeDb.transaction(() => {
      if (patch.phones) {
        syncContactPhones(writeDb, id, existing.phones, phones);
      }

      writeDb
        .prepare(
          `UPDATE contacts
           SET first_name = ?, last_name = ?, exclude = ?, preferred_phone = ?
           WHERE id = ?`,
        )
        .run(firstName, lastName, exclude ? 1 : 0, preferredPhone, id);

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
    });
    tx();
  } finally {
    writeDb.close();
  }

  resetDb();
  updateContactsCsv(
    existing.phones,
    { firstName: existing.firstName, lastName: existing.lastName },
    {
      exclude,
      tags,
      firstName: patch.firstName !== undefined ? firstName : undefined,
      lastName: patch.lastName !== undefined ? lastName : undefined,
      phones: patch.phones !== undefined ? phones : undefined,
    },
  );

  const updated = getContact(id);
  if (!updated) {
    throw new Error("contact missing after update");
  }
  return updated;
}

/** Append a phone/email handle to an existing contact (for Unmatched assign). */
export function addPhoneToContact(id: number, phone: string): ContactDetail {
  const existing = getContact(id);
  if (!existing) throw new Error("contact not found");
  const trimmed = phone.trim();
  if (!trimmed) throw new Error("phone required");
  if (existing.phones.includes(trimmed)) return existing;
  return patchContact(id, { phones: [...existing.phones, trimmed] });
}

function removeContactsCsv(
  targets: Array<{
    phones: string[];
    firstName: string | null;
    lastName: string | null;
  }>,
): void {
  if (targets.length === 0) return;

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
  const idx = {
    phones: header.indexOf("phones"),
    firstName: header.indexOf("first_name"),
    lastName: header.indexOf("last_name"),
  };
  if (idx.phones < 0) {
    throw new Error("contacts CSV missing required columns");
  }

  const matchers = targets.map((t) => ({
    phones: new Set(t.phones),
    first: (t.firstName ?? "").trim().toLowerCase(),
    last: (t.lastName ?? "").trim().toLowerCase(),
  }));

  const out = lines.filter((line, lineNo) => {
    if (lineNo === 0 || !line.trim()) return true;
    const cols = parseCsvLine(line);
    const rowPhones = (cols[idx.phones] ?? "")
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    const rowFirst =
      idx.firstName >= 0
        ? (cols[idx.firstName] ?? "").trim().toLowerCase()
        : "";
    const rowLast =
      idx.lastName >= 0 ? (cols[idx.lastName] ?? "").trim().toLowerCase() : "";

    for (const m of matchers) {
      const phoneHit =
        m.phones.size > 0 && rowPhones.some((p) => m.phones.has(p));
      const nameHit =
        !phoneHit &&
        m.phones.size === 0 &&
        (m.first !== "" || m.last !== "") &&
        rowFirst === m.first &&
        rowLast === m.last;
      if (phoneHit || nameHit) return false;
    }
    return true;
  });

  const endsWithNewline = /\r?\n$/.test(raw);
  let body = out.join("\n");
  if (endsWithNewline && !body.endsWith("\n")) body += "\n";
  fs.writeFileSync(csvPath, body, "utf8");
}

/** Delete contacts from SQLite and contacts.csv. */
export function deleteContacts(ids: number[]): number {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))];
  if (unique.length === 0) return 0;

  const snapshots: Array<{
    phones: string[];
    firstName: string | null;
    lastName: string | null;
  }> = [];
  for (const id of unique) {
    const existing = getContact(id);
    if (!existing) continue;
    snapshots.push({
      phones: existing.phones,
      firstName: existing.firstName,
      lastName: existing.lastName,
    });
  }
  if (snapshots.length === 0) {
    throw new Error("contact not found");
  }

  const writeDb = new Database(dbPath());
  try {
    const del = writeDb.prepare(`DELETE FROM contacts WHERE id = ?`);
    const tx = writeDb.transaction(() => {
      for (const id of unique) {
        del.run(id);
      }
    });
    tx();
  } finally {
    writeDb.close();
  }

  resetDb();
  removeContactsCsv(snapshots);
  return snapshots.length;
}
