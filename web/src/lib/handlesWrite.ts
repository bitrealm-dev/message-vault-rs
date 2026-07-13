import Database from "better-sqlite3";
import { dbPath } from "./paths";
import { resetDb } from "./db";

function ensureTrashedHandlesTable(db: Database.Database): void {
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

/** Upsert handles into trashed_handles (owned or unassigned). */
export function trashHandlesInDb(
  db: Database.Database,
  handles: string[],
): void {
  const trimmed = [...new Set(handles.map((h) => h.trim()).filter(Boolean))];
  if (trimmed.length === 0) return;
  ensureTrashedHandlesTable(db);
  const upsert = db.prepare(
    `INSERT INTO trashed_handles (handle, trashed_at)
     VALUES (?, datetime('now'))
     ON CONFLICT(handle) DO UPDATE SET trashed_at = excluded.trashed_at`,
  );
  for (const handle of trimmed) {
    upsert.run(handle);
  }
}

/** Move a handle into Trash (may still belong to a contact). */
export function trashHandle(handle: string): void {
  const trimmed = handle.trim();
  if (!trimmed) throw new Error("handle required");

  const writeDb = new Database(dbPath());
  try {
    trashHandlesInDb(writeDb, [trimmed]);
  } finally {
    writeDb.close();
  }
  resetDb();
}

/** Restore a handle from Trash. */
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
 * messages/attachments) and removes the trash entry. Contact ownership is OK
 * (messages-only trash for a live contact).
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

    writeDb.pragma("foreign_keys = ON");
    const tx = writeDb.transaction(() => {
      writeDb
        .prepare(
          `DELETE FROM conversations
           WHERE conversation_type = 'individual' AND chat_identifier = ?`,
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
