//! Import helpers around shared NDJSON schemas.

use anyhow::{bail, Context, Result};
use serde_json::Value;

#[allow(unused_imports)] // re-exported for callers
pub use message_json::imessage::{
    AttachmentRecord, ConversationRecord, ExportRecord, MessageRecord, ParticipantRecord,
    TapbackRecord,
};

/// Strip Apple's attachment object-replacement character (U+FFFC) from body text.
pub fn clean_body(text: Option<&str>) -> Option<String> {
    text.map(|s| s.replace('\u{FFFC}', "").trim().to_string())
        .filter(|s| !s.is_empty())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WireSchema {
    Imessage,
    Sms,
}

impl WireSchema {
    fn from_conversation_value(v: &Value) -> Self {
        if let Some(s) = v.get("schema").and_then(|x| x.as_str()) {
            return match s {
                "sms" => Self::Sms,
                _ => Self::Imessage,
            };
        }
        // Legacy: no schema field — schema_version 3 (or missing) ⇒ imessage.
        match v.get("schema_version").and_then(|x| x.as_u64()) {
            Some(1) => Self::Sms,
            _ => Self::Imessage,
        }
    }
}

fn participant_from_sms(p: message_json::sms::ParticipantRecord) -> ParticipantRecord {
    ParticipantRecord {
        handle: p.handle,
        name_hint: p.name_hint,
    }
}

fn attachment_from_sms(a: message_json::sms::AttachmentRecord) -> AttachmentRecord {
    AttachmentRecord {
        path: a.path,
        original_name: a.original_name,
        mime_type: a.mime_type,
        is_sticker: false,
        transcription: None,
    }
}

fn conversation_from_sms(c: message_json::sms::ConversationRecord) -> ConversationRecord {
    ConversationRecord {
        schema: c.schema,
        schema_version: c.schema_version,
        chat_identifier: c.chat_identifier,
        service: c.service,
        conv_type: c.conv_type,
        group_title: c.group_title,
        participants: c.participants.into_iter().map(participant_from_sms).collect(),
        exported_at: c.exported_at,
    }
}

fn message_from_sms(m: message_json::sms::MessageRecord) -> MessageRecord {
    MessageRecord {
        guid: m.guid,
        timestamp: m.timestamp,
        timestamp_utc: m.timestamp_utc,
        is_from_me: m.is_from_me,
        sender: m.sender,
        service: m.service,
        subject: None,
        text: m.text,
        is_announcement: false,
        announcement: None,
        attachments: m.attachments.into_iter().map(attachment_from_sms).collect(),
        tapbacks: Vec::new(),
        is_reply: false,
        thread_originator_guid: None,
        thread_originator_part: None,
        num_replies: 0,
    }
}

/// Parse NDJSON lines from one file into imessage-shaped records.
///
/// Conversation `schema` selects sms vs imessage parsing for following messages.
/// Missing `schema` with schema_version ≠ 1 is treated as legacy imessage.
pub fn parse_export_lines(lines: impl IntoIterator<Item = String>) -> Result<Vec<ExportRecord>> {
    let mut active_schema: Option<WireSchema> = None;
    let mut records = Vec::new();

    for line in lines {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        records.push(parse_export_line(line, &mut active_schema)?);
    }

    Ok(records)
}

fn parse_export_line(line: &str, active_schema: &mut Option<WireSchema>) -> Result<ExportRecord> {
    let value: Value = serde_json::from_str(line).context("invalid JSON")?;
    let record = value
        .get("record")
        .and_then(|r| r.as_str())
        .unwrap_or("");

    match record {
        "conversation" => {
            let schema = WireSchema::from_conversation_value(&value);
            *active_schema = Some(schema);
            match schema {
                WireSchema::Sms => {
                    let c: message_json::sms::ConversationRecord =
                        serde_json::from_value(value).context("sms conversation")?;
                    Ok(ExportRecord::Conversation(conversation_from_sms(c)))
                }
                WireSchema::Imessage => {
                    let c: ConversationRecord =
                        serde_json::from_value(value).context("imessage conversation")?;
                    Ok(ExportRecord::Conversation(c))
                }
            }
        }
        "message" => {
            let schema = active_schema.unwrap_or(WireSchema::Imessage);
            match schema {
                WireSchema::Sms => {
                    let m: message_json::sms::MessageRecord =
                        serde_json::from_value(value).context("sms message")?;
                    Ok(ExportRecord::Message(message_from_sms(m)))
                }
                WireSchema::Imessage => {
                    let m: MessageRecord =
                        serde_json::from_value(value).context("imessage message")?;
                    Ok(ExportRecord::Message(m))
                }
            }
        }
        other => bail!("unknown NDJSON record type '{other}'"),
    }
}
