use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(tag = "record", rename_all = "snake_case")]
pub enum ExportRecord {
    Conversation(ConversationRecord),
    Message(MessageRecord),
}

#[derive(Debug, Deserialize)]
pub struct ConversationRecord {
    pub chat_identifier: String,
    pub service: Option<String>,
    #[serde(rename = "type")]
    pub conv_type: String,
    pub group_title: Option<String>,
    #[serde(default)]
    pub participants: Vec<ParticipantRecord>,
    pub exported_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ParticipantRecord {
    pub handle: String,
    pub name_hint: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MessageRecord {
    pub guid: Option<String>,
    pub timestamp: String,
    pub timestamp_utc: Option<String>,
    pub timestamp_read: Option<String>,
    pub timestamp_delivered: Option<String>,
    pub is_from_me: bool,
    pub sender: Option<String>,
    pub service: Option<String>,
    pub subject: Option<String>,
    pub text: Option<String>,
    #[serde(default)]
    pub is_announcement: bool,
    pub announcement: Option<String>,
    #[serde(default)]
    pub is_deleted: bool,
    pub expressive: Option<String>,
    pub shared_location: Option<String>,
    pub balloon: Option<Value>,
    #[serde(default)]
    pub parts: Vec<Value>,
    #[serde(default)]
    pub edits: Vec<Value>,
    #[serde(default)]
    pub attachments: Vec<AttachmentRecord>,
    #[serde(default)]
    pub tapbacks: Vec<TapbackRecord>,
    #[serde(default)]
    pub is_reply: bool,
    pub thread_originator_guid: Option<String>,
    pub thread_originator_part: Option<i64>,
    #[serde(default)]
    pub num_replies: i64,
}

#[derive(Debug, Deserialize)]
pub struct AttachmentRecord {
    pub path: Option<String>,
    pub original_name: Option<String>,
    pub mime_type: Option<String>,
    #[serde(default)]
    pub is_sticker: bool,
    pub transcription: Option<String>,
    pub genmoji_prompt: Option<String>,
    pub sticker_effect: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TapbackRecord {
    #[serde(default)]
    pub part_index: i64,
    pub kind: String,
    pub emoji: Option<String>,
    #[serde(default)]
    pub is_from_me: bool,
    pub sender: Option<String>,
}

/// Strip Apple's attachment object-replacement character (U+FFFC) from body text.
pub fn clean_body(text: Option<&str>) -> Option<String> {
    text.map(|s| s.replace('\u{FFFC}', "").trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Serialize a non-empty JSON array to a TEXT column value.
pub fn json_array_column(values: &[Value]) -> Option<String> {
    if values.is_empty() {
        None
    } else {
        Some(serde_json::to_string(values).expect("serde_json::Value serializes"))
    }
}

/// Serialize an optional JSON object to a TEXT column value.
pub fn json_value_column(value: &Option<Value>) -> Option<String> {
    value
        .as_ref()
        .map(|v| serde_json::to_string(v).expect("serde_json::Value serializes"))
}
