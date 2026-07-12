use anyhow::Result;
use rusqlite::Connection;

const MESSAGE_TABLES_DDL: &str = r#"
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY,
    chat_identifier TEXT NOT NULL UNIQUE,
    service TEXT,
    conv_type TEXT NOT NULL,
    group_title TEXT,
    exported_at TEXT,
    source_file TEXT NOT NULL
);

CREATE TABLE participants (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    handle TEXT NOT NULL,
    name_hint TEXT,
    UNIQUE(conversation_id, handle)
);

CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    guid TEXT,
    timestamp TEXT NOT NULL,
    timestamp_utc TEXT,
    is_from_me INTEGER NOT NULL,
    sender TEXT,
    subject TEXT,
    body TEXT,
    is_announcement INTEGER NOT NULL DEFAULT 0,
    is_reply INTEGER NOT NULL DEFAULT 0,
    thread_originator_guid TEXT,
    thread_originator_part INTEGER,
    num_replies INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL,
    content_key TEXT,
    duplicate_of INTEGER REFERENCES messages(id) ON DELETE SET NULL
);

CREATE INDEX ix_messages_conversation_timestamp
    ON messages (conversation_id, timestamp);
CREATE INDEX ix_messages_conversation_source_timestamp
    ON messages (conversation_id, source, timestamp);
CREATE UNIQUE INDEX ix_messages_source_guid
    ON messages (source, guid)
    WHERE guid IS NOT NULL AND guid != '';
CREATE INDEX ix_messages_content_key
    ON messages (content_key)
    WHERE content_key IS NOT NULL AND content_key != '';
CREATE INDEX ix_messages_duplicate_of
    ON messages (duplicate_of)
    WHERE duplicate_of IS NOT NULL;

CREATE TABLE attachments (
    id INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    path TEXT,
    original_name TEXT,
    mime_type TEXT,
    is_sticker INTEGER NOT NULL DEFAULT 0,
    transcription TEXT,
    sha256 TEXT,
    assets_path TEXT,
    derived_sha256 TEXT,
    derived_assets_path TEXT,
    derived_mime_type TEXT
);

CREATE INDEX ix_attachments_sha256 ON attachments (sha256);
CREATE INDEX ix_attachments_message_id ON attachments (message_id);

CREATE TABLE tapbacks (
    id INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    part_index INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL,
    emoji TEXT,
    is_from_me INTEGER NOT NULL,
    sender TEXT
);

CREATE INDEX ix_tapbacks_message_id ON tapbacks (message_id);
CREATE INDEX ix_messages_source ON messages (source);
"#;

const STAGING_TABLES_DDL: &str = r#"
CREATE TABLE staging_conversations (
    id INTEGER PRIMARY KEY,
    chat_identifier TEXT NOT NULL UNIQUE,
    service TEXT,
    conv_type TEXT NOT NULL,
    group_title TEXT,
    exported_at TEXT,
    source_file TEXT NOT NULL
);

CREATE TABLE staging_participants (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES staging_conversations(id) ON DELETE CASCADE,
    handle TEXT NOT NULL,
    name_hint TEXT,
    UNIQUE(conversation_id, handle)
);

CREATE TABLE staging_messages (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES staging_conversations(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    guid TEXT,
    timestamp TEXT NOT NULL,
    timestamp_utc TEXT,
    is_from_me INTEGER NOT NULL,
    sender TEXT,
    subject TEXT,
    body TEXT,
    is_announcement INTEGER NOT NULL DEFAULT 0,
    is_reply INTEGER NOT NULL DEFAULT 0,
    thread_originator_guid TEXT,
    thread_originator_part INTEGER,
    num_replies INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL
);

CREATE INDEX ix_staging_messages_conversation_timestamp
    ON staging_messages (conversation_id, timestamp);
CREATE UNIQUE INDEX ix_staging_messages_source_guid
    ON staging_messages (source, guid)
    WHERE guid IS NOT NULL AND guid != '';

CREATE TABLE staging_attachments (
    id INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES staging_messages(id) ON DELETE CASCADE,
    path TEXT,
    original_name TEXT,
    mime_type TEXT,
    is_sticker INTEGER NOT NULL DEFAULT 0,
    transcription TEXT,
    sha256 TEXT,
    assets_path TEXT,
    derived_sha256 TEXT,
    derived_assets_path TEXT,
    derived_mime_type TEXT
);

CREATE INDEX ix_staging_attachments_sha256 ON staging_attachments (sha256);
CREATE INDEX ix_staging_attachments_message_id ON staging_attachments (message_id);

CREATE TABLE staging_tapbacks (
    id INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES staging_messages(id) ON DELETE CASCADE,
    part_index INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL,
    emoji TEXT,
    is_from_me INTEGER NOT NULL,
    sender TEXT
);

CREATE INDEX ix_staging_tapbacks_message_id ON staging_tapbacks (message_id);
"#;

/// Drop and recreate production message-related tables. Does not touch contacts or staging.
#[allow(dead_code)]
pub fn recreate_messages(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        DROP TABLE IF EXISTS tapbacks;
        DROP TABLE IF EXISTS attachments;
        DROP TABLE IF EXISTS messages;
        DROP TABLE IF EXISTS participants;
        DROP TABLE IF EXISTS conversations;
        "#,
    )?;
    conn.execute_batch(MESSAGE_TABLES_DDL)?;
    Ok(())
}

/// Create production message tables if they do not already exist (for append on a fresh DB).
/// Migrates older schemas that lack `messages.source` / cross-source dedupe columns.
pub fn ensure_messages_schema(conn: &Connection) -> Result<()> {
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type = 'table' AND name = 'conversations'",
        [],
        |row| row.get(0),
    )?;
    if !exists {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        conn.execute_batch(MESSAGE_TABLES_DDL)?;
        return Ok(());
    }
    migrate_messages_source(conn)?;
    migrate_messages_dedupe_columns(conn)?;
    migrate_delete_performance_indexes(conn)?;
    Ok(())
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let n: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = ?1"),
        [column],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}

fn migrate_messages_source(conn: &Connection) -> Result<()> {
    if !table_has_column(conn, "messages", "source")? {
        conn.execute_batch(
            r#"
            ALTER TABLE messages ADD COLUMN source TEXT NOT NULL DEFAULT 'default';
            DROP INDEX IF EXISTS ix_messages_guid;
            CREATE INDEX IF NOT EXISTS ix_messages_conversation_source_timestamp
                ON messages (conversation_id, source, timestamp);
            CREATE UNIQUE INDEX IF NOT EXISTS ix_messages_source_guid
                ON messages (source, guid)
                WHERE guid IS NOT NULL AND guid != '';
            "#,
        )?;
    }
    Ok(())
}

fn migrate_messages_dedupe_columns(conn: &Connection) -> Result<()> {
    if !table_has_column(conn, "messages", "content_key")? {
        conn.execute_batch("ALTER TABLE messages ADD COLUMN content_key TEXT;")?;
    }
    if !table_has_column(conn, "messages", "duplicate_of")? {
        conn.execute_batch(
            "ALTER TABLE messages ADD COLUMN duplicate_of INTEGER REFERENCES messages(id) ON DELETE SET NULL;",
        )?;
    }
    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS ix_messages_content_key
            ON messages (content_key)
            WHERE content_key IS NOT NULL AND content_key != '';
        CREATE INDEX IF NOT EXISTS ix_messages_duplicate_of
            ON messages (duplicate_of)
            WHERE duplicate_of IS NOT NULL;
        "#,
    )?;
    Ok(())
}

fn migrate_delete_performance_indexes(conn: &Connection) -> Result<()> {
    // CASCADE deletes on messages are O(n²) without message_id indexes on child tables.
    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS ix_attachments_message_id ON attachments (message_id);
        CREATE INDEX IF NOT EXISTS ix_tapbacks_message_id ON tapbacks (message_id);
        CREATE INDEX IF NOT EXISTS ix_messages_source ON messages (source);
        "#,
    )?;
    Ok(())
}

/// Delete all production messages (and cascaded rows) for one import source.
pub fn delete_messages_for_source(conn: &Connection, source: &str) -> Result<u64> {
    // Ensure indexes exist even if caller skipped ensure_messages_schema somehow.
    migrate_delete_performance_indexes(conn)?;

    // Delete children first with set-based IN queries so CASCADE work is minimal,
    // then clear reverse FKs (duplicate_of), then delete the messages themselves.
    conn.execute(
        r#"
        DELETE FROM attachments
        WHERE message_id IN (SELECT id FROM messages WHERE source = ?1)
        "#,
        [source],
    )?;
    conn.execute(
        r#"
        DELETE FROM tapbacks
        WHERE message_id IN (SELECT id FROM messages WHERE source = ?1)
        "#,
        [source],
    )?;
    conn.execute(
        r#"
        UPDATE messages
        SET duplicate_of = NULL
        WHERE duplicate_of IN (SELECT id FROM messages WHERE source = ?1)
        "#,
        [source],
    )?;
    let n = conn.execute("DELETE FROM messages WHERE source = ?1", [source])?;
    Ok(n as u64)
}

/// Drop and recreate staging message tables.
pub fn recreate_staging(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        DROP TABLE IF EXISTS staging_tapbacks;
        DROP TABLE IF EXISTS staging_attachments;
        DROP TABLE IF EXISTS staging_messages;
        DROP TABLE IF EXISTS staging_participants;
        DROP TABLE IF EXISTS staging_conversations;
        "#,
    )?;
    conn.execute_batch(STAGING_TABLES_DDL)?;
    Ok(())
}

/// Drop all staging tables (after a successful promote).
pub fn clear_staging(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        DROP TABLE IF EXISTS staging_tapbacks;
        DROP TABLE IF EXISTS staging_attachments;
        DROP TABLE IF EXISTS staging_messages;
        DROP TABLE IF EXISTS staging_participants;
        DROP TABLE IF EXISTS staging_conversations;
        "#,
    )?;
    Ok(())
}

/// Create contacts tables if they do not already exist.
pub fn ensure_contacts_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY,
            first_name TEXT,
            last_name TEXT,
            exclude INTEGER NOT NULL DEFAULT 0,
            preferred_phone TEXT
        );

        CREATE TABLE IF NOT EXISTS contact_phones (
            phone_e164 TEXT PRIMARY KEY,
            contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS ix_contact_phones_contact_id
            ON contact_phones (contact_id);

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS contact_tags (
            contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (contact_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS trashed_handles (
            handle TEXT PRIMARY KEY,
            trashed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS trashed_conversations (
            conversation_id INTEGER PRIMARY KEY,
            trashed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )?;
    Ok(())
}

/// Drop and recreate contacts tables (used when overwriting from CSV).
pub fn recreate_contacts(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        DROP TABLE IF EXISTS contact_tags;
        DROP TABLE IF EXISTS tags;
        DROP TABLE IF EXISTS contact_groups;
        DROP TABLE IF EXISTS groups;
        DROP TABLE IF EXISTS contact_phones;
        DROP TABLE IF EXISTS contacts;
        "#,
    )?;
    ensure_contacts_schema(conn)
}
