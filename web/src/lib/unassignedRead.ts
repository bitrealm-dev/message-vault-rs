import {
  getDb,
  hasDuplicateOfColumn,
  hasTrashedHandlesTable,
  resetDb,
  usefulNameHint,
} from "./dbCore";
import {
  contactMessageSourceCountsForConversations,
  contactYearlyThreadsForPhones,
  type ContactSourceCounts,
} from "./contactsRead";
import type { UnassignedHandle, YearThread } from "./types";

export function countUnassignedHandles(): number {
  const db = getDb();
  const hideDupes = hasDuplicateOfColumn() ? " AND m.duplicate_of IS NULL" : "";
  const hasTrash = hasTrashedHandlesTable(db);
  const trashFilter = !hasTrash
    ? ""
    : `AND NOT EXISTS (
         SELECT 1 FROM trashed_handles th WHERE th.handle = c.chat_identifier
       )`;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT c.id
         FROM conversations c
         JOIN messages m ON m.conversation_id = c.id
         WHERE c.conversation_type = 'individual'
           AND NOT EXISTS (
             SELECT 1 FROM contact_handles cp WHERE cp.handle = c.chat_identifier
           )
           ${trashFilter}${hideDupes}
         GROUP BY c.id
         HAVING COUNT(m.id) > 0
       )`,
    )
    .get() as { n: number };
  return row.n;
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
       WHERE c.conversation_type = 'individual'
         AND NOT EXISTS (
           SELECT 1 FROM contact_handles cp WHERE cp.handle = c.chat_identifier
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
       WHERE conversation_type = 'individual' AND chat_identifier = ?`,
    )
    .get(trimmed) as { id: number } | undefined;
  if (!conv) return null;

  const owned = db
    .prepare(`SELECT 1 AS ok FROM contact_handles WHERE handle = ?`)
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

