import Database from "better-sqlite3";
import { dbPath } from "./paths";
import { resetDb } from "./db";

function ensureTrashedConversationsTable(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS trashed_conversations (
       conversation_id INTEGER PRIMARY KEY,
       trashed_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );
}

/** Move a group conversation into Trash. */
export function trashConversation(conversationId: number): void {
  if (!Number.isFinite(conversationId)) {
    throw new Error("conversationId required");
  }

  const writeDb = new Database(dbPath());
  try {
    ensureTrashedConversationsTable(writeDb);
    const row = writeDb
      .prepare(
        `SELECT 1 AS ok FROM conversations
         WHERE id = ? AND conversation_type = 'group'`,
      )
      .get(conversationId) as { ok: number } | undefined;
    if (!row) {
      throw new Error("group conversation not found");
    }
    writeDb
      .prepare(
        `INSERT INTO trashed_conversations (conversation_id, trashed_at)
         VALUES (?, datetime('now'))
         ON CONFLICT(conversation_id) DO UPDATE SET trashed_at = excluded.trashed_at`,
      )
      .run(conversationId);
  } finally {
    writeDb.close();
  }
  resetDb();
}

/** Restore a group conversation from Trash. */
export function restoreConversation(conversationId: number): void {
  if (!Number.isFinite(conversationId)) {
    throw new Error("conversationId required");
  }

  const writeDb = new Database(dbPath());
  try {
    ensureTrashedConversationsTable(writeDb);
    writeDb
      .prepare(`DELETE FROM trashed_conversations WHERE conversation_id = ?`)
      .run(conversationId);
  } finally {
    writeDb.close();
  }
  resetDb();
}

/**
 * Permanently remove a trashed group conversation (cascades messages) and
 * clears the trash entry.
 */
export function permanentlyDeleteConversation(conversationId: number): void {
  if (!Number.isFinite(conversationId)) {
    throw new Error("conversationId required");
  }

  const writeDb = new Database(dbPath());
  try {
    ensureTrashedConversationsTable(writeDb);
    const trashed = writeDb
      .prepare(
        `SELECT 1 AS ok FROM trashed_conversations WHERE conversation_id = ?`,
      )
      .get(conversationId) as { ok: number } | undefined;
    if (!trashed) {
      throw new Error("conversation is not in trash");
    }

    writeDb.pragma("foreign_keys = ON");
    const tx = writeDb.transaction(() => {
      writeDb
        .prepare(
          `DELETE FROM conversations
           WHERE id = ? AND conversation_type = 'group'`,
        )
        .run(conversationId);
      writeDb
        .prepare(`DELETE FROM trashed_conversations WHERE conversation_id = ?`)
        .run(conversationId);
    });
    tx();
  } finally {
    writeDb.close();
  }
  resetDb();
}
