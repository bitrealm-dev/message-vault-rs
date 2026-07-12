import Database from "better-sqlite3";
import { loadOwner } from "./config";
import { dbPath } from "./paths";
import type {
  ContactDetail,
  ContactListItem,
  ContactSection,
  GroupThread,
  GroupYearRow,
  HomeStats,
  MessageRow,
  UnassignedHandle,
  YearThread,
} from "./types";
import { groupSlug } from "./groupSlug";
import { RESERVED_GROUP_NAMES } from "./reservedGroups";

export { groupSlug };

const g = globalThis as unknown as {
  __mvReadonlyDb?: Database.Database | null;
  __mvHasDuplicateOf?: boolean | null;
};

function getDb(): Database.Database {
  if (!g.__mvReadonlyDb) {
    g.__mvReadonlyDb = new Database(dbPath(), {
      readonly: true,
      fileMustExist: true,
    });
    g.__mvReadonlyDb.pragma("foreign_keys = ON");
    g.__mvHasDuplicateOf = null;
  }
  return g.__mvReadonlyDb;
}

/** Close the cached readonly connection so the next read sees recent writes. */
export function resetDb(): void {
  if (g.__mvReadonlyDb) {
    g.__mvReadonlyDb.close();
    g.__mvReadonlyDb = null;
  }
  g.__mvHasDuplicateOf = null;
}

function hasDuplicateOfColumn(): boolean {
  if (g.__mvHasDuplicateOf != null) return g.__mvHasDuplicateOf;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM pragma_table_info('messages') WHERE name = 'duplicate_of'`,
    )
    .get() as { n: number };
  g.__mvHasDuplicateOf = row.n > 0;
  return g.__mvHasDuplicateOf;
}

/** When no source filter is set (All combined), hide soft-deduped cross-source copies. */
function combinedDedupeSql(source?: string | null, alias?: string): string {
  if (source || !hasDuplicateOfColumn()) return "";
  const col = alias ? `${alias}.duplicate_of` : "duplicate_of";
  return ` AND ${col} IS NULL`;
}

function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  preferred_phone: string | null;
}): string {
  const parts = [row.first_name, row.last_name]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  if (parts.length) return parts.join(" ");
  return row.preferred_phone ?? "Unknown";
}

function sortFields(row: {
  first_name: string | null;
  last_name: string | null;
  preferred_phone: string | null;
}): { sortFirst: string; sortLast: string; letter: string } {
  const first = (row.first_name || "").trim();
  const last = (row.last_name || row.first_name || "").trim();
  const sortFirst = first || row.preferred_phone || "Unknown";
  const sortLast = last || row.preferred_phone || "Unknown";
  const letterSrc = sortLast;
  const ch = letterSrc.charAt(0).toUpperCase();
  const letter = ch >= "A" && ch <= "Z" ? ch : "#";
  return { sortFirst, sortLast, letter };
}

/** Contact groups (GUI "Groups"). Stored in SQLite `tags` / `contact_tags`. */
export function listGroups(): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT name FROM tags
       ORDER BY name COLLATE NOCASE`,
    )
    .all() as Array<{ name: string }>;
  return rows
    .map((r) => r.name)
    .filter((name) => !RESERVED_GROUP_NAMES.has(name.trim().toLowerCase()));
}

export function groupFromSlug(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  for (const name of listGroups()) {
    if (groupSlug(name) === normalized) return name;
  }
  return null;
}

const CONTACT_HAS_MESSAGES_SQL = `
  EXISTS (
    SELECT 1
    FROM contact_phones cp
    WHERE cp.contact_id = c.id
      AND (
        EXISTS (
          SELECT 1
          FROM conversations cv
          JOIN messages m ON m.conversation_id = cv.id
          WHERE cv.conv_type = 'individual'
            AND cv.chat_identifier = cp.phone_e164
        )
        OR EXISTS (
          SELECT 1
          FROM participants p
          JOIN messages m ON m.conversation_id = p.conversation_id
          WHERE p.handle = cp.phone_e164
        )
      )
  )
`;

function sectionSql(section: ContactSection): { sql: string; params: unknown[] } {
  if (typeof section === "object" && "group" in section) {
    // Exclude and no-messages override groups: those contacts only appear under
    // their implicit sections.
    return {
      sql: `
        SELECT DISTINCT c.*
        FROM contacts c
        JOIN contact_tags ct ON ct.contact_id = c.id
        JOIN tags t ON t.id = ct.tag_id AND t.name = ?
        WHERE c.exclude = 0
          AND ${CONTACT_HAS_MESSAGES_SQL}
      `,
      params: [section.group],
    };
  }
  switch (section) {
    case "all":
      return {
        sql: `
          SELECT DISTINCT c.*
          FROM contacts c
          WHERE c.exclude = 0
            AND ${CONTACT_HAS_MESSAGES_SQL}
        `,
        params: [],
      };
    case "excluded":
      // Excluded overrides no-messages: all excluded contacts live here.
      return {
        sql: `
          SELECT DISTINCT c.*
          FROM contacts c
          WHERE c.exclude = 1
        `,
        params: [],
      };
    case "no-messages":
      // Includes excluded contacts with no messages (they also appear under Excluded).
      return {
        sql: `
          SELECT DISTINCT c.*
          FROM contacts c
          WHERE NOT (${CONTACT_HAS_MESSAGES_SQL})
        `,
        params: [],
      };
    case "no-group":
      return {
        sql: `
          SELECT DISTINCT c.*
          FROM contacts c
          WHERE c.exclude = 0
            AND NOT EXISTS (
              SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id
            )
            AND ${CONTACT_HAS_MESSAGES_SQL}
        `,
        params: [],
      };
  }
}

export function listContacts(section: ContactSection): ContactListItem[] {
  const db = getDb();
  const { sql, params } = sectionSql(section);
  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    first_name: string | null;
    last_name: string | null;
    preferred_phone: string | null;
    exclude: number;
  }>;

  const tagRows = db
    .prepare(
      `SELECT ct.contact_id AS contact_id, t.name AS name
       FROM contact_tags ct
       JOIN tags t ON t.id = ct.tag_id
       ORDER BY t.name COLLATE NOCASE`,
    )
    .all() as Array<{ contact_id: number; name: string }>;
  const tagsByContact = new Map<number, string[]>();
  for (const row of tagRows) {
    const list = tagsByContact.get(row.contact_id);
    if (list) list.push(row.name);
    else tagsByContact.set(row.contact_id, [row.name]);
  }

  const messageCounts = contactMessageCountsById(rows.map((r) => r.id));

  return rows
    .map((row) => {
      const name = displayName(row);
      const sorts = sortFields(row);
      return {
        id: row.id,
        displayName: name,
        preferredPhone: row.preferred_phone,
        firstName: row.first_name,
        lastName: row.last_name,
        groups: tagsByContact.get(row.id) ?? [],
        exclude: row.exclude !== 0,
        messageCount: messageCounts.get(row.id) ?? 0,
        ...sorts,
      };
    })
    .sort(
      (a, b) =>
        a.sortLast.localeCompare(b.sortLast, undefined, { sensitivity: "base" }) ||
        a.sortFirst.localeCompare(b.sortFirst, undefined, { sensitivity: "base" }),
    );
}

export function getContact(id: number): ContactDetail | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, first_name, last_name, exclude, preferred_phone
       FROM contacts WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number;
        first_name: string | null;
        last_name: string | null;
        exclude: number;
        preferred_phone: string | null;
      }
    | undefined;
  if (!row) return null;

  const phones = db
    .prepare(`SELECT phone_e164 FROM contact_phones WHERE contact_id = ? ORDER BY phone_e164`)
    .all(id) as Array<{ phone_e164: string }>;

  const groups = db
    .prepare(
      `SELECT t.name FROM contact_tags ct
       JOIN tags t ON t.id = ct.tag_id
       WHERE ct.contact_id = ?
       ORDER BY t.name COLLATE NOCASE`,
    )
    .all(id) as Array<{ name: string }>;

  const phoneList = phones.map((p) => p.phone_e164);
  const dateRange = contactDateRange(phoneList);
  const messageCount = contactMessageSourceCountsForConversations(
    contactIndividualConversationIds(phoneList),
  ).all;

  const sorts = sortFields(row);
  return {
    id: row.id,
    displayName: displayName(row),
    preferredPhone: row.preferred_phone,
    firstName: row.first_name,
    lastName: row.last_name,
    exclude: row.exclude !== 0,
    groups: groups.map((t) => t.name),
    phones: phoneList,
    dateStart: dateRange?.start ?? null,
    dateEnd: dateRange?.end ?? null,
    messageCount,
    ...sorts,
  };
}

function contactDateRange(
  phones: string[],
): { start: string; end: string } | null {
  if (!phones.length) return null;
  const db = getDb();
  const placeholders = phones.map(() => "?").join(",");
  const hideDupes = hasDuplicateOfColumn() ? " AND m.duplicate_of IS NULL" : "";
  const row = db
    .prepare(
      `SELECT MIN(substr(m.timestamp, 1, 10)) AS start, MAX(substr(m.timestamp, 1, 10)) AS end
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.conv_type = 'individual'
         AND c.chat_identifier IN (${placeholders})${hideDupes}`,
    )
    .get(...phones) as { start: string | null; end: string | null } | undefined;
  if (!row?.start || !row?.end) return null;
  return { start: row.start, end: row.end };
}

function contactPhones(contactId: number): string[] {
  const db = getDb();
  return (
    db
      .prepare(`SELECT phone_e164 FROM contact_phones WHERE contact_id = ?`)
      .all(contactId) as Array<{ phone_e164: string }>
  ).map((r) => r.phone_e164);
}

function contactIndividualConversationIds(phones: string[]): number[] {
  if (!phones.length) return [];
  const db = getDb();
  const placeholders = phones.map(() => "?").join(",");
  return (
    db
      .prepare(
        `SELECT id FROM conversations
         WHERE conv_type = 'individual' AND chat_identifier IN (${placeholders})`,
      )
      .all(...phones) as Array<{ id: number }>
  ).map((r) => r.id);
}

function contactConversationIds(phones: string[]): number[] {
  const db = getDb();
  const placeholders = phones.map(() => "?").join(",");
  const individual = contactIndividualConversationIds(phones);
  const groups = db
    .prepare(
      `SELECT DISTINCT c.id AS id
       FROM conversations c
       JOIN participants p ON p.conversation_id = c.id
       WHERE c.conv_type = 'group' AND p.handle IN (${placeholders})`,
    )
    .all(...phones) as Array<{ id: number }>;
  const ids = new Set<number>(individual);
  for (const r of groups) ids.add(r.id);
  return [...ids];
}

type ContactSourceCounts = {
  /** Soft-deduped 1:1 total (Combined view). Group chats are listed separately. */
  all: number;
  /** Per-source 1:1 totals (single-source view; includes soft-hidden copies). */
  bySource: Record<string, number>;
};

function contactMessageSourceCountsForConversations(
  conversationIds: number[],
): ContactSourceCounts {
  if (!conversationIds.length) {
    return { all: 0, bySource: {} };
  }
  const db = getDb();
  const placeholders = conversationIds.map(() => "?").join(",");
  const bySource: Record<string, number> = {};
  const sourceRows = db
    .prepare(
      `SELECT source, COUNT(*) AS n
       FROM messages
       WHERE conversation_id IN (${placeholders})
       GROUP BY source`,
    )
    .all(...conversationIds) as Array<{ source: string; n: number }>;
  for (const r of sourceRows) {
    if (r.source) bySource[r.source] = r.n;
  }

  const hideDupes = hasDuplicateOfColumn()
    ? " AND duplicate_of IS NULL"
    : "";
  const allRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages
       WHERE conversation_id IN (${placeholders})${hideDupes}`,
    )
    .get(...conversationIds) as { n: number };
  return { all: allRow.n, bySource };
}

/** Soft-deduped 1:1 message totals for many contacts (Combined view). */
function contactMessageCountsById(
  contactIds: number[],
): Map<number, number> {
  const counts = new Map<number, number>();
  if (!contactIds.length) return counts;
  const db = getDb();
  const placeholders = contactIds.map(() => "?").join(",");
  const hideDupes = hasDuplicateOfColumn()
    ? " AND m.duplicate_of IS NULL"
    : "";
  const rows = db
    .prepare(
      `SELECT cp.contact_id AS contact_id, COUNT(m.id) AS n
       FROM contact_phones cp
       JOIN conversations c
         ON c.chat_identifier = cp.phone_e164
        AND c.conv_type = 'individual'
       JOIN messages m ON m.conversation_id = c.id
       WHERE cp.contact_id IN (${placeholders})${hideDupes}
       GROUP BY cp.contact_id`,
    )
    .all(...contactIds) as Array<{ contact_id: number; n: number }>;
  for (const r of rows) counts.set(r.contact_id, r.n);
  return counts;
}

/** One contact open: yearly + groups + available sources with shared phone/conv lookups. */
export function contactThreadsBundle(
  contactId: number,
  source?: string | null,
): {
  yearly: YearThread[];
  groups: GroupThread[];
  messageSources: string[];
  sourceCounts: ContactSourceCounts;
} {
  const phones = contactPhones(contactId);
  if (!phones.length) {
    return {
      yearly: [],
      groups: [],
      messageSources: [],
      sourceCounts: { all: 0, bySource: {} },
    };
  }
  const allConvIds = contactConversationIds(phones);
  const individualIds = contactIndividualConversationIds(phones);
  const sourceCounts =
    contactMessageSourceCountsForConversations(individualIds);
  // Enable sources that appear in 1:1 or groups so group-only archives stay selectable.
  const anySourceCounts =
    contactMessageSourceCountsForConversations(allConvIds);
  return {
    yearly: contactYearlyThreadsForPhones(phones, source),
    groups: contactGroupThreadsForPhones(phones, source),
    messageSources: Object.keys(anySourceCounts.bySource).sort(),
    sourceCounts,
  };
}

function contactYearlyThreadsForPhones(
  phones: string[],
  source?: string | null,
): YearThread[] {
  if (!phones.length) return [];
  const db = getDb();
  const placeholders = phones.map(() => "?").join(",");
  const sourceSql = source ? " AND m.source = ?" : "";
  const params: Array<string | number> = [...phones];
  if (source) params.push(source);
  const rows = db
    .prepare(
      `SELECT CAST(substr(m.timestamp, 1, 4) AS INTEGER) AS year,
              COUNT(*) AS message_count,
              MIN(substr(m.timestamp, 1, 10)) AS date_start,
              MAX(substr(m.timestamp, 1, 10)) AS date_end,
              GROUP_CONCAT(DISTINCT c.id) AS conversation_ids
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.id
       WHERE c.conv_type = 'individual'
         AND c.chat_identifier IN (${placeholders})${sourceSql}${combinedDedupeSql(source, "m")}
       GROUP BY year
       ORDER BY year DESC`,
    )
    .all(...params) as Array<{
    year: number;
    message_count: number;
    date_start: string;
    date_end: string;
    conversation_ids: string;
  }>;

  return rows.map((r) => ({
    year: r.year,
    messageCount: r.message_count,
    dateStart: r.date_start,
    dateEnd: r.date_end,
    conversationIds: r.conversation_ids
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id)),
  }));
}

const MAX_VISIBLE_NAMES = 8;

function isGenericGroupTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const t = title.trim();
  if (!t) return true;
  // iMessage chat identifiers look like chat31771234567890...
  if (/^chat\d+/i.test(t)) return true;
  return false;
}

function looksLikePhone(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (t.startsWith("+") && /^[+\d\s().-]+$/.test(t)) return true;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 7 && digits.length === t.replace(/[\s().+-]/g, "").length;
}

/** Prefer a real display hint; ignore phones and placeholder "(Unknown)" labels. */
function usefulNameHint(
  hint: string | null | undefined,
  handle: string | null | undefined,
): string | null {
  const t = hint?.trim() || null;
  if (!t) return null;
  if (looksLikePhone(t)) return null;
  if (handle && t.toLowerCase() === handle.toLowerCase()) return null;
  if (/^\(?unknown\)?$/i.test(t)) return null;
  return t;
}

function participantLabel(row: {
  first_name: string | null;
  last_name: string | null;
  name_hint: string | null;
  handle: string;
}): { name: string; unknown: boolean } {
  const first = row.first_name?.trim() ?? "";
  const last = row.last_name?.trim() ?? "";
  const full = `${first} ${last}`.trim();
  if (full) return { name: full, unknown: false };
  const hint = usefulNameHint(row.name_hint, row.handle);
  if (hint) return { name: hint, unknown: false };
  return { name: row.handle, unknown: true };
}

function formatPeopleTitle(
  labels: Array<{ name: string; unknown: boolean }>,
): {
  short: string;
  full: string;
  count: number;
} {
  const seen = new Set<string>();
  const unique: Array<{ name: string; unknown: boolean }> = [];
  for (const label of labels) {
    if (!label.name || seen.has(label.name)) continue;
    seen.add(label.name);
    unique.push(label);
  }

  unique.sort((a, b) => {
    if (a.unknown !== b.unknown) return a.unknown ? 1 : -1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const names = unique.map((l) => l.name);
  const sep = "\u00a0\u00a0·\u00a0\u00a0";
  const full = names.join(sep);
  if (names.length === 0) {
    return { short: "Group chat", full: "Group chat", count: 0 };
  }
  if (names.length <= MAX_VISIBLE_NAMES) {
    return { short: full, full, count: names.length };
  }
  const shown = names.slice(0, MAX_VISIBLE_NAMES).join(sep);
  return {
    short: `${shown}\u00a0\u00a0+${names.length - MAX_VISIBLE_NAMES}`,
    full,
    count: names.length,
  };
}

type GroupPeopleTitle = {
  title: string;
  titleFull: string;
  namedTitle: string | null;
  participantCount: number;
  participantNames: string[];
  participantHandles: string[];
};

/** Resolve people labels for group conversations, excluding owner (+ optional focus contact). */
function groupPeopleTitles(
  conversationIds: number[],
  excludePhones: string[] = [],
): Map<number, GroupPeopleTitle> {
  const out = new Map<number, GroupPeopleTitle>();
  if (!conversationIds.length) return out;

  const db = getDb();
  const owner = loadOwner();
  const exclude = new Set(
    [owner.phone_e164, ...excludePhones].filter(Boolean).map((p) => p.trim()),
  );

  const placeholders = conversationIds.map(() => "?").join(",");
  const meta = db
    .prepare(
      `SELECT id, group_title FROM conversations WHERE id IN (${placeholders})`,
    )
    .all(...conversationIds) as Array<{ id: number; group_title: string | null }>;
  const namedById = new Map(
    meta.map((r) => [
      r.id,
      isGenericGroupTitle(r.group_title) ? null : (r.group_title?.trim() ?? null),
    ]),
  );

  const rows = db
    .prepare(
      `SELECT p.conversation_id, p.handle, p.name_hint,
              c.first_name, c.last_name
       FROM participants p
       LEFT JOIN contact_phones cp ON cp.phone_e164 = p.handle
       LEFT JOIN contacts c ON c.id = cp.contact_id
       WHERE p.conversation_id IN (${placeholders})`,
    )
    .all(...conversationIds) as Array<{
    conversation_id: number;
    handle: string;
    name_hint: string | null;
    first_name: string | null;
    last_name: string | null;
  }>;

  const byConv = new Map<
    number,
    Array<{ name: string; unknown: boolean; handle: string }>
  >();
  for (const r of rows) {
    const handle = r.handle.trim();
    if (exclude.has(handle)) continue;
    const list = byConv.get(r.conversation_id) ?? [];
    list.push({ ...participantLabel(r), handle });
    byConv.set(r.conversation_id, list);
  }

  for (const id of conversationIds) {
    const entries = byConv.get(id) ?? [];
    const people = formatPeopleTitle(entries);
    const namedTitle = namedById.get(id) ?? null;
    const nameSeen = new Set<string>();
    const participantNames: string[] = [];
    const handleSeen = new Set<string>();
    const participantHandles: string[] = [];
    for (const e of entries) {
      if (e.name && !nameSeen.has(e.name)) {
        nameSeen.add(e.name);
        participantNames.push(e.name);
      }
      if (e.handle && !handleSeen.has(e.handle)) {
        handleSeen.add(e.handle);
        participantHandles.push(e.handle);
      }
    }
    out.set(id, {
      title: people.short,
      titleFull: namedTitle ? `${namedTitle}\n${people.full}` : people.full,
      namedTitle,
      participantCount: people.count,
      participantNames,
      participantHandles,
    });
  }
  return out;
}

function contactGroupThreadsForPhones(
  phones: string[],
  source?: string | null,
): GroupThread[] {
  if (!phones.length) return [];
  const db = getDb();
  const placeholders = phones.map(() => "?").join(",");
  const sourceSql = source ? " AND m.source = ?" : "";
  const params: Array<string | number> = [...phones];
  if (source) params.push(source);
  const hasTrash = hasTrashedConversationsTable(db);
  const trashFilter = hasTrash
    ? `AND NOT EXISTS (
         SELECT 1 FROM trashed_conversations tc WHERE tc.conversation_id = c.id
       )`
    : "";
  const rows = db
    .prepare(
      `SELECT c.id AS conversation_id,
              CAST(substr(m.timestamp, 1, 4) AS INTEGER) AS year,
              COUNT(*) AS message_count,
              MIN(substr(m.timestamp, 1, 10)) AS date_start,
              MAX(substr(m.timestamp, 1, 10)) AS date_end
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.id
       WHERE c.conv_type = 'group'
         AND EXISTS (
           SELECT 1 FROM participants p
           WHERE p.conversation_id = c.id AND p.handle IN (${placeholders})
         )${trashFilter}${sourceSql}${combinedDedupeSql(source, "m")}
       GROUP BY c.id, year
       HAVING message_count > 0
       ORDER BY year DESC, c.id`,
    )
    .all(...params) as Array<{
    conversation_id: number;
    year: number;
    message_count: number;
    date_start: string;
    date_end: string;
  }>;

  const conversationIds = [...new Set(rows.map((r) => r.conversation_id))];
  const titles = groupPeopleTitles(conversationIds, phones);
  const fingerprints = groupParticipantFingerprints(conversationIds);

  const mapped = rows.map((r) => {
    const t = titles.get(r.conversation_id) ?? {
      title: "Group chat",
      titleFull: "Group chat",
      namedTitle: null,
      participantCount: 0,
      participantNames: [] as string[],
      participantHandles: [] as string[],
    };
    return {
      conversationId: r.conversation_id,
      conversationIds: [r.conversation_id],
      title: t.title,
      titleFull: t.titleFull,
      namedTitle: t.namedTitle,
      participantCount: t.participantCount,
      year: r.year,
      messageCount: r.message_count,
      dateStart: r.date_start,
      dateEnd: r.date_end,
      fingerprint: fingerprints.get(r.conversation_id) ?? `id:${r.conversation_id}`,
    };
  });

  // Combined view: collapse the same people across exporters into one row.
  if (source) {
    return mapped.map(({ fingerprint: _fp, ...rest }) => rest);
  }

  const byKey = new Map<string, (typeof mapped)[number]>();
  for (const row of mapped) {
    const key = `${row.year}|${row.fingerprint}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row, conversationIds: [...row.conversationIds] });
      continue;
    }
    for (const id of row.conversationIds) {
      if (!existing.conversationIds.includes(id)) {
        existing.conversationIds.push(id);
      }
    }
    existing.messageCount += row.messageCount;
    if (row.dateStart < existing.dateStart) existing.dateStart = row.dateStart;
    if (row.dateEnd > existing.dateEnd) existing.dateEnd = row.dateEnd;
    if (row.participantCount > existing.participantCount) {
      existing.participantCount = row.participantCount;
      existing.title = row.title;
      existing.titleFull = row.titleFull;
      existing.namedTitle = row.namedTitle;
    }
  }

  // Recount soft-deduped messages across merged conversation ids so we don't
  // sum pre-dedupe copies when duplicate_of is not yet set / partially set.
  const merged = [...byKey.values()].map(({ fingerprint: _fp, ...rest }) => {
    if (rest.conversationIds.length === 1) return rest;
    const stats = groupYearStatsForConversations(
      rest.conversationIds,
      rest.year,
      source,
    );
    return {
      ...rest,
      conversationId: rest.conversationIds[0]!,
      messageCount: stats.messageCount,
      dateStart: stats.dateStart || rest.dateStart,
      dateEnd: stats.dateEnd || rest.dateEnd,
    };
  });

  merged.sort((a, b) => b.year - a.year || a.conversationId - b.conversationId);
  return merged;
}

function groupParticipantFingerprints(
  conversationIds: number[],
): Map<number, string> {
  const out = new Map<number, string>();
  if (!conversationIds.length) return out;
  const db = getDb();
  const placeholders = conversationIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT conversation_id, handle
       FROM participants
       WHERE conversation_id IN (${placeholders})
         AND handle IS NOT NULL AND handle != ''
       ORDER BY conversation_id, handle`,
    )
    .all(...conversationIds) as Array<{ conversation_id: number; handle: string }>;
  const byConv = new Map<number, string[]>();
  for (const r of rows) {
    const list = byConv.get(r.conversation_id) ?? [];
    list.push(r.handle.trim());
    byConv.set(r.conversation_id, list);
  }
  for (const id of conversationIds) {
    const handles = [...new Set(byConv.get(id) ?? [])].sort();
    out.set(id, handles.length ? `group:${handles.join("|")}` : `id:${id}`);
  }
  return out;
}

function groupYearStatsForConversations(
  conversationIds: number[],
  year: number,
  source?: string | null,
): { messageCount: number; dateStart: string; dateEnd: string } {
  const db = getDb();
  const placeholders = conversationIds.map(() => "?").join(",");
  const sourceSql = source ? " AND source = ?" : "";
  const params: Array<string | number> = [
    ...conversationIds,
    `${year}-`,
    `${year + 1}-`,
  ];
  if (source) params.push(source);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS message_count,
              MIN(substr(timestamp, 1, 10)) AS date_start,
              MAX(substr(timestamp, 1, 10)) AS date_end
       FROM messages
       WHERE conversation_id IN (${placeholders})
         AND timestamp >= ? AND timestamp < ?${sourceSql}${combinedDedupeSql(source)}`,
    )
    .get(...params) as {
    message_count: number;
    date_start: string | null;
    date_end: string | null;
  };
  return {
    messageCount: row.message_count,
    dateStart: row.date_start ?? "",
    dateEnd: row.date_end ?? "",
  };
}

/** Group chats split by calendar year for the Groups page list. */
export function listGroupYearRows(): GroupYearRow[] {
  // Re-open after API writes (trash/restore) so RSC sees committed rows.
  resetDb();
  return listGroupYearRowsSection("active");
}

/** Trashed group chats split by calendar year. */
export function listTrashedGroupYearRows(): GroupYearRow[] {
  resetDb();
  return listGroupYearRowsSection("trash");
}

function hasTrashedConversationsTable(db: Database.Database): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master
       WHERE type = 'table' AND name = 'trashed_conversations'`,
    )
    .get() as { n: number };
  return row.n > 0;
}

function listGroupYearRowsSection(
  section: "active" | "trash",
): GroupYearRow[] {
  const db = getDb();
  const joinDupes = hasDuplicateOfColumn()
    ? " AND m.duplicate_of IS NULL"
    : "";
  const hasTrash = hasTrashedConversationsTable(db);
  if (section === "trash" && !hasTrash) return [];

  const trashFilter = !hasTrash
    ? ""
    : section === "trash"
      ? `AND EXISTS (
           SELECT 1 FROM trashed_conversations tc WHERE tc.conversation_id = c.id
         )`
      : `AND NOT EXISTS (
           SELECT 1 FROM trashed_conversations tc WHERE tc.conversation_id = c.id
         )`;

  const rows = db
    .prepare(
      `SELECT c.id,
              CAST(substr(m.timestamp, 1, 4) AS INTEGER) AS year,
              COUNT(m.id) AS message_count,
              MIN(substr(m.timestamp, 1, 10)) AS date_start,
              MAX(substr(m.timestamp, 1, 10)) AS date_end
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.id${joinDupes}
       WHERE c.conv_type = 'group'
         ${trashFilter}
       GROUP BY c.id, year
       HAVING message_count > 0`,
    )
    .all() as Array<{
    id: number;
    year: number;
    message_count: number;
    date_start: string;
    date_end: string;
  }>;

  if (!rows.length) return [];

  const conversationIds = [...new Set(rows.map((r) => r.id))];
  const titles = groupPeopleTitles(conversationIds);

  const yearsByConv = new Map<number, Set<number>>();
  const rangeByConv = new Map<
    number,
    { dateStart: string; dateEnd: string }
  >();
  for (const r of rows) {
    const years = yearsByConv.get(r.id) ?? new Set<number>();
    years.add(r.year);
    yearsByConv.set(r.id, years);

    const range = rangeByConv.get(r.id);
    if (!range) {
      rangeByConv.set(r.id, {
        dateStart: r.date_start,
        dateEnd: r.date_end,
      });
    } else {
      if (r.date_start < range.dateStart) range.dateStart = r.date_start;
      if (r.date_end > range.dateEnd) range.dateEnd = r.date_end;
    }
  }

  const emptyTitle = {
    title: "Group chat",
    titleFull: "Group chat",
    namedTitle: null as string | null,
    participantCount: 0,
    participantNames: [] as string[],
    participantHandles: [] as string[],
  };

  const items: GroupYearRow[] = rows.map((r) => {
    const t = titles.get(r.id) ?? emptyTitle;
    const range = rangeByConv.get(r.id)!;
    const yearCount = yearsByConv.get(r.id)?.size ?? 1;
    return {
      id: r.id,
      year: r.year,
      title: t.title,
      titleFull: t.titleFull,
      namedTitle: t.namedTitle,
      participantCount: t.participantCount,
      participantNames: t.participantNames,
      participantHandles: t.participantHandles,
      messageCount: r.message_count,
      dateStart: r.date_start,
      dateEnd: r.date_end,
      conversationDateStart: range.dateStart,
      conversationDateEnd: range.dateEnd,
      spansMultipleYears: yearCount > 1,
    };
  });

  items.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    const byEnd = b.dateEnd.localeCompare(a.dateEnd);
    if (byEnd !== 0) return byEnd;
    const byStart = b.dateStart.localeCompare(a.dateStart);
    if (byStart !== 0) return byStart;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
  return items;
}

export function messagesForConversationYear(
  conversationIds: number | number[],
  year: number,
  source?: string | null,
): MessageRow[] {
  return loadConversationMessages(conversationIds, {
    year,
    source,
    order: "asc",
  });
}

/** All messages for conversation(s), newest first (no year filter). */
export function messagesForConversations(
  conversationIds: number | number[],
  source?: string | null,
): MessageRow[] {
  return loadConversationMessages(conversationIds, {
    source,
    order: "desc",
  });
}

function loadConversationMessages(
  conversationIds: number | number[],
  opts: {
    year?: number;
    source?: string | null;
    order: "asc" | "desc";
  },
): MessageRow[] {
  const ids = (
    Array.isArray(conversationIds) ? conversationIds : [conversationIds]
  ).filter((id) => Number.isFinite(id));
  if (!ids.length) return [];
  const db = getDb();
  const owner = loadOwner();
  const placeholders = ids.map(() => "?").join(",");
  const sourceSql = opts.source ? " AND m.source = ?" : "";
  const yearSql =
    opts.year != null ? " AND m.timestamp >= ? AND m.timestamp < ?" : "";
  const orderSql =
    opts.order === "desc"
      ? "ORDER BY m.timestamp DESC, m.sort_order DESC"
      : "ORDER BY m.timestamp, m.sort_order";

  const params: Array<string | number> = [...ids];
  if (opts.year != null) {
    params.push(`${opts.year}-`, `${opts.year + 1}-`);
  }
  if (opts.source) params.push(opts.source);

  const rows = db
    .prepare(
      `SELECT m.id, m.source, m.timestamp, m.is_from_me, m.sender, m.body, m.is_announcement,
              c.first_name, c.last_name, c.preferred_phone,
              p.name_hint
       FROM messages m
       LEFT JOIN contact_phones cp ON cp.phone_e164 = m.sender
       LEFT JOIN contacts c ON c.id = cp.contact_id
       LEFT JOIN participants p
         ON p.conversation_id = m.conversation_id AND p.handle = m.sender
       WHERE m.conversation_id IN (${placeholders})${yearSql}${sourceSql}${combinedDedupeSql(opts.source, "m")}
       ${orderSql}`,
    )
    .all(...params) as Array<{
    id: number;
    source: string;
    timestamp: string;
    is_from_me: number;
    sender: string | null;
    body: string | null;
    is_announcement: number;
    first_name: string | null;
    last_name: string | null;
    preferred_phone: string | null;
    name_hint: string | null;
  }>;

  const attsByMsg = new Map<
    number,
    Array<{
      id: number;
      mimeType: string | null;
      originalName: string | null;
      assetsPath: string | null;
      sha256: string | null;
      derivedMimeType: string | null;
      derivedAssetsPath: string | null;
      derivedSha256: string | null;
    }>
  >();
  if (rows.length) {
    const msgIds = rows.map((r) => r.id);
    const chunkSize = 400;
    for (let i = 0; i < msgIds.length; i += chunkSize) {
      const chunk = msgIds.slice(i, i + chunkSize);
      const attPlaceholders = chunk.map(() => "?").join(",");
      const attRows = db
        .prepare(
          `SELECT message_id, id, mime_type, original_name, assets_path, sha256,
                  derived_mime_type, derived_assets_path, derived_sha256
           FROM attachments
           WHERE message_id IN (${attPlaceholders})
           ORDER BY message_id, id`,
        )
        .all(...chunk) as Array<{
        message_id: number;
        id: number;
        mime_type: string | null;
        original_name: string | null;
        assets_path: string | null;
        sha256: string | null;
        derived_mime_type: string | null;
        derived_assets_path: string | null;
        derived_sha256: string | null;
      }>;
      for (const a of attRows) {
        const list = attsByMsg.get(a.message_id) ?? [];
        list.push({
          id: a.id,
          mimeType: a.mime_type,
          originalName: a.original_name,
          assetsPath: a.assets_path,
          sha256: a.sha256,
          derivedMimeType: a.derived_mime_type,
          derivedAssetsPath: a.derived_assets_path,
          derivedSha256: a.derived_sha256,
        });
        attsByMsg.set(a.message_id, list);
      }
    }
  }

  return rows.map((r) => {
    const isFromMe = r.is_from_me !== 0;
    let senderName: string;
    if (isFromMe) {
      senderName = owner.display_name;
    } else {
      senderName = displayName({
        first_name: r.first_name,
        last_name: r.last_name,
        preferred_phone: r.preferred_phone ?? r.sender,
      });
      if (senderName === (r.preferred_phone ?? r.sender)) {
        const hint = usefulNameHint(r.name_hint, r.sender);
        if (hint) senderName = hint;
      }
    }

    return {
      id: r.id,
      source: r.source,
      timestamp: r.timestamp,
      isFromMe,
      sender: r.sender,
      senderName,
      body: r.body,
      isAnnouncement: r.is_announcement !== 0,
      attachments: attsByMsg.get(r.id) ?? [],
    };
  });
}

export function homeStats(): HomeStats {
  const db = getDb();
  const hasTrash = hasTrashedConversationsTable(db);
  const trashFilter = hasTrash
    ? `AND NOT EXISTS (
         SELECT 1 FROM trashed_conversations tc WHERE tc.conversation_id = c.id
       )`
    : "";
  const joinDupes = hasDuplicateOfColumn()
    ? " AND m.duplicate_of IS NULL"
    : "";
  const groupsRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT c.id
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id${joinDupes}
         WHERE c.conv_type = 'group'
           ${trashFilter}
         GROUP BY c.id
         HAVING COUNT(m.id) > 0
       )`,
    )
    .get() as { n: number };

  return {
    all: listContacts("all").length,
    excluded: listContacts("excluded").length,
    noMessages: listContacts("no-messages").length,
    unassigned: listUnassignedHandles().length,
    groups: groupsRow.n,
    messages: (
      db.prepare(`SELECT COUNT(*) AS n FROM messages`).get() as { n: number }
    ).n,
    contacts: (
      db.prepare(`SELECT COUNT(*) AS n FROM contacts`).get() as { n: number }
    ).n,
  };
}

/** 1:1 conversations with messages whose handle is not on any contact. */
export function listUnassignedHandles(): UnassignedHandle[] {
  return listHandleSection("unassigned");
}

/** Unassigned handles that were moved to Trash. */
export function listTrashedHandles(): UnassignedHandle[] {
  resetDb();
  return listHandleSection("trash");
}

function hasTrashedHandlesTable(db: Database.Database): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master
       WHERE type = 'table' AND name = 'trashed_handles'`,
    )
    .get() as { n: number };
  return row.n > 0;
}

function listHandleSection(section: "unassigned" | "trash"): UnassignedHandle[] {
  const db = getDb();
  const hideDupes = hasDuplicateOfColumn() ? " AND m.duplicate_of IS NULL" : "";
  const hasTrash = hasTrashedHandlesTable(db);
  if (section === "trash" && !hasTrash) return [];

  const trashFilter = !hasTrash
    ? ""
    : section === "trash"
      ? `AND EXISTS (
           SELECT 1 FROM trashed_handles th WHERE th.handle = c.chat_identifier
         )`
      : `AND NOT EXISTS (
           SELECT 1 FROM trashed_handles th WHERE th.handle = c.chat_identifier
         )`;

  const rows = db
    .prepare(
      `SELECT c.chat_identifier AS handle,
              MAX(p.name_hint) AS name_hint,
              COUNT(m.id) AS message_count,
              MIN(substr(m.timestamp, 1, 10)) AS date_start,
              MAX(substr(m.timestamp, 1, 10)) AS date_end
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.id
       LEFT JOIN participants p
         ON p.conversation_id = c.id AND p.handle = c.chat_identifier
       WHERE c.conv_type = 'individual'
         AND NOT EXISTS (
           SELECT 1 FROM contact_phones cp WHERE cp.phone_e164 = c.chat_identifier
         )
         ${trashFilter}${hideDupes}
       GROUP BY c.id
       HAVING message_count > 0
       ORDER BY handle COLLATE NOCASE`,
    )
    .all() as Array<{
    handle: string;
    name_hint: string | null;
    message_count: number;
    date_start: string | null;
    date_end: string | null;
  }>;

  return rows
    .map((r) => {
      const hintUseful = usefulNameHint(r.name_hint, r.handle);
      const displayName = hintUseful ?? r.handle;
      const sortKey = hintUseful ? `${hintUseful}\0${r.handle}` : r.handle;
      const ch = (hintUseful ?? r.handle).charAt(0).toUpperCase();
      const letter = ch >= "A" && ch <= "Z" ? ch : "#";
      return {
        handle: r.handle,
        displayName,
        nameHint: hintUseful,
        messageCount: r.message_count,
        dateStart: r.date_start,
        dateEnd: r.date_end,
        sortKey,
        letter,
      };
    })
    .sort((a, b) =>
      a.sortKey.localeCompare(b.sortKey, undefined, { sensitivity: "base" }),
    );
}

export function unassignedThreadsBundle(
  handle: string,
  source?: string | null,
): {
  handle: string;
  yearly: YearThread[];
  messageSources: string[];
  sourceCounts: ContactSourceCounts;
} | null {
  const trimmed = handle.trim();
  if (!trimmed) return null;
  const db = getDb();
  const conv = db
    .prepare(
      `SELECT id FROM conversations
       WHERE conv_type = 'individual' AND chat_identifier = ?`,
    )
    .get(trimmed) as { id: number } | undefined;
  if (!conv) return null;

  const owned = db
    .prepare(`SELECT 1 AS ok FROM contact_phones WHERE phone_e164 = ?`)
    .get(trimmed) as { ok: number } | undefined;
  if (owned) return null;

  const hasMsgs = db
    .prepare(
      `SELECT 1 AS ok FROM messages WHERE conversation_id = ? LIMIT 1`,
    )
    .get(conv.id) as { ok: number } | undefined;
  if (!hasMsgs) return null;

  const ids = [conv.id];
  const sourceCounts = contactMessageSourceCountsForConversations(ids);
  return {
    handle: trimmed,
    yearly: contactYearlyThreadsForPhones([trimmed], source),
    messageSources: Object.keys(sourceCounts.bySource).sort(),
    sourceCounts,
  };
}

/** All contacts for assign-to-existing pickers (includes excluded / no-messages). */
export function listContactsForPicker(): ContactListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, first_name, last_name, preferred_phone, exclude
       FROM contacts`,
    )
    .all() as Array<{
    id: number;
    first_name: string | null;
    last_name: string | null;
    preferred_phone: string | null;
    exclude: number;
  }>;

  const tagRows = db
    .prepare(
      `SELECT ct.contact_id AS contact_id, t.name AS name
       FROM contact_tags ct
       JOIN tags t ON t.id = ct.tag_id
       ORDER BY t.name COLLATE NOCASE`,
    )
    .all() as Array<{ contact_id: number; name: string }>;
  const tagsByContact = new Map<number, string[]>();
  for (const row of tagRows) {
    const list = tagsByContact.get(row.contact_id);
    if (list) list.push(row.name);
    else tagsByContact.set(row.contact_id, [row.name]);
  }

  return rows
    .map((row) => {
      const name = displayName(row);
      const sorts = sortFields(row);
      return {
        id: row.id,
        displayName: name,
        preferredPhone: row.preferred_phone,
        firstName: row.first_name,
        lastName: row.last_name,
        groups: tagsByContact.get(row.id) ?? [],
        exclude: row.exclude !== 0,
        messageCount: 0,
        ...sorts,
      };
    })
    .sort(
      (a, b) =>
        a.sortFirst.localeCompare(b.sortFirst, undefined, {
          sensitivity: "base",
        }) ||
        a.sortLast.localeCompare(b.sortLast, undefined, {
          sensitivity: "base",
        }),
    );
}
