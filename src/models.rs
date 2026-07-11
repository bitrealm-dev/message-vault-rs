//! Import helpers around the shared NDJSON schema.

#[allow(unused_imports)] // re-exported for callers / future use
pub use message_json::v3::{
    AttachmentRecord, ConversationRecord, ExportRecord, MessageRecord, ParticipantRecord,
    TapbackRecord,
};

/// Strip Apple's attachment object-replacement character (U+FFFC) from body text.
pub fn clean_body(text: Option<&str>) -> Option<String> {
    text.map(|s| s.replace('\u{FFFC}', "").trim().to_string())
        .filter(|s| !s.is_empty())
}
