# CSV → vault JSON

**csv-ingest** turns per-conversation CSV files into **vault NDJSON** — one JSON object per line that the vault can import. That is all it does. It does not look up contacts or fix phone numbers.

Hand-written examples live under [`crates/csv-ingest/samples/vault/`](../../csv-ingest/samples/vault/). Converter scripts live under [`crates/csv-ingest/python/`](../../csv-ingest/python/).

## Why there is a CSV step

CSV is a plain spreadsheet file (for example `_14075551234.csv`). A person can open it in Excel, Numbers, or Google Sheets, read the chat id, sender, time, and text, and fix mistakes before anything goes into the vault.

1. Export the backup to CSV with [message-exporters](https://github.com/bitrealm-dev/message-exporters).
2. Open the CSV. Fix bad phones, wrong chats, or junk rows — or re-export after fixing the exporter.
3. Run csv-ingest to reshape CSV into vault JSON.
4. Import that JSON into the vault.

Contact names and phone lookup happen in step 1. Android exporters take `--contacts` (a contacts spreadsheet) or `--vcf` (a contacts card file). If a number is still wrong in the CSV, fix the CSV — not the converter.

csv-ingest only copies and reshapes columns. Wrong CSV becomes wrong vault data.

## Pipeline

```
backup + contacts.csv or .vcf
  → message-exporters (name and phone lookup)
  → staging CSV (open and edit here)
  → csv-ingest (reshape only)
  → vault NDJSON
  → vault import
```

## Vault NDJSON

**NDJSON** means one JSON object per line in a `.json` file.

Every conversation file starts with a **conversation** line, then **message** lines. The format is the vault schema: `schema` is `"vault"` and `schema_version` is `1`. SMS, iMessage, and other channels use the same shape. The `service` field says which channel (`SMS`, `iMessage`, and so on). Extra iMessage-only fields are left out when unused.

Example conversation line (shortened):

```json
{"record":"conversation","schema":"vault","schema_version":1,"chat_identifier":"+14075551234","service":"SMS","conversation_type":"individual","participants":[{"handle":"+14075551234","name_hint":"Alice"}]}
```

Example message line (shortened):

```json
{"record":"message","guid":"…","timestamp":"2021-01-01T00:00:00Z","is_from_me":false,"sender":"+14075551234","service":"SMS","text":"smoke hello"}
```

Which backup the data came from is the vault **source id** in config (for example `go-sms-pro`), not a field on every JSON line. The CSV column `export_source` only helps csv-ingest pick the right converter.

## Conversation header (first line)

Matches [`message_json::vault::ConversationRecord`](../src/vault.rs):

| Field | Required | Meaning |
|-------|----------|---------|
| `record` | yes | Always `"conversation"` |
| `schema` | yes | Always `"vault"` |
| `schema_version` | yes | Always `1` |
| `chat_identifier` | yes | Who the chat is with (for example `+14075551234`) |
| `service` | yes | From the CSV `service` cell, or the converter default (`SMS`, `iMessage`, …) |
| `conversation_type` | yes | `individual` or `group` |
| `group_title` | no | Group display name when present |
| `participants` | yes | People in the chat (from peers, senders, or `participants_json`) |
| `exported_at` | no | UTC time when the converter ran |

## Message fields

### Core (every source)

| Field | Required | Comes from CSV |
|-------|----------|----------------|
| `record` | yes | Always `"message"` |
| `guid` | yes* | `guid`, or a generated id if empty |
| `timestamp` | yes† | `timestamp` |
| `timestamp_utc` | no | `timestamp_utc` |
| `is_from_me` | yes | `direction` — `outgoing` means true |
| `sender` | no | `sender_handle` on incoming messages |
| `service` | no | `service`, or the converter default |
| `subject` | no | `subject` |
| `text` | yes‡ | `text` |
| `attachments` | yes‡ | Parsed from `attachments_json` |

\* If `guid` is empty, the converter builds a stable SHA-256 hex from `chat_identifier`, `timestamp`, `is_from_me`, `text`, and attachment paths.  
† Use `timestamp_utc` if `timestamp` is empty.  
‡ Need non-empty `text`, or attachments, or an announcement (below).

### Rich fields (mostly iMessage; omit when empty)

| Field | Comes from CSV |
|-------|----------------|
| `tapbacks` | `tapbacks_json` |
| `is_reply`, `thread_originator_guid`, `thread_originator_part`, `num_replies` | matching columns |
| `is_announcement`, `announcement` | matching columns |
| `read_receipt`, `is_deleted`, `send_effect`, `shared_location` | matching columns |
| `parts`, `edits`, `app` | `parts_json`, `edits_json`, `app_json` |

### CSV columns that never become vault JSON

These stay in the spreadsheet for debugging only: `export_source`, `timestamp_display`, `source_kind`, `android_type`, `date_ms`, `contact_name`, `pdu_filename`, `xml_fields_json`, `smssync_id`, `eml_path`, `message_kind`, and similar.

## What a CSV row needs

The converter skips a row unless it can build:

1. `chat_identifier`
2. `timestamp` or `timestamp_utc`
3. `direction` (to set `is_from_me`)
4. `text` and/or attachments, **or** `is_announcement` plus `announcement`

Most exporters already use column names close to the vault fields (`chat_identifier`, `direction`, `attachments_json`, …).

**iMazing** is different. Its CSV uses headers like `Chat Session` and `Message Date`. That path is handled by [`imazing_to_vault.py`](../../csv-ingest/python/imazing_to_vault.py).

## HTTP import

The same vault NDJSON is the body for `message-vault-rs serve` → `POST /v1/import`. Details: [`crates/csv-ingest/README.md`](../../csv-ingest/README.md#http-ingest) and the root README.
