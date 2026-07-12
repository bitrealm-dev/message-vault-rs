//! Convert SMS Backup & Restore XML → message-json SMS schema NDJSON.

use crate::phone::{sanitize_number, to_e164};
use crate::xml::{parse_xml_file, AttachmentBlob, ConvType, ParsedMessage};
use anyhow::{bail, Context, Result};
use chrono::{Local, TimeZone, Utc};
use message_json::sms::{
    stable_guid, AttachmentRecord, ConversationRecord, ExportRecord, MessageRecord,
    ParticipantRecord,
};
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Default)]
pub struct ExportReport {
    pub conversations: u64,
    pub sms_count: u64,
    pub mms_count: u64,
    pub attachments_saved: u64,
    pub sent: u64,
    pub received: u64,
    pub skipped_invalid_date: u64,
    pub skipped_unknown_address: u64,
    pub skipped_unknown_type: u64,
    pub skipped_empty_participants: u64,
    pub skipped_bad_attachment: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone)]
struct PendingAttachment {
    rel_path: String,
    original_name: Option<String>,
    mime_type: Option<String>,
    digest_hex: String,
}

#[derive(Debug, Clone)]
struct PendingMessage {
    sort_key: f64,
    is_from_me: bool,
    sender_digits: Option<String>,
    text: String,
    attachments: Vec<PendingAttachment>,
    dedupe_key: String,
}

#[derive(Debug, Default)]
struct PendingConversation {
    conversation_type: ConvType,
    group_title: Option<String>,
    participants: BTreeMap<String, Option<String>>,
    messages: Vec<PendingMessage>,
}

fn format_local_ts(secs: i64) -> Option<(String, String)> {
    let local = Local.timestamp_opt(secs, 0).single().or_else(|| {
        Utc.timestamp_opt(secs, 0)
            .single()
            .map(|utc| Local.from_utc_datetime(&utc.naive_utc()))
    })?;
    let utc = local.with_timezone(&Utc);
    Some((
        local.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        utc.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    ))
}

fn chat_id_for(msg: &ParsedMessage) -> String {
    match msg.conversation_type {
        ConvType::Group => format!("chat-{}", msg.chat_key),
        ConvType::Individual => to_e164(&msg.chat_key),
    }
}

fn safe_filename(chat_id: &str) -> String {
    chat_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        + ".json"
}

fn write_attachments(
    blobs: &[AttachmentBlob],
    attachments_dir: &Path,
    report: &mut ExportReport,
) -> Result<Vec<PendingAttachment>> {
    let mut out = Vec::with_capacity(blobs.len());
    for blob in blobs {
        let path = attachments_dir.join(&blob.filename);
        // Content-addressed filenames: existing path means same bytes.
        if !path.exists() {
            fs::write(&path, blob.data.as_ref())?;
            report.attachments_saved += 1;
        }
        out.push(PendingAttachment {
            rel_path: format!("attachments/{}", blob.filename),
            original_name: blob.original_name.clone(),
            mime_type: blob.mime_type.clone(),
            digest_hex: blob.digest_hex.clone(),
        });
    }
    Ok(out)
}

fn ensure_convo<'a>(
    map: &'a mut BTreeMap<String, PendingConversation>,
    chat_id: &str,
    conversation_type: ConvType,
    group_title: Option<String>,
) -> &'a mut PendingConversation {
    map.entry(chat_id.to_string())
        .or_insert_with(|| PendingConversation {
            conversation_type,
            group_title,
            participants: BTreeMap::new(),
            messages: Vec::new(),
        })
}

fn add_message(
    conversations: &mut BTreeMap<String, PendingConversation>,
    msg: ParsedMessage,
    pending_atts: Vec<PendingAttachment>,
    report: &mut ExportReport,
) {
    let chat_id = chat_id_for(&msg);
    let convo = ensure_convo(
        conversations,
        &chat_id,
        msg.conversation_type,
        msg.group_title.clone(),
    );
    for (digits, hint) in &msg.participant_digits {
        let entry = convo.participants.entry(digits.clone()).or_insert(None);
        if entry.is_none() {
            *entry = hint.clone();
        }
    }
    if msg.is_from_me {
        report.sent += 1;
    } else {
        report.received += 1;
    }
    let att_names: Vec<_> = pending_atts.iter().map(|a| a.rel_path.clone()).collect();
    let dedupe_key = format!(
        "{}|{}|{}|{}",
        msg.timestamp_secs as i64,
        if msg.is_from_me { "1" } else { "0" },
        msg.text,
        att_names.join(",")
    );
    convo.messages.push(PendingMessage {
        sort_key: msg.timestamp_secs,
        is_from_me: msg.is_from_me,
        sender_digits: msg.sender_digits,
        text: msg.text,
        attachments: pending_atts,
        dedupe_key,
    });
}

fn dedupe_messages(messages: &mut Vec<PendingMessage>) {
    messages.sort_by(|a, b| {
        a.sort_key
            .partial_cmp(&b.sort_key)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut seen = HashSet::new();
    messages.retain(|m| seen.insert(m.dedupe_key.clone()));
}

fn write_conversation(
    output_dir: &Path,
    chat_id: &str,
    convo: &mut PendingConversation,
    exported_at: &str,
    owner_e164: &str,
    report: &mut ExportReport,
) -> Result<()> {
    dedupe_messages(&mut convo.messages);
    convo.messages.retain(|m| {
        if format_local_ts(m.sort_key as i64).is_some() {
            true
        } else {
            report.skipped_invalid_date += 1;
            false
        }
    });
    if convo.messages.is_empty() {
        return Ok(());
    }

    let mut participants: Vec<ParticipantRecord> = convo
        .participants
        .iter()
        .map(|(digits, hint)| ParticipantRecord {
            handle: to_e164(digits),
            name_hint: hint.clone(),
        })
        .collect();
    if convo.conversation_type == ConvType::Group {
        let owner_digits = sanitize_number(owner_e164);
        let has_owner = participants.iter().any(|p| sanitize_number(&p.handle) == owner_digits);
        if !has_owner {
            participants.push(ParticipantRecord {
                handle: owner_e164.to_string(),
                name_hint: None,
            });
        }
    }
    participants.sort_by(|a, b| a.handle.cmp(&b.handle));

    let header = ConversationRecord::header(
        chat_id,
        convo.conversation_type.as_str(),
        convo.group_title.clone(),
        participants,
        exported_at,
    );

    let path = output_dir.join(safe_filename(chat_id));
    let mut file = File::create(&path).with_context(|| format!("create {}", path.display()))?;
    serde_json::to_writer(&mut file, &ExportRecord::Conversation(header))?;
    file.write_all(b"\n")?;

    for msg in &convo.messages {
        let secs = msg.sort_key as i64;
        let (ts_local, ts_utc) = format_local_ts(secs).expect("timestamp validated above");
        let digests: Vec<String> = msg.attachments.iter().map(|a| a.digest_hex.clone()).collect();
        let guid = stable_guid(chat_id, &ts_local, msg.is_from_me, &msg.text, &digests);
        let sender = if msg.is_from_me {
            None
        } else {
            msg.sender_digits.as_ref().map(|d| to_e164(d))
        };
        let text = if msg.text.is_empty() {
            None
        } else {
            Some(msg.text.clone())
        };
        let attachments: Vec<AttachmentRecord> = msg
            .attachments
            .iter()
            .map(|a| AttachmentRecord {
                path: Some(a.rel_path.clone()),
                original_name: a.original_name.clone(),
                mime_type: a.mime_type.clone(),
            })
            .collect();

        let record = MessageRecord::text_message(
            guid,
            ts_local,
            Some(ts_utc),
            msg.is_from_me,
            sender,
            text,
            attachments,
        );
        serde_json::to_writer(&mut file, &ExportRecord::Message(record))?;
        file.write_all(b"\n")?;
    }
    Ok(())
}

fn collect_xml_paths(input: &Path) -> Result<Vec<PathBuf>> {
    if input.is_file() {
        return Ok(vec![input.to_path_buf()]);
    }
    if !input.is_dir() {
        bail!("input is not a file or directory: {}", input.display());
    }
    let mut paths: Vec<PathBuf> = fs::read_dir(input)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("xml"))
        })
        .collect();
    paths.sort();
    if paths.is_empty() {
        bail!("no .xml files found in {}", input.display());
    }
    Ok(paths)
}

/// Convert SMS Backup & Restore XML into message-json SMS schema NDJSON.
pub fn convert_export(
    input: &Path,
    output_dir: &Path,
    owner_phone: &str,
) -> Result<ExportReport> {
    let owner = sanitize_number(owner_phone).context("owner phone has no usable digits")?;
    let owner_e164 = to_e164(&owner);
    let mut report = ExportReport::default();
    let mut conversations: BTreeMap<String, PendingConversation> = BTreeMap::new();

    fs::create_dir_all(output_dir)?;
    for entry in fs::read_dir(output_dir)? {
        let path = entry?.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            let _ = fs::remove_file(&path);
        }
    }
    let attachments_dir = output_dir.join("attachments");
    fs::create_dir_all(&attachments_dir)?;

    for xml_path in collect_xml_paths(input)? {
        match parse_xml_file(&xml_path, &owner) {
            Ok((msgs, stats)) => {
                report.sms_count += stats.sms_count;
                report.mms_count += stats.mms_count;
                report.skipped_invalid_date += stats.skipped_invalid_date;
                report.skipped_unknown_address += stats.skipped_unknown_address;
                report.skipped_unknown_type += stats.skipped_unknown_type;
                report.skipped_empty_participants += stats.skipped_empty_participants;
                report.skipped_bad_attachment += stats.skipped_bad_attachment;
                for msg in msgs {
                    match write_attachments(&msg.attachments, &attachments_dir, &mut report) {
                        Ok(atts) => add_message(&mut conversations, msg, atts, &mut report),
                        Err(err) => report
                            .errors
                            .push(format!("{}: {err:#}", xml_path.display())),
                    }
                }
            }
            Err(err) => report.errors.push(format!("{}: {err:#}", xml_path.display())),
        }
    }

    let exported_at = Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    for (chat_id, mut convo) in conversations {
        write_conversation(
            output_dir,
            &chat_id,
            &mut convo,
            &exported_at,
            &owner_e164,
            &mut report,
        )?;
        if !convo.messages.is_empty() {
            report.conversations += 1;
        }
    }

    Ok(report)
}
