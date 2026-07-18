# sms-backup-restore-exporter-csv

Turn an Android **SMS Backup & Restore** XML file into per-conversation **CSV** (column names aligned with `imessage-exporter-csv`, plus SBR-only fields that preserve full XML attributes).

Part of the [message-vault-rs](../..) Cargo workspace.

[SMS Backup & Restore](https://www.synctech.com.au/sms-backup-restore/) (SyncTech) writes a backup like `sms-20210328165031.xml`. This tool reads that XML and writes one CSV file per conversation, plus decoded MMS media under `attachments/`.

Field meanings: [docs/FIELDS.md](docs/FIELDS.md). XML→CSV mapping: [docs/XML_CSV_MAPPING.md](docs/XML_CSV_MAPPING.md).

## Input

Pass either:

- one `sms-*.xml` file, or
- a directory of `.xml` files (all of them are merged into one export)

The XML root is `<smses>` (current) or `<allsms>` (older backups). Messages live in `<sms>` and `<mms>` elements.

Encrypted `.zip` backups are not unlocked here. Unzip the archive first, then point `--input` at the XML inside.

## Standalone usage

From the repo root:

```bash
cargo run --release -p sms-backup-restore-exporter-csv -- \
  --input /path/to/sms-20210328165031.xml \
  --output ./staging/sms-backup-restore \
  --owner-phone +15555550100
```

Output:

- one `.csv` file per conversation
- `attachments/` for MMS media
- `service` is `"SMS"`; iMessage-only columns are left empty
- SBR-only columns: `message_kind`, `date_ms`, `contact_name`, `android_type`, `xml_fields_json`

## Vault ingest

`message-vault-rs ingest sms-backup-restore` still runs the export into the source staging dir, then **stops**: vault NDJSON import does not accept this CSV yet.

## License

MIT (or match your vault repos).
