use std::fs;
use std::path::Path;

use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection};

use crate::assets::{self, AssetStats, StoredAsset};
use crate::contacts;
use crate::exclude::ExcludeSet;
use crate::models::{clean_body, AttachmentRecord, ExportRecord, MessageRecord};
use crate::ndjson;
use crate::schema;

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

    schema::recreate_messages(&conn)?;

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
        ..Default::default()
    };
    let mut asset_stats = AssetStats::default();

    for path in paths {
        let file_stats =
            import_file(&mut conn, export_dir, assets_dir, &path, &exclude, &mut asset_stats)?;
        stats.conversations += file_stats.conversations;
        stats.participants += file_stats.participants;
        stats.messages += file_stats.messages;
        stats.attachments += file_stats.attachments;
        stats.tapbacks += file_stats.tapbacks;
        stats.conversations_excluded += file_stats.conversations_excluded;
        stats.messages_excluded += file_stats.messages_excluded;
        stats.participants_excluded += file_stats.participants_excluded;
        stats.files += 1;
    }

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

fn import_file(
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
    let conversation_id = tx.last_insert_rowid();
    stats.conversations = 1;

    for (handle, name_hint) in kept_participants {
        tx.execute(
            r#"
            INSERT INTO participants (conversation_id, handle, name_hint)
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

        tx.execute(
            r#"
            INSERT INTO messages (
                conversation_id, guid, timestamp, timestamp_utc, is_from_me, sender,
                subject, body, is_announcement, is_reply, thread_originator_guid,
                thread_originator_part, num_replies, sort_order
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
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
                sort_order as i64,
            ],
        )?;
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
                INSERT INTO attachments (
                    message_id, path, original_name, mime_type, is_sticker, transcription,
                    sha256, assets_path
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                "#,
                params![
                    message_id,
                    att.path,
                    att.original_name,
                    mime_type,
                    att.is_sticker as i64,
                    att.transcription,
                    sha256,
                    assets_path,
                ],
            )?;
            stats.attachments += 1;
        }

        for tap in msg.tapbacks {
            tx.execute(
                r#"
                INSERT INTO tapbacks (
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
