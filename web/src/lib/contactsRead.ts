import {
  combinedDedupeSql,
  displayName,
  getDb,
  hasDuplicateOfColumn,
  sortFields,
} from "./dbCore";
import { groupSlug } from "./groupSlug";
import { contactGroupChatThreadsForPhones } from "./groupChatsRead";
import { RESERVED_GROUP_NAMES } from "./reservedGroups";
import type {
  ContactDetail,
  ContactListItem,
  ContactSection,
  GroupChatThread,
  YearThread,
} from "./types";

/** Contact groups (GUI "Groups"). Stored in SQLite `contact_groups` / `contact_group_members`. */
export function listGroups(): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT name FROM contact_groups
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
    FROM contact_handles cp
    WHERE cp.contact_id = c.id
      AND (
        EXISTS (
          SELECT 1
          FROM conversations cv
          JOIN messages m ON m.conversation_id = cv.id
          WHERE cv.conv_type = 'individual'
            AND cv.chat_identifier = cp.handle
        )
        OR EXISTS (
          SELECT 1
          FROM participants p
          JOIN messages m ON m.conversation_id = p.conversation_id
          WHERE p.handle = cp.handle
        )
      )
  )
`;

function sectionQueryBody(
  section: ContactSection,
): { fromWhere: string; params: unknown[] } {
  if (typeof section === "object" && "group" in section) {
    // Exclude and no-messages override groups: those contacts only appear under
    // their implicit sections.
    return {
      fromWhere: `
        FROM contacts c
        JOIN contact_group_members cgm ON cgm.contact_id = c.id
        JOIN contact_groups cg ON cg.id = cgm.group_id AND cg.name = ?
        WHERE c.exclude = 0
          AND ${CONTACT_HAS_MESSAGES_SQL}
      `,
      params: [section.group],
    };
  }
  switch (section) {
    case "contacts":
      // Innate set: All − Excluded (manage exclude only; this is derived).
      return {
        fromWhere: `
          FROM contacts c
          WHERE c.exclude = 0
            AND ${CONTACT_HAS_MESSAGES_SQL}
        `,
        params: [],
      };
    case "all":
      return {
        fromWhere: `
          FROM contacts c
          WHERE ${CONTACT_HAS_MESSAGES_SQL}
        `,
        params: [],
      };
    case "excluded":
      // Excluded overrides no-messages: all excluded contacts live here.
      return {
        fromWhere: `
          FROM contacts c
          WHERE c.exclude = 1
        `,
        params: [],
      };
    case "no-messages":
      // Includes excluded contacts with no messages (they also appear under Excluded).
      return {
        fromWhere: `
          FROM contacts c
          WHERE NOT (${CONTACT_HAS_MESSAGES_SQL})
        `,
        params: [],
      };
    case "no-group":
      return {
        fromWhere: `
          FROM contacts c
          WHERE c.exclude = 0
            AND NOT EXISTS (
              SELECT 1 FROM contact_group_members cgm WHERE cgm.contact_id = c.id
            )
            AND ${CONTACT_HAS_MESSAGES_SQL}
        `,
        params: [],
      };
  }
}

function sectionSql(section: ContactSection): { sql: string; params: unknown[] } {
  const { fromWhere, params } = sectionQueryBody(section);
  return {
    sql: `SELECT DISTINCT c.*
      ${fromWhere}`,
    params,
  };
}

export function listContacts(section: ContactSection): ContactListItem[] {
  const db = getDb();
  const { sql, params } = sectionSql(section);
  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    first_name: string | null;
    last_name: string | null;
    preferred_handle: string | null;
    exclude: number;
  }>;

  const groupRows = db
    .prepare(
      `SELECT cgm.contact_id AS contact_id, cg.name AS name
       FROM contact_group_members cgm
       JOIN contact_groups cg ON cg.id = cgm.group_id
       ORDER BY cg.name COLLATE NOCASE`,
    )
    .all() as Array<{ contact_id: number; name: string }>;
  const groupsByContact = new Map<number, string[]>();
  for (const row of groupRows) {
    const list = groupsByContact.get(row.contact_id);
    if (list) list.push(row.name);
    else groupsByContact.set(row.contact_id, [row.name]);
  }

  const messageCounts = contactMessageCountsById(rows.map((r) => r.id));

  return rows
    .map((row) => {
      const name = displayName(row);
      const sorts = sortFields(row);
      return {
        id: row.id,
        displayName: name,
        preferredHandle: row.preferred_handle,
        firstName: row.first_name,
        lastName: row.last_name,
        contactGroups: groupsByContact.get(row.id) ?? [],
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
      `SELECT id, first_name, last_name, exclude, preferred_handle
       FROM contacts WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number;
        first_name: string | null;
        last_name: string | null;
        exclude: number;
        preferred_handle: string | null;
      }
    | undefined;
  if (!row) return null;

  const phones = db
    .prepare(`SELECT handle FROM contact_handles WHERE contact_id = ? ORDER BY handle`)
    .all(id) as Array<{ handle: string }>;

  const groups = db
    .prepare(
      `SELECT cg.name FROM contact_group_members cgm
       JOIN contact_groups cg ON cg.id = cgm.group_id
       WHERE cgm.contact_id = ?
       ORDER BY cg.name COLLATE NOCASE`,
    )
    .all(id) as Array<{ name: string }>;

  const phoneList = phones.map((p) => p.handle);
  const dateRange = contactDateRange(phoneList);
  const messageCount = contactMessageSourceCountsForConversations(
    contactIndividualConversationIds(phoneList),
  ).all;

  const sorts = sortFields(row);
  return {
    id: row.id,
    displayName: displayName(row),
    preferredHandle: row.preferred_handle,
    firstName: row.first_name,
    lastName: row.last_name,
    exclude: row.exclude !== 0,
    contactGroups: groups.map((t) => t.name),
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
      .prepare(`SELECT handle FROM contact_handles WHERE contact_id = ?`)
      .all(contactId) as Array<{ handle: string }>
  ).map((r) => r.handle);
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

export type ContactSourceCounts = {
  /** Soft-deduped 1:1 total (Combined view). Group chats are listed separately. */
  all: number;
  /** Per-source 1:1 totals (single-source view; includes soft-hidden copies). */
  bySource: Record<string, number>;
};

export function contactMessageSourceCountsForConversations(
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
       FROM contact_handles cp
       JOIN conversations c
         ON c.chat_identifier = cp.handle
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
  groupChats: GroupChatThread[];
  messageSources: string[];
  sourceCounts: ContactSourceCounts;
} {
  const phones = contactPhones(contactId);
  if (!phones.length) {
    return {
      yearly: [],
      groupChats: [],
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
    groupChats: contactGroupChatThreadsForPhones(phones, source),
    messageSources: Object.keys(anySourceCounts.bySource).sort(),
    sourceCounts,
  };
}

export function contactYearlyThreadsForPhones(
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


export function countContacts(section: ContactSection): number {
  const db = getDb();
  const { fromWhere, params } = sectionQueryBody(section);
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT c.id) AS n
       ${fromWhere}`,
    )
    .get(...params) as { n: number };
  return row.n;
}


/** All contacts for assign-to-existing pickers (includes excluded / no-messages). */
export function listContactsForPicker(): ContactListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, first_name, last_name, preferred_handle, exclude
       FROM contacts`,
    )
    .all() as Array<{
    id: number;
    first_name: string | null;
    last_name: string | null;
    preferred_handle: string | null;
    exclude: number;
  }>;

  const groupRows = db
    .prepare(
      `SELECT cgm.contact_id AS contact_id, cg.name AS name
       FROM contact_group_members cgm
       JOIN contact_groups cg ON cg.id = cgm.group_id
       ORDER BY cg.name COLLATE NOCASE`,
    )
    .all() as Array<{ contact_id: number; name: string }>;
  const groupsByContact = new Map<number, string[]>();
  for (const row of groupRows) {
    const list = groupsByContact.get(row.contact_id);
    if (list) list.push(row.name);
    else groupsByContact.set(row.contact_id, [row.name]);
  }

  return rows
    .map((row) => {
      const name = displayName(row);
      const sorts = sortFields(row);
      return {
        id: row.id,
        displayName: name,
        preferredHandle: row.preferred_handle,
        firstName: row.first_name,
        lastName: row.last_name,
        contactGroups: groupsByContact.get(row.id) ?? [],
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

