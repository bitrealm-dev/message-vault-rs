import { getDb, hasDuplicateOfColumn, hasTrashedContactsTable } from "./dbCore";
import { countContacts } from "./contactsRead";
import { countGroupChats } from "./groupChatsRead";
import { countUnassignedHandles } from "./unassignedRead";
import type { HomeStats } from "./types";

export function homeStats(): HomeStats {
  const db = getDb();
  const notTrashed = hasTrashedContactsTable(db)
    ? `WHERE NOT EXISTS (
         SELECT 1 FROM trashed_contacts tc WHERE tc.contact_id = contacts.id
       )`
    : "";

  let messages: number;
  let messageDuplicates: number;
  if (hasDuplicateOfColumn()) {
    const row = db
      .prepare(
        `SELECT
           SUM(CASE WHEN duplicate_of IS NULL THEN 1 ELSE 0 END) AS primary_n,
           SUM(CASE WHEN duplicate_of IS NOT NULL THEN 1 ELSE 0 END) AS dup_n
         FROM messages`,
      )
      .get() as { primary_n: number | null; dup_n: number | null };
    messages = row.primary_n ?? 0;
    messageDuplicates = row.dup_n ?? 0;
  } else {
    messages = (
      db.prepare(`SELECT COUNT(*) AS n FROM messages`).get() as { n: number }
    ).n;
    messageDuplicates = 0;
  }

  return {
    included: countContacts("contacts"),
    all: countContacts("all"),
    excluded: countContacts("excluded"),
    noMessages: countContacts("no-messages"),
    unassigned: countUnassignedHandles(),
    groupChats: countGroupChats(),
    messages,
    messageDuplicates,
    contacts: (
      db
        .prepare(`SELECT COUNT(*) AS n FROM contacts ${notTrashed}`)
        .get() as { n: number }
    ).n,
  };
}
