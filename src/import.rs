use std::collections::HashMap;
use std::fs;
use std::path::Path;

use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};

use crate::assets::{self, AssetStats, StoredAsset};
use crate::contacts;
use crate::exclude::ExcludeSet;
use crate::models::{
    clean_body, json_array_column, json_value_column, AttachmentRecord, ExportRecord, MessageRecord,
};
use crate::ndjson;
use crate::schema;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportMode {
    Replace,
    Append,
}

impl ImportMode {
    pub fn parse(s: &str) -> Result<Self> {
        match s.to_ascii_lowercase().as_str() {
            "replace" => Ok(Self::Replace),
            "append" => Ok(Self::Append),
            other => bail!("invalid import mode '{other}' (expected replace or append)"),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Replace => "replace",
            Self::Append => "append",
        }
    }
}

#[derive(Debug, Default)]
pub struct ImportStats {
    pub conversations: u64,
    pub participants: u64,
    pub messages: u64,
    pub attachments: u64,
    pub tapbacks: u64,
    pub files: u64,
    pub assets_copied: u64,
    pub assets_deduped: u64,
    pub assets_missing: u64,
    pub contacts: u64,
    pub contact_phones: u64,
    pub contact_tag_links: u64,
    pub contacts_skipped: bool,
    pub conversations_excluded: u64,
    pub messages_excluded: u64,
    pub participants_excluded: u64,
    pub messages_deduped: u64,
    pub messages_appended: u64,
    pub mode: String,
}

struct PreparedAttachment {
    record: AttachmentRecord,
    stored: Option<StoredAsset>,
}

pub fn import_export(
    export_dir: &Path,
    db_path: &Path,
    assets_dir: &Path,
    contacts_csv: &Path,
    blacklist_csv: &Path,
    overwrite_contacts: bool,
    mode: ImportMode,
) -> Result<ImportStats> {
    if !export_dir.is_dir() {
        bail!("export directory does not exist: {}", export_dir.display());
    }

    if let Some(parent) = db_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
    }
    fs::create_dir_all(assets_dir)
        .with_context(|| format!("failed to create {}", assets_dir.display()))?;

    let mut conn = Connection::open(db_path)
        .with_context(|| format!("failed to open database {}", db_path.display()))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    let contact_stats =
        contacts::load_contacts_if_needed(&mut conn, contacts_csv, overwrite_contacts)?;
    let exclude = ExcludeSet::load(blacklist_csv)?;

    schema::recreate_staging(&conn)?;
    if mode == ImportMode::Append {
        schema::ensure_messages_schema(&conn)?;
    }

    let mut paths: Vec<_> = fs::read_dir(export_dir)
        .with_context(|| format!("failed to read {}", export_dir.display()))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
        })
        .collect();
    paths.sort();

    let mut stats = ImportStats {
        contacts: contact_stats.contacts,
        contact_phones: contact_stats.phones,
        contact_tag_links: contact_stats.tags,
        contacts_skipped: contact_stats.skipped,
        mode: mode.as_str().to_string(),
        ..Default::default()
    };
    let mut asset_stats = AssetStats::default();

    for path in paths {
        let file_stats =
            import_file_to_staging(&mut conn, export_dir, assets_dir, &path, &exclude, &mut asset_stats)?;
        stats.conversations += file_stats.conversations;
        stats.participants += file_stats.participants;
        stats.messages += file_stats.messages;
        stats.attachments += file_stats.attachments;
        stats.tapbacks += file_stats.tapbacks;
        stats.messages_deduped += file_stats.messages_deduped;
        stats.conversations_excluded += file_stats.conversations_excluded;
        stats.messages_excluded += file_stats.messages_excluded;
        stats.participants_excluded += file_stats.participants_excluded;
        stats.files += 1;
    }

    let promote_stats = match mode {
        ImportMode::Replace => promote_replace(&mut conn)?,
        ImportMode::Append => promote_append(&mut conn)?,
    };
    stats.messages_deduped += promote_stats.messages_deduped;
    stats.messages_appended = promote_stats.messages_appended;
    if mode == ImportMode::Append {
        // Staging load counts are not production inserts; report what was appended.
        stats.conversations = promote_stats.conversations;
        stats.participants = promote_stats.participants;
        stats.messages = promote_stats.messages;
        stats.attachments = promote_stats.attachments;
        stats.tapbacks = promote_stats.tapbacks;
    }

    schema::clear_staging(&conn)?;

    stats.assets_copied = asset_stats.copied;
    stats.assets_deduped = asset_stats.deduped;
    stats.assets_missing = asset_stats.missing;

    Ok(stats)
}

fn prepare_attachments(
    export_dir: &Path,
    assets_dir: &Path,
    attachments: Vec<AttachmentRecord>,
    asset_stats: &mut AssetStats,
) -> Result<Vec<PreparedAttachment>> {
    let mut prepared = Vec::with_capacity(attachments.len());
    for att in attachments {
        let stored = if let Some(rel) = att.path.as_deref() {
            assets::hash_and_store(
                &export_dir.join(rel),
                assets_dir,
                att.mime_type.as_deref(),
                asset_stats,
            )?
        } else {
            asset_stats.missing += 1;
            None
        };
        prepared.push(PreparedAttachment {
            record: att,
            stored,
        });
    }
    Ok(prepared)
}

fn import_file_to_staging(
    conn: &mut Connection,
    export_dir: &Path,
    assets_dir: &Path,
    path: &Path,
    exclude: &ExcludeSet,
    asset_stats: &mut AssetStats,
) -> Result<ImportStats> {
    let source_file = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown.json")
        .to_string();

    let records = ndjson::read_records(path)?;

    let mut messages: Vec<MessageRecord> = Vec::new();
    let mut conversation: Option<(
        String,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        Vec<(String, Option<String>)>,
    )> = None;

    for record in records {
        match record {
            ExportRecord::Conversation(c) => {
                conversation = Some((
                    c.chat_identifier,
                    c.service,
                    c.conv_type,
                    c.group_title,
                    c.exported_at,
                    c.participants
                        .into_iter()
                        .map(|p| (p.handle, p.name_hint))
                        .collect(),
                ));
            }
            ExportRecord::Message(m) => messages.push(m),
        }
    }

    let (chat_identifier, service, conv_type, group_title, exported_at, participants) =
        if let Some(c) = conversation {
            c
        } else if source_file == "orphaned.json" {
            (
                "orphaned".to_string(),
                None,
                "orphaned".to_string(),
                None,
                None,
                Vec::new(),
            )
        } else if messages.is_empty() {
            bail!(
                "{} has no conversation header and no messages",
                path.display()
            );
        } else {
            bail!(
                "{} is missing a conversation header (expected first record)",
                path.display()
            );
        };

    let mut stats = ImportStats::default();

    // Skip whole conversation when chat id or 1:1 peer is excluded.
    if exclude.contains_handle(&chat_identifier) {
        stats.conversations_excluded = 1;
        return Ok(stats);
    }
    if conv_type == "individual" {
        let peer_excluded = participants
            .iter()
            .any(|(handle, _)| exclude.contains_handle(handle));
        if peer_excluded {
            stats.conversations_excluded = 1;
            return Ok(stats);
        }
    }

    let kept_participants: Vec<(String, Option<String>)> = participants
        .into_iter()
        .filter(|(handle, _)| {
            if exclude.contains_handle(handle) {
                stats.participants_excluded += 1;
                false
            } else {
                true
            }
        })
        .collect();

    let kept_messages: Vec<MessageRecord> = messages
        .into_iter()
        .filter(|msg| {
            let excluded = msg
                .sender
                .as_deref()
                .is_some_and(|s| exclude.contains_handle(s));
            if excluded {
                stats.messages_excluded += 1;
                false
            } else {
                true
            }
        })
        .collect();

    // Hash/copy assets before opening the DB transaction.
    let mut prepared_messages = Vec::with_capacity(kept_messages.len());
    for mut msg in kept_messages {
        let attachments = prepare_attachments(
            export_dir,
            assets_dir,
            std::mem::take(&mut msg.attachments),
            asset_stats,
        )?;
        prepared_messages.push((msg, attachments));
    }

    let tx = conn.transaction()?;

    tx.execute(
        r#"
        INSERT INTO staging_conversations (
            chat_identifier, service, conv_type, group_title, exported_at, source_file
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![
            chat_identifier,
            service,
            conv_type,
            group_title,
            exported_at,
            source_file,
        ],
    )?;
    let conversation_id = tx.last_insert_rowid();
    stats.conversations = 1;

    for (handle, name_hint) in kept_participants {
        tx.execute(
            r#"
            INSERT INTO staging_participants (conversation_id, handle, name_hint)
            VALUES (?1, ?2, ?3)
            "#,
            params![conversation_id, handle, name_hint],
        )?;
        stats.participants += 1;
    }

    for (sort_order, (msg, attachments)) in prepared_messages.into_iter().enumerate() {
        let body = if msg.is_announcement {
            clean_body(msg.announcement.as_deref())
                .or_else(|| clean_body(msg.text.as_deref()))
        } else {
            clean_body(msg.text.as_deref())
        };

        let parts_json = json_array_column(&msg.parts);
        let edits_json = json_array_column(&msg.edits);
        let balloon_json = json_value_column(&msg.balloon);

        let inserted = tx.execute(
            r#"
            INSERT OR IGNORE INTO staging_messages (
                conversation_id, guid, timestamp, timestamp_utc, is_from_me, sender,
                subject, body, is_announcement, is_reply, thread_originator_guid,
                thread_originator_part, num_replies,
                timestamp_read, timestamp_delivered, service, is_deleted, expressive,
                shared_location, parts_json, edits_json, balloon_json,
                sort_order
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23
            )
            "#,
            params![
                conversation_id,
                msg.guid,
                msg.timestamp,
                msg.timestamp_utc,
                msg.is_from_me as i64,
                msg.sender,
                msg.subject,
                body,
                msg.is_announcement as i64,
                msg.is_reply as i64,
                msg.thread_originator_guid,
                msg.thread_originator_part,
                msg.num_replies,
                msg.timestamp_read,
                msg.timestamp_delivered,
                msg.service,
                msg.is_deleted as i64,
                msg.expressive,
                msg.shared_location,
                parts_json,
                edits_json,
                balloon_json,
                sort_order as i64,
            ],
        )?;

        if inserted == 0 {
            stats.messages_deduped += 1;
            continue;
        }

        let message_id = tx.last_insert_rowid();
        stats.messages += 1;

        for prepared in attachments {
            let att = prepared.record;
            let (sha256, assets_path, mime_type) = match prepared.stored {
                Some(stored) => (
                    Some(stored.sha256),
                    Some(stored.assets_path),
                    stored.mime_type.or(att.mime_type),
                ),
                None => (None, None, att.mime_type),
            };

            tx.execute(
                r#"
                INSERT INTO staging_attachments (
                    message_id, path, original_name, mime_type, is_sticker, transcription,
                    genmoji_prompt, sticker_effect, sha256, assets_path
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                "#,
                params![
                    message_id,
                    att.path,
                    att.original_name,
                    mime_type,
                    att.is_sticker as i64,
                    att.transcription,
                    att.genmoji_prompt,
                    att.sticker_effect,
                    sha256,
                    assets_path,
                ],
            )?;
            stats.attachments += 1;
        }

        for tap in msg.tapbacks {
            tx.execute(
                r#"
                INSERT INTO staging_tapbacks (
                    message_id, part_index, kind, emoji, is_from_me, sender
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
                params![
                    message_id,
                    tap.part_index,
                    tap.kind,
                    tap.emoji,
                    tap.is_from_me as i64,
                    tap.sender,
                ],
            )?;
            stats.tapbacks += 1;
        }
    }

    tx.commit()?;
    Ok(stats)
}

#[derive(Debug, Default)]
struct PromoteStats {
    conversations: u64,
    participants: u64,
    messages: u64,
    attachments: u64,
    tapbacks: u64,
    messages_deduped: u64,
    messages_appended: u64,
}

fn promote_replace(conn: &mut Connection) -> Result<PromoteStats> {
    schema::recreate_messages(conn)?;

    let tx = conn.transaction()?;
    tx.execute_batch(
        r#"
        INSERT INTO conversations
            SELECT * FROM staging_conversations;
        INSERT INTO participants
            SELECT * FROM staging_participants;
        INSERT INTO messages
            SELECT * FROM staging_messages;
        INSERT INTO attachments
            SELECT * FROM staging_attachments;
        INSERT INTO tapbacks
            SELECT * FROM staging_tapbacks;
        "#,
    )?;
    tx.commit()?;
    Ok(PromoteStats::default())
}

fn promote_append(conn: &mut Connection) -> Result<PromoteStats> {
    let mut stats = PromoteStats::default();
    let tx = conn.transaction()?;

    let mut staging_convs = tx.prepare(
        r#"
        SELECT id, chat_identifier, service, conv_type, group_title, exported_at, source_file
        FROM staging_conversations
        ORDER BY id
        "#,
    )?;

    let staging_conv_rows: Vec<(
        i64,
        String,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        String,
    )> = staging_convs
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(staging_convs);

    let mut conv_map: HashMap<i64, i64> = HashMap::new();

    for (staging_id, chat_identifier, service, conv_type, group_title, exported_at, source_file) in
        staging_conv_rows
    {
        let existing: Option<i64> = tx
            .query_row(
                "SELECT id FROM conversations WHERE chat_identifier = ?1",
                params![chat_identifier],
                |row| row.get(0),
            )
            .optional()?;

        let prod_id = if let Some(id) = existing {
            tx.execute(
                r#"
                UPDATE conversations SET
                    service = COALESCE(?2, service),
                    conv_type = ?3,
                    group_title = COALESCE(?4, group_title),
                    exported_at = COALESCE(?5, exported_at),
                    source_file = ?6
                WHERE id = ?1
                "#,
                params![id, service, conv_type, group_title, exported_at, source_file],
            )?;
            id
        } else {
            tx.execute(
                r#"
                INSERT INTO conversations (
                    chat_identifier, service, conv_type, group_title, exported_at, source_file
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
                params![
                    chat_identifier,
                    service,
                    conv_type,
                    group_title,
                    exported_at,
                    source_file,
                ],
            )?;
            stats.conversations += 1;
            tx.last_insert_rowid()
        };
        conv_map.insert(staging_id, prod_id);
    }

    let mut staging_parts = tx.prepare(
        "SELECT conversation_id, handle, name_hint FROM staging_participants ORDER BY id",
    )?;
    let staging_part_rows: Vec<(i64, String, Option<String>)> = staging_parts
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(staging_parts);

    for (staging_conv_id, handle, name_hint) in staging_part_rows {
        let Some(&prod_conv_id) = conv_map.get(&staging_conv_id) else {
            continue;
        };
        let inserted = tx.execute(
            r#"
            INSERT OR IGNORE INTO participants (conversation_id, handle, name_hint)
            VALUES (?1, ?2, ?3)
            "#,
            params![prod_conv_id, handle, name_hint],
        )?;
        if inserted > 0 {
            stats.participants += 1;
        }
    }

    let mut staging_msgs = tx.prepare(
        r#"
        SELECT id, conversation_id, guid, timestamp, timestamp_utc, is_from_me, sender,
               subject, body, is_announcement, is_reply, thread_originator_guid,
               thread_originator_part, num_replies,
               timestamp_read, timestamp_delivered, service, is_deleted, expressive,
               shared_location, parts_json, edits_json, balloon_json,
               sort_order
        FROM staging_messages
        ORDER BY id
        "#,
    )?;

    type StagingMsgRow = (
        i64,             // staging_msg_id
        i64,             // staging_conv_id
        Option<String>,  // guid
        String,          // timestamp
        Option<String>,  // timestamp_utc
        i64,             // is_from_me
        Option<String>,  // sender
        Option<String>,  // subject
        Option<String>,  // body
        i64,             // is_announcement
        i64,             // is_reply
        Option<String>,  // thread_originator_guid
        Option<i64>,     // thread_originator_part
        i64,             // num_replies
        Option<String>,  // timestamp_read
        Option<String>,  // timestamp_delivered
        Option<String>,  // service
        i64,             // is_deleted
        Option<String>,  // expressive
        Option<String>,  // shared_location
        Option<String>,  // parts_json
        Option<String>,  // edits_json
        Option<String>,  // balloon_json
        i64,             // sort_order
    );

    let staging_msg_rows: Vec<StagingMsgRow> = staging_msgs
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
                row.get(10)?,
                row.get(11)?,
                row.get(12)?,
                row.get(13)?,
                row.get(14)?,
                row.get(15)?,
                row.get(16)?,
                row.get(17)?,
                row.get(18)?,
                row.get(19)?,
                row.get(20)?,
                row.get(21)?,
                row.get(22)?,
                row.get(23)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(staging_msgs);

    let mut msg_map: HashMap<i64, i64> = HashMap::new();

    for (
        staging_msg_id,
        staging_conv_id,
        guid,
        timestamp,
        timestamp_utc,
        is_from_me,
        sender,
        subject,
        body,
        is_announcement,
        is_reply,
        thread_originator_guid,
        thread_originator_part,
        num_replies,
        timestamp_read,
        timestamp_delivered,
        service,
        is_deleted,
        expressive,
        shared_location,
        parts_json,
        edits_json,
        balloon_json,
        sort_order,
    ) in staging_msg_rows
    {
        let Some(&prod_conv_id) = conv_map.get(&staging_conv_id) else {
            continue;
        };

        let guid_nonempty = guid.as_deref().is_some_and(|g| !g.is_empty());
        if guid_nonempty {
            let exists: bool = tx.query_row(
                "SELECT COUNT(*) > 0 FROM messages WHERE guid = ?1",
                params![guid],
                |row| row.get(0),
            )?;
            if exists {
                stats.messages_deduped += 1;
                continue;
            }
        }

        tx.execute(
            r#"
            INSERT INTO messages (
                conversation_id, guid, timestamp, timestamp_utc, is_from_me, sender,
                subject, body, is_announcement, is_reply, thread_originator_guid,
                thread_originator_part, num_replies,
                timestamp_read, timestamp_delivered, service, is_deleted, expressive,
                shared_location, parts_json, edits_json, balloon_json,
                sort_order
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23
            )
            "#,
            params![
                prod_conv_id,
                guid,
                timestamp,
                timestamp_utc,
                is_from_me,
                sender,
                subject,
                body,
                is_announcement,
                is_reply,
                thread_originator_guid,
                thread_originator_part,
                num_replies,
                timestamp_read,
                timestamp_delivered,
                service,
                is_deleted,
                expressive,
                shared_location,
                parts_json,
                edits_json,
                balloon_json,
                sort_order,
            ],
        )?;
        let prod_msg_id = tx.last_insert_rowid();
        msg_map.insert(staging_msg_id, prod_msg_id);
        stats.messages += 1;
        stats.messages_appended += 1;
    }

    let mut staging_atts = tx.prepare(
        r#"
        SELECT message_id, path, original_name, mime_type, is_sticker, transcription,
               genmoji_prompt, sticker_effect, sha256, assets_path
        FROM staging_attachments
        ORDER BY id
        "#,
    )?;
    let staging_att_rows: Vec<(
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = staging_atts
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(staging_atts);

    for (
        staging_msg_id,
        path,
        original_name,
        mime_type,
        is_sticker,
        transcription,
        genmoji_prompt,
        sticker_effect,
        sha256,
        assets_path,
    ) in staging_att_rows
    {
        let Some(&prod_msg_id) = msg_map.get(&staging_msg_id) else {
            continue;
        };
        tx.execute(
            r#"
            INSERT INTO attachments (
                message_id, path, original_name, mime_type, is_sticker, transcription,
                genmoji_prompt, sticker_effect, sha256, assets_path
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
            params![
                prod_msg_id,
                path,
                original_name,
                mime_type,
                is_sticker,
                transcription,
                genmoji_prompt,
                sticker_effect,
                sha256,
                assets_path,
            ],
        )?;
        stats.attachments += 1;
    }

    let mut staging_taps = tx.prepare(
        r#"
        SELECT message_id, part_index, kind, emoji, is_from_me, sender
        FROM staging_tapbacks
        ORDER BY id
        "#,
    )?;
    let staging_tap_rows: Vec<(i64, i64, String, Option<String>, i64, Option<String>)> =
        staging_taps
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
    drop(staging_taps);

    for (staging_msg_id, part_index, kind, emoji, is_from_me, sender) in staging_tap_rows {
        let Some(&prod_msg_id) = msg_map.get(&staging_msg_id) else {
            continue;
        };
        tx.execute(
            r#"
            INSERT INTO tapbacks (
                message_id, part_index, kind, emoji, is_from_me, sender
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![prod_msg_id, part_index, kind, emoji, is_from_me, sender],
        )?;
        stats.tapbacks += 1;
    }

    tx.commit()?;
    Ok(stats)
}
