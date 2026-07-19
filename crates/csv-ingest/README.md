# csv-ingest

Convert per-conversation **CSV** into **vault NDJSON** using Python converters. Rust provides the CLI and a thin dispatcher that shells out to `python3`.

Ingest contract: [`../message-json/docs/CSV_INGEST.md`](../message-json/docs/CSV_INGEST.md).

## Why CSV exists

CSV is the **human checkpoint**: open it in a spreadsheet, spot bad phones / wrong chats / junk rows, edit or re-export, then convert. That is why the pipeline is not backup → vault JSON in one opaque step.

## What this tool does *not* do

**No contact or phone-number lookup.** Resolving names → handles and normalizing phones happens when the CSV is produced (e.g. [message-exporters](https://github.com/bitrealm-dev/message-exporters)), or when the user edits the CSV. CSV → JSON only reshapes fields already on the sheet. Do not add VCF, contacts.csv, or fuzzy name matching here — that would hide problems the CSV stage is meant to surface.

## Usage

```bash
# Detect source from CSV (export_source column or iMazing headers)
cargo run -p csv-ingest -- \
  --input ./staging/go-sms-pro \
  --output ./staging/go-sms-pro

# Or pass --source-id explicitly
cargo run -p csv-ingest -- \
  --input crates/csv-ingest/samples/csv/imessage.csv \
  --output /tmp/vault-out \
  --source-id imessage
```

Writes one `{stem}.json` NDJSON file per `{stem}.csv` (conversation header + message lines). Attachment paths in CSV are left as relative strings.

Requires **Python 3.9+** (`zoneinfo` for iMazing). No third-party packages.

## Converters (one script per source)

| Source id | Script |
|-----------|--------|
| `go-sms-pro` | [`python/go_sms_pro_to_vault.py`](python/go_sms_pro_to_vault.py) |
| `sms-backup-plus` | [`python/sms_backup_plus_to_vault.py`](python/sms_backup_plus_to_vault.py) |
| `sms-backup-restore` | [`python/sms_backup_restore_to_vault.py`](python/sms_backup_restore_to_vault.py) |
| `imessage` | [`python/imessage_to_vault.py`](python/imessage_to_vault.py) |
| `imazing` | [`python/imazing_to_vault.py`](python/imazing_to_vault.py) |

Shared reshape helpers: [`python/exporter_csv.py`](python/exporter_csv.py), [`python/vault_common.py`](python/vault_common.py). Copy a per-source script as a template when adding another exporter — see [`python/README.md`](python/README.md).

## Samples

- [`samples/csv/`](samples/csv/) — one CSV from each exporter (side-by-side column sets)
- [`samples/vault/`](samples/vault/) — hand-written vault NDJSON per message shape
- [`samples/converted/`](samples/converted/) — example conversion output

## HTTP ingest

The NDJSON this tool writes is the body for the vault HTTP import API:

```bash
# config.toml needs [server] api_token=…
cargo run --release -- serve

curl -X POST "http://127.0.0.1:8080/v1/import?source=<id>&account=<uuid>&mode=append" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @path/to/conversation.json
```

See the root README and `./scripts/smoke-import-api.sh`. This crate only produces NDJSON; the vault binary serves `/v1/import`.

## License

MIT (or match your vault repos).
