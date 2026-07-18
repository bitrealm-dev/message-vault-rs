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

## Converters

| Source id | Script |
|-----------|--------|
| `go-sms-pro` | [`python/exporter_csv_to_vault.py`](python/exporter_csv_to_vault.py) |
| `sms-backup-plus` | same |
| `sms-backup-restore` | same |
| `imessage` | same |
| `imazing` | [`python/imazing_to_vault.py`](python/imazing_to_vault.py) |

Shared helpers: [`python/vault_common.py`](python/vault_common.py).

## Samples

- [`samples/csv/`](samples/csv/) — one CSV from each exporter (side-by-side column sets)
- [`samples/vault/`](samples/vault/) — hand-written vault NDJSON per message shape
- [`samples/converted/`](samples/converted/) — example conversion output

## Future HTTP ingest

The NDJSON this tool writes is the intended payload for a later vault HTTP API, for example:

- `POST /v1/import` with `Content-Type: application/x-ndjson` (stream of conversation + message records), or
- `POST /v1/conversations` + `POST /v1/messages` with the same JSON objects

No server is implemented in this crate; local files / stdout are the contract.

## License

MIT (or match your vault repos).
