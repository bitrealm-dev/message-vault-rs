//! Convert GO SMS Pro export → SMS NDJSON (`message_json::sms`).

use crate::phone::{owner_digits, sanitize_number, to_e164};
use crate::owner_set::OwnerPhoneSet;
use crate::pdu::{parse_pdu_file, ParsedPdu};
use crate::xml::{parse_xml_file, XmlMessage};
use anyhow::{bail, Context, Result};
use chrono::{Local, TimeZone, Utc};
use message_json::sms::{
    stable_guid, AttachmentRecord, ConversationRecord, ExportRecord, MessageRecord,
    ParticipantRecord,
};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Default)]
pub struct ExportReport {
    pub conversations: u64,
    pub xml_messages: u64,
    pub pdu_messages: u64,
    pub pdu_group_messages: u64,
    pub attachments_saved: u64,
    pub sent: u64,
    pub received: u64,
    pub skipped_invalid_date: u64,
    pub skipped_unknown_type: u64,
    pub skipped_unparseable_pdu: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone)]
struct PendingAttachment {
    /// Relative path under export dir, e.g. `attachments/20200101_000000-I_…_1.jpg`
    rel_path: String,
    original_name: Option<String>,
    mime_type: Option<String>,
    /// Bytes already written (for guid fingerprint).
    digest_hex: String,
}

#[derive(Debug, Clone)]
struct PendingMessage {
    sort_key: f64,
    is_from_me: bool,
    sender_digits: Option<String>,
    text: String,
    attachments: Vec<PendingAttachment>,
    /// For within-thread dedupe.
    dedupe_key: String,
}

#[derive(Debug, Default)]
struct PendingConversation {
    conversation_type: String,
    group_title: Option<String>,
    /// digits → optional name hint
    participants: BTreeMap<String, Option<String>>,
    messages: Vec<PendingMessage>,
}

fn mime_for_ext(ext: &str) -> Option<&'static str> {
    match ext {
        ".jpg" | ".jpeg" => Some("image/jpeg"),
        ".png" => Some("image/png"),
        ".gif" => Some("image/gif"),
        ".3gp" => Some("video/3gpp"),
        ".mp4" => Some("video/mp4"),
        ".amr" => Some("audio/amr"),
        ".wav" => Some("audio/wav"),
        _ => None,
    }
}

fn format_local_ts(secs: i64) -> (String, String) {
    let local = Local
        .timestamp_opt(secs, 0)
        .single()
        .unwrap_or_else(|| Local.from_utc_datetime(&Utc.timestamp_opt(secs, 0).single().unwrap().naive_utc()));
    let utc = local.with_timezone(&Utc);
    (
        local.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        utc.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    )
}

fn chat_id_individual(digits: &str) -> String {
    to_e164(digits)
}

fn chat_id_group(participant_digits: &[String], owners: &OwnerPhoneSet) -> (String, String) {
    let mut others: Vec<String> = participant_digits
        .iter()
        .filter(|d| !owners.is_owner(d) && *d != "Unknown")
        .cloned()
        .collect();
    others.sort();
    others.dedup();
    let title = if others.is_empty() {
        "Group".to_string()
    } else if others.len() <= 4 {
        format!(
            "Group: {}",
            others
                .iter()
                .map(|d| to_e164(d))
                .collect::<Vec<_>>()
                .join(", ")
        )
    } else {
        format!(
            "Group: {}, and {} others",
            others[..4]
                .iter()
                .map(|d| to_e164(d))
                .collect::<Vec<_>>()
                .join(", "),
            others.len() - 4
        )
    };
    let slug = others
        .iter()
        .map(|d| d.as_str())
        .collect::<Vec<_>>()
        .join("_");
    let id = if slug.is_empty() {
        "chat-group-unknown".to_string()
    } else {
        format!("chat-group-{slug}")
    };
    // Keep filesystem-safe length.
    let id = if id.len() > 180 {
        let digest = hex::encode(Sha256::digest(id.as_bytes()));
        format!("chat-group-{}", &digest[..16])
    } else {
        id
    };
    (id, title)
}

fn safe_filename(chat_id: &str) -> String {
    chat_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
        + ".json"
}

fn ensure_convo<'a>(
    map: &'a mut BTreeMap<String, PendingConversation>,
    chat_id: &str,
    conversation_type: &str,
    group_title: Option<String>,
) -> &'a mut PendingConversation {
    map.entry(chat_id.to_string())
        .or_insert_with(|| PendingConversation {
            conversation_type: conversation_type.to_string(),
            group_title,
            participants: BTreeMap::new(),
            messages: Vec::new(),
        })
}

fn add_xml_messages(
    conversations: &mut BTreeMap<String, PendingConversation>,
    msgs: Vec<XmlMessage>,
) {
    for msg in msgs {
        let chat_id = chat_id_individual(&msg.other_digits);
        let convo = ensure_convo(conversations, &chat_id, "individual", None);
        convo
            .participants
            .entry(msg.other_digits.clone())
            .or_insert_with(|| msg.name_hint.clone());
        if let Some(hint) = &msg.name_hint {
            if let Some(slot) = convo.participants.get_mut(&msg.other_digits) {
                if slot.is_none() {
                    *slot = Some(hint.clone());
                }
            }
        }
        let dedupe_key = format!(
            "{}|{}|{}|",
            msg.timestamp_secs as i64,
            if msg.is_from_me { "1" } else { "0" },
            msg.text
        );
        convo.messages.push(PendingMessage {
            sort_key: msg.timestamp_secs,
            is_from_me: msg.is_from_me,
            sender_digits: msg.sender_digits,
            text: msg.text,
            attachments: Vec::new(),
            dedupe_key,
        });
    }
}

fn save_pdu_attachments(
    parsed: &ParsedPdu,
    attachments_dir: &Path,
    report: &mut ExportReport,
) -> Result<Vec<PendingAttachment>> {
    fs::create_dir_all(attachments_dir)?;
    let date_prefix = Local
        .timestamp_opt(parsed.timestamp, 0)
        .single()
        .map(|t| t.format("%Y%m%d_%H%M%S").to_string())
        .unwrap_or_else(|| parsed.timestamp.to_string());

    let mut out = Vec::new();
    for (idx, att) in parsed.attachments.iter().enumerate() {
        let name = format!(
            "{}-I_{}_{}{}",
            date_prefix,
            parsed.timestamp,
            idx + 1,
            att.ext
        );
        let path = attachments_dir.join(&name);
        if !path.exists() {
            fs::write(&path, &att.data)?;
            report.attachments_saved += 1;
        }
        let digest_hex = hex::encode(Sha256::digest(&att.data));
        out.push(PendingAttachment {
            rel_path: format!("attachments/{name}"),
            original_name: att.smil_name.clone().or(Some(name)),
            mime_type: mime_for_ext(&att.ext).map(|s| s.to_string()),
            digest_hex,
        });
    }
    Ok(out)
}

fn add_pdu_message(
    conversations: &mut BTreeMap<String, PendingConversation>,
    parsed: ParsedPdu,
    attachments: Vec<PendingAttachment>,
    owners: &OwnerPhoneSet,
    report: &mut ExportReport,
) {
    report.pdu_messages += 1;
    if parsed.is_sent {
        report.sent += 1;
    } else {
        report.received += 1;
    }

    let targets: Vec<(String, String, Option<String>)> = if parsed.is_group {
        report.pdu_group_messages += 1;
        let (id, title) = chat_id_group(&parsed.participants, owners);
        vec![(id, "group".to_string(), Some(title))]
    } else {
        let others: Vec<_> = parsed
            .participants
            .iter()
            .filter(|p| !owners.is_owner(p))
            .cloned()
            .collect();
        if others.is_empty() {
            return;
        }
        let other = &others[0];
        vec![(
            chat_id_individual(other),
            "individual".to_string(),
            None,
        )]
    };

    let att_names: Vec<String> = attachments.iter().map(|a| a.rel_path.clone()).collect();
    let dedupe_key = format!(
        "{}|{}|{}|{}",
        parsed.timestamp,
        if parsed.is_sent { "1" } else { "0" },
        parsed.body,
        att_names.join(",")
    );

    let pending = PendingMessage {
        sort_key: parsed.timestamp as f64,
        is_from_me: parsed.is_sent,
        sender_digits: if parsed.is_sent {
            None
        } else {
            Some(parsed.sender_number.clone())
        },
        text: parsed.body.clone(),
        attachments,
        dedupe_key,
    };

    for (chat_id, conversation_type, group_title) in targets {
        let convo = ensure_convo(conversations, &chat_id, &conversation_type, group_title);
        if conversation_type == "group" {
            for p in &parsed.participants {
                if !owners.is_owner(p) {
                    convo.participants.entry(p.clone()).or_insert(None);
                }
            }
        } else if let Some(other) = parsed.participants.iter().find(|p| !owners.is_owner(p)) {
            convo.participants.entry(other.clone()).or_insert(None);
        }
        convo.messages.push(pending.clone());
    }
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
) -> Result<()> {
    dedupe_messages(&mut convo.messages);
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
    // Include owner in participant list for groups (imessage style often lists all).
    if convo.conversation_type == "group"
        && !participants
            .iter()
            .any(|p| sanitize_number(&p.handle) == sanitize_number(owner_e164))
    {
        participants.push(ParticipantRecord {
            handle: owner_e164.to_string(),
            name_hint: None,
        });
    }
    participants.sort_by(|a, b| a.handle.cmp(&b.handle));

    let header = ConversationRecord::header(
        chat_id,
        convo.conversation_type.clone(),
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
        let (ts_local, ts_utc) = format_local_ts(secs);
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

/// Convert a GO SMS Pro export directory into SMS NDJSON (`message_json::sms`).
pub fn convert_export(
    input_dir: &Path,
    output_dir: &Path,
    owner_phones: &[String],
) -> Result<ExportReport> {
    if !input_dir.is_dir() {
        bail!("input is not a directory: {}", input_dir.display());
    }

    let owners = OwnerPhoneSet::new(owner_phones)?;
    let owner = owners.primary_digits.clone();
    let owner_e164 = owners.primary_e164.clone();
    let mut report = ExportReport::default();
    let mut conversations: BTreeMap<String, PendingConversation> = BTreeMap::new();

    // Clean previous NDJSON (keep attachments if re-run; rewrite as needed).
    fs::create_dir_all(output_dir)?;
    for entry in fs::read_dir(output_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            let _ = fs::remove_file(&path);
        }
    }
    let attachments_dir = output_dir.join("attachments");
    fs::create_dir_all(&attachments_dir)?;

    let mut xml_paths: Vec<PathBuf> = fs::read_dir(input_dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("xml"))
        })
        .collect();
    xml_paths.sort();

    for xml_path in xml_paths {
        match parse_xml_file(&xml_path, &owner) {
            Ok((msgs, stats)) => {
                report.xml_messages += stats.messages;
                report.skipped_invalid_date += stats.skipped_invalid_date;
                report.skipped_unknown_type += stats.skipped_unknown_type;
                report.sent += stats.sent;
                report.received += stats.received;
                add_xml_messages(&mut conversations, msgs);
            }
            Err(err) => report.errors.push(format!("{}: {err:#}", xml_path.display())),
        }
    }


    let mut pdu_paths: Vec<PathBuf> = fs::read_dir(input_dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("I_") && n.ends_with(".pdu"))
        })
        .collect();
    pdu_paths.sort();

    for pdu_path in pdu_paths {
        match parse_pdu_file(&pdu_path, &owners.all_digits, &owners.primary_digits) {
            Ok(None) => {
                report.skipped_unparseable_pdu += 1;
                if report.errors.len() < 20 {
                    report
                        .errors
                        .push(format!("{}: unparseable PDU", pdu_path.display()));
                }
            }
            Ok(Some(parsed)) => match save_pdu_attachments(&parsed, &attachments_dir, &mut report)
            {
                Ok(atts) => add_pdu_message(
                    &mut conversations,
                    parsed,
                    atts,
                    &owners,
                    &mut report,
                ),
                Err(err) => report
                    .errors
                    .push(format!("{}: {err:#}", pdu_path.display())),
            },
            Err(err) => report.errors.push(format!("{}: {err:#}", pdu_path.display())),
        }
    }

    let exported_at = Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    for (chat_id, mut convo) in conversations {
        write_conversation(output_dir, &chat_id, &mut convo, &exported_at, &owner_e164)?;
        report.conversations += 1;
    }

    Ok(report)
}
