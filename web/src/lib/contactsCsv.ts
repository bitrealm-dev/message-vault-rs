import fs from "fs";
import path from "path";
import { parse } from "smol-toml";
import { configTomlPath, repoRoot } from "./paths";

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

export function updateContactsCsv(
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

export function appendContactsCsv(row: {
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


/** Rewrite tag_1..tag_5 in contacts.csv by mapping old tag names. */
export function rewriteCsvTags(mapTag: (tag: string) => string | null): void {
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


export function removeContactsCsv(
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

