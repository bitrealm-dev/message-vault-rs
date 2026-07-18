# SMS Backup & Restore XML → CSV mapping

How SyncTech `<sms>` / `<mms>` elements map to per-conversation CSV rows written by `sms-backup-restore-exporter-csv`.

Attribute meanings: [FIELDS.md](FIELDS.md).

## Output

One `{chat_id}.csv` per conversation (header + one row per message), plus decoded MMS media under `attachments/`.

## Shared columns (imessage-csv names)

Filled from parsed messages when available; iMessage-only columns left empty.

| CSV column | SMS / MMS source |
|------------|------------------|
| `chat_identifier` | Peer E.164, or `chat-group-…` for groups |
| `conversation_type` | `individual` / `group` |
| `group_title` | Derived for groups; empty for 1:1 |
| `participants_json` | `[{ "handle", "display_name" }, …]` |
| `guid` | Deterministic SHA-256 fingerprint |
| `timestamp` / `timestamp_utc` / `timestamp_display` | From `date` (Java ms UTC) |
| `direction` | `incoming` / `outgoing` from SMS `type` or MMS `msg_box` / From addr |
| `service` | Always `SMS` |
| `sender_handle` / `sender_display_name` | Empty when outgoing |
| `subject` | SMS `subject`, or MMS `sub` |
| `text` | SMS `body`, or MMS text/plain parts (HTML entities decoded) |
| `attachments_json` | Extracted MMS media paths |

Left empty: `read_receipt`, `is_deleted`, `send_effect`, `shared_location`, `is_announcement`, `announcement`, `is_reply`, `thread_originator_*`, `num_replies`, `parts_json`, `edits_json`, `tapbacks_json`, `app_json`.

## SBR-only columns

| CSV column | Meaning |
|------------|---------|
| `message_kind` | `sms` or `mms` |
| `date_ms` | Raw `date` attribute |
| `contact_name` | Raw `contact_name` / `name` |
| `android_type` | SMS `type`, or MMS `msg_box` |
| `xml_fields_json` | Full fidelity JSON (below) |

## `xml_fields_json`

### SMS

```json
{ "kind": "sms", "attrs": { /* every <sms> attribute */ } }
```

### MMS

```json
{
  "kind": "mms",
  "attrs": { /* every <mms> attribute */ },
  "parts": [ { /* every <part> attribute */ } ],
  "addrs": [ { /* every <addr> attribute */ } ]
}
```

For each `<part>` that has a `data` attribute, CSV stores `data_len` and `data_sha256` of the **decoded** bytes and **omits** the base64 `data` string (binaries live under `attachments/`). Other part attributes (`seq`, `ct`, `name`, `cl`, `chset`, `text`, …) are kept as-is.

## Not exported

`<call>` / call-log rows in the same backup file are ignored.
