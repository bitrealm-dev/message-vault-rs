import Database from "better-sqlite3";
import { dbPath } from "./paths";
import { resetDb } from "./db";

export function ensureTrashedHandlesTable(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS trashed_handles (
       handle TEXT PRIMARY KEY,
       trashed_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );
}

/** Remove handles from trash (e.g. after assigning to a contact). */
export function clearTrashedHandles(
  db: Database.Database,
  handles: string[],
): void {
  const trimmed = handles.map((h) => h.trim()).filter(Boolean);
  if (trimmed.length === 0) return;
  ensureTrashedHandlesTable(db);
  const del = db.prepare(`DELETE FROM trashed_handles WHERE handle = ?`);
  for (const handle of trimmed) {
    del.run(handle);
  }
}

/** Move an unmatched handle into Trash. */
export function trashHandle(handle: string): void {
  const trimmed = handle.trim();
  if (!trimmed) throw new Error("handle required");

  const writeDb = new Database(dbPath());
  try {
    ensureTrashedHandlesTable(writeDb);
    const owned = writeDb
      .prepare(`SELECT 1 AS ok FROM contact_phones WHERE phone_e164 = ?`)
      .get(trimmed) as { ok: number } | undefined;
    if (owned) {
      throw new Error("handle already belongs to a contact");
    }
    writeDb
      .prepare(
        `INSERT INTO trashed_handles (handle, trashed_at)
         VALUES (?, datetime('now'))
         ON CONFLICT(handle) DO UPDATE SET trashed_at = excluded.trashed_at`,
      )
      .run(trimmed);
  } finally {
    writeDb.close();
  }
  resetDb();
}

/** Restore a handle from Trash back to Unmatched. */
export function restoreHandle(handle: string): void {
  const trimmed = handle.trim();
  if (!trimmed) throw new Error("handle required");

  const writeDb = new Database(dbPath());
  try {
    ensureTrashedHandlesTable(writeDb);
    writeDb.prepare(`DELETE FROM trashed_handles WHERE handle = ?`).run(trimmed);
  } finally {
    writeDb.close();
  }
  resetDb();
}

/**
 * Permanently remove a trashed handle: deletes its 1:1 conversation (cascades
 * messages/attachments) and removes the trash entry.
 */
export function permanentlyDeleteHandle(handle: string): void {
  const trimmed = handle.trim();
  if (!trimmed) throw new Error("handle required");

  const writeDb = new Database(dbPath());
  try {
    ensureTrashedHandlesTable(writeDb);
    const trashed = writeDb
      .prepare(`SELECT 1 AS ok FROM trashed_handles WHERE handle = ?`)
      .get(trimmed) as { ok: number } | undefined;
    if (!trashed) {
      throw new Error("handle is not in trash");
    }
    const owned = writeDb
      .prepare(`SELECT 1 AS ok FROM contact_phones WHERE phone_e164 = ?`)
      .get(trimmed) as { ok: number } | undefined;
    if (owned) {
      throw new Error("handle already belongs to a contact");
    }

    writeDb.pragma("foreign_keys = ON");
    const tx = writeDb.transaction(() => {
      writeDb
        .prepare(
          `DELETE FROM conversations
           WHERE conv_type = 'individual' AND chat_identifier = ?`,
        )
        .run(trimmed);
      writeDb
        .prepare(`DELETE FROM trashed_handles WHERE handle = ?`)
        .run(trimmed);
    });
    tx();
  } finally {
    writeDb.close();
  }
  resetDb();
}
