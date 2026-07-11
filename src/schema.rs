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

CREATE INDEX ix_messages_conversation_timestamp
    ON messages (conversation_id, timestamp);
CREATE UNIQUE INDEX ix_messages_guid
    ON messages (guid)
    WHERE guid IS NOT NULL AND guid != '';

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

CREATE TABLE tapbacks (
    id INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    part_index INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL,
    emoji TEXT,
    is_from_me INTEGER NOT NULL,
    sender TEXT
);
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
CREATE UNIQUE INDEX ix_staging_messages_guid
    ON staging_messages (guid)
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

CREATE TABLE staging_tapbacks (
    id INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES staging_messages(id) ON DELETE CASCADE,
    part_index INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL,
    emoji TEXT,
    is_from_me INTEGER NOT NULL,
    sender TEXT
);
"#;

/// Drop and recreate production message-related tables. Does not touch contacts or staging.
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
pub fn ensure_messages_schema(conn: &Connection) -> Result<()> {
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type = 'table' AND name = 'conversations'",
        [],
        |row| row.get(0),
    )?;
    if !exists {
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        conn.execute_batch(MESSAGE_TABLES_DDL)?;
    }
    Ok(())
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
