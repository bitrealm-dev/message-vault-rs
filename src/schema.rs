use anyhow::Result;
use rusqlite::Connection;

/// Drop and recreate message-related tables. Does not touch contacts.
pub fn recreate_messages(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        DROP TABLE IF EXISTS tapbacks;
        DROP TABLE IF EXISTS attachments;
        DROP TABLE IF EXISTS messages;
        DROP TABLE IF EXISTS participants;
        DROP TABLE IF EXISTS conversations;

        CREATE TABLE conversations (
            id INTEGER PRIMARY KEY,
            chat_identifier TEXT NOT NULL,
            service TEXT,
            conv_type TEXT NOT NULL,
            group_title TEXT,
            exported_at TEXT,
            source_file TEXT NOT NULL,
            UNIQUE(chat_identifier, source_file)
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
        CREATE INDEX ix_messages_guid ON messages (guid);

        CREATE TABLE attachments (
            id INTEGER PRIMARY KEY,
            message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            path TEXT,
            original_name TEXT,
            mime_type TEXT,
            is_sticker INTEGER NOT NULL DEFAULT 0,
            transcription TEXT,
            sha256 TEXT,
            assets_path TEXT
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
            display INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'current',
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
