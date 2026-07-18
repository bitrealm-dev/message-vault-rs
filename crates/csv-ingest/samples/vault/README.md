# Vault NDJSON samples

Hand-written examples of the **vault** message shape (`schema: "vault"`).
Each file is a tiny NDJSON stream: one conversation header, then one or more messages.
Unused rich fields are omitted (no empty `tapbacks`, `parts`, etc.).

For a real conversion output from GO SMS Pro CSV, see [`../converted/_14075551234.json`](../converted/_14075551234.json).

## Samples

| File | Shape |
|------|--------|
| [`01-sms-text.json`](01-sms-text.json) | Plain SMS text (lean Android style) |
| [`02-sms-attachment.json`](02-sms-attachment.json) | Attachment-only (no `text`) |
| [`03-sms-subject.json`](03-sms-subject.json) | SMS with `subject` |
| [`04-imessage-text.json`](04-imessage-text.json) | Plain iMessage text |
| [`05-imessage-tapback.json`](05-imessage-tapback.json) | Text + `tapbacks` |
| [`06-imessage-reply.json`](06-imessage-reply.json) | Thread reply |
| [`07-imessage-announcement.json`](07-imessage-announcement.json) | Group system announcement |
| [`08-group-conversation.json`](08-group-conversation.json) | Group header + message |

## Minimum fields

### Conversation header (every file)

| Field | Required |
|-------|----------|
| `record` | `"conversation"` |
| `schema` | `"vault"` |
| `schema_version` | `1` |
| `chat_identifier` | yes |
| `conversation_type` | `"individual"` or `"group"` |
| `participants` | yes (may be empty array only if unknown) |
| `service` | yes when known (`SMS`, `iMessage`, …) |
| `group_title` | only for groups when known |
| `exported_at` | optional |

### Every message

| Field | Required |
|-------|----------|
| `record` | `"message"` |
| `guid` | yes in hand-written NDJSON; CSV→vault may omit CSV `guid` and let `csv-ingest` generate one |
| `timestamp` | yes (or `timestamp_utc` alone via converter) |
| `is_from_me` | yes |
| body | non-empty `text`, or non-empty `attachments`, or (`is_announcement` + `announcement`) |

### GUID (CSV → vault)

1. If the mapped CSV `guid` cell is non-empty → copy it.
2. If empty → `csv-ingest` hashes `chat_identifier | timestamp | is_from_me | text | attachment paths` (SHA-256 hex).

### Per-shape extras

| Shape | Extra fields when used |
|-------|------------------------|
| Incoming | `sender` |
| Attachment-only | `attachments` (≥1); omit `text` |
| Subject | `subject` |
| Tapback | `tapbacks` (≥1) |
| Reply | `is_reply: true`, usually `thread_originator_guid` |
| Announcement | `is_announcement: true`, `announcement` |
| Group | header `conversation_type: "group"`; `group_title` when known |
| iMessage-only rich | `read_receipt`, `send_effect`, `shared_location`, `is_deleted`, `parts`, `edits`, `app` — only when present |

### CSV row minima (before convert)

`chat_identifier`, `timestamp` or `timestamp_utc`, `direction`, and text and/or attachments (or announcement columns when mapped).

## Example: lean SMS vs tapback

Lean SMS message line (keys only):

```json
{"record":"message","guid":"…","timestamp":"…","is_from_me":false,"sender":"+14075551234","service":"SMS","text":"smoke hello"}
```

Same schema with a tapback — only the extra section appears:

```json
{"record":"message","guid":"…","timestamp":"…","is_from_me":false,"sender":"+15551212","service":"iMessage","text":"hello","tapbacks":[{"part_index":0,"kind":"loved","is_from_me":true}]}
```
