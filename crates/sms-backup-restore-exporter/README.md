# sms-backup-restore-exporter

Turn an Android **SMS Backup & Restore** XML file into [`message-json`](../message-json) **SMS** NDJSON for this vault.

Part of the [message-vault-rs](../..) Cargo workspace. Prefer the vault’s `ingest` command unless you are debugging the exporter alone.

[SMS Backup & Restore](https://www.synctech.com.au/sms-backup-restore/) (SyncTech) writes a backup like `sms-20210328165031.xml`. This tool reads that XML and writes one JSON file per conversation, plus decoded MMS media under `attachments/`.

The output uses the [`message-json`](../message-json) **SMS** schema (`"schema": "sms"`, version `1`). Each record has `"service": "SMS"`.

## Input

Pass either:

- one `sms-*.xml` file, or
- a directory of `.xml` files (all of them are merged into one export)

The XML root is `<smses>` (current) or `<allsms>` (older backups). Messages live in `<sms>` and `<mms>` elements.

Field meanings: [docs/FIELDS.md](docs/FIELDS.md) (from SyncTech’s [fields page](https://www.synctech.com.au/sms-backup-restore/fields-in-xml-backup-files/)).

Encrypted `.zip` backups are not unlocked here. Unzip the archive first, then point `--input` at the XML inside.

## Preferred: vault ingest

From the repo root:

```bash
cargo run --release -- ingest sms-backup-restore --from /path/to/sms-20210328165031.xml
```

Or with the archive helper: `./scripts/ingest-staging.sh sms-backup-restore`.

## Standalone usage

From the repo root:

```bash
cargo run --release -p sms-backup-restore-exporter -- \
  --input /path/to/sms-20210328165031.xml \
  --output ./staging/sms-backup-restore \
  --owner-phone +15555550100
```

| Flag | Meaning |
|------|---------|
| `--input` | XML file, or a folder of `.xml` files |
| `--output` | Folder for the NDJSON files and `attachments/` |
| `--owner-phone` | Required. Your phone number (E.164 like `+15555550100`, or digits). Used to tell sent vs received and to build group chats. |

On success, a short report prints conversation count, SMS/MMS counts, attachment count, and any skipped rows.

Existing `*.json` files in `--output` are removed before a new run. Attachment files under `attachments/` are kept if the same filename already exists.

## Output layout

```
export/
  +15555550100.json          # one conversation (1:1 chat)
  chat-group-....json        # group MMS thread
  attachments/
    20140522_123101_a1b2c3d4e5f67890_pic.jpg  # digest-prefixed MMS media
```

Each `.json` file is **NDJSON**: one JSON object per line.

1. First line: a conversation header (`"record": "conversation"`).
2. Following lines: messages (`"record": "message"`), oldest first after dedupe.

Example 1:1 file name: `+15555550101.json` for a chat with Sam at that number.

Example group file name: `chat-group-5555550101_5555550102.json` (or a short hash if the id is very long).

## How messages are mapped

**SMS (`<sms>`)**

- `type="1"` → received (`is_from_me: false`)
- `type="2"` → sent (`is_from_me: true`)
- Drafts, outbox, failed, and queued (`3`–`6`) are skipped
- Chat id is the other person’s number in E.164 form (`+1…` for 10-digit US numbers)

**MMS (`<mms>`)**

- Text comes from `text/plain` parts (SMIL order when a SMIL layout part is present)
- Binary parts (`image/jpeg`, video, audio, …) are decoded from base64 into `attachments/`
- `msg_box="2"` → sent; otherwise received when a From addr (`type="137"`) is available
- One other person → individual chat; more than one → group chat titled from the other numbers

**Dedupe**

If the same message appears twice (same time, direction, text, and attachment paths), only one copy is kept. That matters when `--input` is a folder with overlapping backups.

Phone numbers are normalized in a US-centric way: non-digits stripped, a leading US `1` removed, then formatted as `+1` + 10 digits when possible.

## Import into the vault

Point a vault source `export_dir` at this tool’s `--output` folder (see `config/config.toml`), then from the repo root:

```bash
cargo run --release -- import --source sms-backup-restore --mode append
cargo run --release -- dedupe-cross-source
```

`--mode append` keeps existing rows and skips duplicates by `(source, guid)`. Use `--mode replace` to wipe that source and re-import.

## What this tool does not do

| Topic | Why |
|-------|-----|
| Call logs (`<call>`) | The SMS NDJSON schema has no call model, so calls are ignored even when present in the XML |
| Encrypted zip unlock | Only plain XML is read; unzip first |
| Matching against iMessage | Vault treats each import source separately; cross-app merge is a vault concern, not this exporter’s |

Skipped SMS/MMS rows (bad date, unknown address, unsupported type, empty participants, bad attachment base64) show up in the run report rather than failing the whole export.
