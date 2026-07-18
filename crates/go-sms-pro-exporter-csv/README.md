# go-sms-pro-exporter-csv

Convert a **GO SMS Pro** (GOMO / Jiubang) local backup into per-conversation **CSV** (column names aligned with `imessage-exporter-csv`, plus SMS-Pro-only fields).

Part of the [message-vault-rs](../..) Cargo workspace. Field mapping: [`docs/XML_CSV_MAPPING.md`](docs/XML_CSV_MAPPING.md).

## Input

A directory containing:

- `gosms_sys*.xml` — SMS (`<GoSms><SMS>…`)
- `I_<unix>_*.pdu` — MMS PDU blobs (attachments extracted by magic-byte heuristics)

There is no public GO SMS Pro backup spec; XML fields mirror [Android Telephony SMS columns](https://developer.android.com/reference/android/provider/Telephony.TextBasedSmsColumns). PDU parsing follows heuristics from the personal `message-vault` GoSMS converter (reference only).

## Standalone usage

From the repo root:

```bash
cargo run --release -p go-sms-pro-exporter-csv -- \
  --input /path/to/gosms_export \
  --output ./staging/go-sms-pro \
  --owner-phone +15555550100
```

Output:

- one `.csv` file per conversation (header row + one row per message)
- `attachments/` for media extracted from PDUs
- `service` is `"SMS"`; iMessage-only columns are left empty
- SMS-Pro-only columns: `source_kind`, `android_type`, `date_ms`, `contact_name`, `pdu_filename`, `xml_fields_json`

## Vault ingest

`message-vault-rs ingest go-sms-pro` still runs the export into the source staging dir, then **stops**: vault NDJSON import does not accept this CSV yet.

## License

MIT (or match your vault repos).
