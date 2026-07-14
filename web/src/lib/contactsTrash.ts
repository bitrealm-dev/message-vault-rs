import Database from "better-sqlite3";
import { dbPath } from "./paths";
import { getContact, resetDb } from "./db";
import { deleteContacts } from "./contactsWrite";
import { trashHandlesInDb } from "./handlesWrite";

function ensureTrashedContactsTable(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS trashed_contacts (
       contact_id INTEGER PRIMARY KEY,
       trashed_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );
}

function ensureTrashedHandlesTable(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS trashed_handles (
       handle TEXT PRIMARY KEY,
       trashed_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );
}

function contactHandles(db: Database.Database, contactId: number): string[] {
  return (
    db
      .prepare(`SELECT handle FROM contact_handles WHERE contact_id = ?`)
      .all(contactId) as Array<{ handle: string }>
  ).map((r) => r.handle);
}

/** Handles on a contact that have at least one 1:1 message. */
function contactHandlesWithMessages(
  db: Database.Database,
  contactId: number,
): string[] {
  return (
    db
      .prepare(
        `SELECT cp.handle AS handle
         FROM contact_handles cp
         WHERE cp.contact_id = ?
           AND EXISTS (
             SELECT 1
             FROM conversations c
             JOIN messages m ON m.conversation_id = c.id
             WHERE c.conversation_type = 'individual'
               AND c.chat_identifier = cp.handle
           )`,
      )
      .all(contactId) as Array<{ handle: string }>
  ).map((r) => r.handle);
}

function assertContactsExist(ids: number[]): void {
  for (const id of ids) {
    if (!getContact(id)) {
      throw new Error(`contact ${id} not found`);
    }
  }
}

/** Soft-trash contacts and all of their 1:1 handles. */
export function trashContactWithMessages(ids: number[]): number {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))];
  if (unique.length === 0) return 0;
  assertContactsExist(unique);

  const writeDb = new Database(dbPath());
  try {
    ensureTrashedContactsTable(writeDb);
    ensureTrashedHandlesTable(writeDb);
    const upsertContact = writeDb.prepare(
      `INSERT INTO trashed_contacts (contact_id, trashed_at)
       VALUES (?, datetime('now'))
       ON CONFLICT(contact_id) DO UPDATE SET trashed_at = excluded.trashed_at`,
    );
    const tx = writeDb.transaction(() => {
      for (const id of unique) {
        upsertContact.run(id);
        trashHandlesInDb(writeDb, contactHandles(writeDb, id));
      }
    });
    tx();
  } finally {
    writeDb.close();
  }
  resetDb();
  return unique.length;
}

/** Soft-trash 1:1 handles for contacts; leave contacts visible. */
export function trashContactMessagesOnly(ids: number[]): {
  count: number;
  handles: string[];
} {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))];
  if (unique.length === 0) return { count: 0, handles: [] };
  assertContactsExist(unique);

  const handles: string[] = [];
  const writeDb = new Database(dbPath());
  try {
    ensureTrashedHandlesTable(writeDb);
    const tx = writeDb.transaction(() => {
      for (const id of unique) {
        const next = contactHandlesWithMessages(writeDb, id);
        handles.push(...next);
        trashHandlesInDb(writeDb, next);
      }
    });
    tx();
  } finally {
    writeDb.close();
  }
  resetDb();
  return { count: unique.length, handles: [...new Set(handles)] };
}

/** Restore soft-trashed contacts and their handles. */
export function restoreTrashedContacts(ids: number[]): number {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))];
  if (unique.length === 0) return 0;

  const writeDb = new Database(dbPath());
  try {
    ensureTrashedContactsTable(writeDb);
    ensureTrashedHandlesTable(writeDb);
    const delContact = writeDb.prepare(
      `DELETE FROM trashed_contacts WHERE contact_id = ?`,
    );
    const delHandle = writeDb.prepare(
      `DELETE FROM trashed_handles WHERE handle = ?`,
    );
    const tx = writeDb.transaction(() => {
      for (const id of unique) {
        const trashed = writeDb
          .prepare(`SELECT 1 AS ok FROM trashed_contacts WHERE contact_id = ?`)
          .get(id) as { ok: number } | undefined;
        if (!trashed) {
          throw new Error(`contact ${id} is not in trash`);
        }
        const handles = contactHandles(writeDb, id);
        delContact.run(id);
        for (const handle of handles) {
          delHandle.run(handle);
        }
      }
    });
    tx();
  } finally {
    writeDb.close();
  }
  resetDb();
  return unique.length;
}

/**
 * Permanently delete soft-trashed contacts: wipe 1:1 conversations for their
 * handles, then hard-delete the contact rows (+ CSV).
 */
export function permanentlyDeleteTrashedContacts(ids: number[]): number {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))];
  if (unique.length === 0) return 0;

  const writeDb = new Database(dbPath());
  try {
    ensureTrashedContactsTable(writeDb);
    ensureTrashedHandlesTable(writeDb);
    writeDb.pragma("foreign_keys = ON");
    const delConv = writeDb.prepare(
      `DELETE FROM conversations
       WHERE conversation_type = 'individual' AND chat_identifier = ?`,
    );
    const delHandle = writeDb.prepare(
      `DELETE FROM trashed_handles WHERE handle = ?`,
    );
    const delContactTrash = writeDb.prepare(
      `DELETE FROM trashed_contacts WHERE contact_id = ?`,
    );
    const tx = writeDb.transaction(() => {
      for (const id of unique) {
        const trashed = writeDb
          .prepare(`SELECT 1 AS ok FROM trashed_contacts WHERE contact_id = ?`)
          .get(id) as { ok: number } | undefined;
        if (!trashed) {
          throw new Error(`contact ${id} is not in trash`);
        }
        const handles = contactHandles(writeDb, id);
        for (const handle of handles) {
          delConv.run(handle);
          delHandle.run(handle);
        }
        delContactTrash.run(id);
      }
    });
    tx();
  } finally {
    writeDb.close();
  }
  resetDb();
  return deleteContacts(unique);
}
