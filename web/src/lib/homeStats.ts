import { getDb } from "./dbCore";
import { countContacts } from "./contactsRead";
import { countGroupChats } from "./groupChatsRead";
import { countUnassignedHandles } from "./unassignedRead";
import type { HomeStats } from "./types";

export function homeStats(): HomeStats {
  const db = getDb();
  return {
    all: countContacts("all"),
    excluded: countContacts("excluded"),
    noMessages: countContacts("no-messages"),
    unassigned: countUnassignedHandles(),
    groupChats: countGroupChats(),
    messages: (
      db.prepare(`SELECT COUNT(*) AS n FROM messages`).get() as { n: number }
    ).n,
    contacts: (
      db.prepare(`SELECT COUNT(*) AS n FROM contacts`).get() as { n: number }
    ).n,
  };
}
