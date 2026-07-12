import fs from "fs";
import path from "path";
import { parse } from "smol-toml";
import { phoneHandlesOnly } from "./handleKind";
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

const CSV_GROUP_COLUMNS = [
  "group_1",
  "group_2",
  "group_3",
  "group_4",
  "group_5",
] as const;

function groupColumnIndexes(header: string[]): number[] {
  return CSV_GROUP_COLUMNS.map((name) => header.indexOf(name));
}

function readCsvGroups(cols: string[], groupIdx: number[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of groupIdx) {
    if (i < 0) continue;
    const group = (cols[i] ?? "").trim();
    if (!group) continue;
    const key = group.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(group);
  }
  return out;
}

function writeCsvGroups(
  cols: string[],
  groupIdx: number[],
  groups: string[],
): void {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const trimmed = group.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  for (let i = 0; i < groupIdx.length; i++) {
    const col = groupIdx[i]!;
    if (col < 0) continue;
    cols[col] = unique[i] ?? "";
  }
}

export function updateContactsCsv(
  matchPhones: string[],
  matchNames: { firstName: string | null; lastName: string | null },
  patch: {
    exclude: boolean;
    groups: string[];
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
  const groupIdx = groupColumnIndexes(header);
  if (idx.phones < 0 || idx.exclude < 0 || groupIdx.some((i) => i < 0)) {
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
      cols[idx.phones] = phoneHandlesOnly(patch.phones).join(";");
    }
    if (patch.firstName !== undefined && idx.firstName >= 0) {
      cols[idx.firstName] = patch.firstName ?? "";
    }
    if (patch.lastName !== undefined && idx.lastName >= 0) {
      cols[idx.lastName] = patch.lastName ?? "";
    }
    cols[idx.exclude] = patch.exclude ? "true" : "false";
    writeCsvGroups(cols, groupIdx, patch.groups);
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
  groups: string[];
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
  const groupIdx = groupColumnIndexes(header);
  if (idx.phones < 0 || idx.exclude < 0 || groupIdx.some((i) => i < 0)) {
    throw new Error("contacts CSV missing required columns");
  }

  const cols = header.map(() => "");
  cols[idx.phones] = phoneHandlesOnly(row.phones).join(";");
  if (idx.firstName >= 0) cols[idx.firstName] = row.firstName ?? "";
  if (idx.lastName >= 0) cols[idx.lastName] = row.lastName ?? "";
  cols[idx.exclude] = row.exclude ? "true" : "false";
  writeCsvGroups(cols, groupIdx, row.groups);

  const line = cols.map(escapeCsvField).join(",");
  const needsNewline = raw.length > 0 && !/\r?\n$/.test(raw);
  fs.writeFileSync(csvPath, `${raw}${needsNewline ? "\n" : ""}${line}\n`, "utf8");
}


/** Rewrite group_1..group_5 in contacts.csv by mapping old group names. */
export function rewriteCsvGroups(
  mapGroup: (group: string) => string | null,
): void {
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
  const groupIdx = groupColumnIndexes(header);
  if (groupIdx.some((i) => i < 0)) {
    throw new Error("contacts CSV missing group_1..group_5 columns");
  }

  const out = lines.map((line, lineNo) => {
    if (lineNo === 0 || !line.trim()) return line;
    const cols = parseCsvLine(line);
    while (cols.length < header.length) cols.push("");
    const groups = readCsvGroups(cols, groupIdx)
      .map(mapGroup)
      .filter((g): g is string => Boolean(g));
    writeCsvGroups(cols, groupIdx, groups);
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
    phones: new Set(phoneHandlesOnly(t.phones)),
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

