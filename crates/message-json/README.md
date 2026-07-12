# message-json

Shared **NDJSON interchange** schemas for message archives.

Exporters in this workspace produce these records; the vault binary imports them.

## Modules

| Module | Role |
|--------|------|
| [`imessage`](src/imessage.rs) | iOS / iMessage schema (historically imessage-exporter-json **v3**): tapbacks, replies, announcements, stickers, transcription |
| [`sms`](src/sms.rs) | Common SMS/MMS schema for GO SMS Pro, SMS Backup & Restore, and SMS Backup+ |

Conversation headers include a `"schema"` discriminator (`"imessage"` or `"sms"`) plus `schema_version`.

## Usage

Workspace members depend on this crate via the root `Cargo.toml` workspace. From another crate in the same repo:

```toml
message_json = { path = "../message-json" }
```

```rust
use message_json::sms::{
    stable_guid, AttachmentRecord, ConversationRecord, ExportRecord, MessageRecord,
    ParticipantRecord,
};

let header = ConversationRecord::header(
    "+15551212",
    "individual",
    None,
    vec![ParticipantRecord {
        handle: "+15551212".into(),
        name_hint: None,
    }],
    "2024-01-01T00:00:00Z",
);
serde_json::to_writer(stdout, &ExportRecord::Conversation(header))?;
```

## Out of scope

Phone normalization, emoji decoding, SMIL/MMS parsing, and archive-format readers stay in the exporter crates.
