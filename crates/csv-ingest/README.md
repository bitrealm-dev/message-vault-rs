# csv-ingest

Convert per-conversation **CSV** (from workspace exporters) into **vault NDJSON** using a per-source mapping file.

Ingest contract: [`../message-json/docs/CSV_INGEST.md`](../message-json/docs/CSV_INGEST.md).

## Usage

```bash
# Explicit mapping
cargo run -p csv-ingest -- \
  --input ./staging/sms-backup-plus-csv \
  --output ./staging/sms-backup-plus-csv \
  --mapping crates/csv-ingest/mappings/sms-backup-plus.toml

# Or by source id / export_source column
cargo run -p csv-ingest -- \
  --input crates/go-sms-pro-exporter-csv/samples \
  --source-id go-sms-pro
```

Writes one `{stem}.json` NDJSON file per `{stem}.csv` (conversation header + message lines). Attachment paths in CSV are left as relative strings.

## Mappings

| File | Source |
|------|--------|
| [`mappings/imessage.toml`](mappings/imessage.toml) | `imessage-exporter-csv` |
| [`mappings/sms-backup-plus.toml`](mappings/sms-backup-plus.toml) | `sms-backup-plus-exporter-csv` |
| [`mappings/sms-backup-restore.toml`](mappings/sms-backup-restore.toml) | `sms-backup-restore-exporter-csv` |
| [`mappings/go-sms-pro.toml`](mappings/go-sms-pro.toml) | `go-sms-pro-exporter-csv` |

Each mapping sets `schema = "vault"`. CSV column sets stay source-specific; only the NDJSON output is shared.

## Samples

- [`samples/csv/`](samples/csv/) — one CSV from each exporter (side-by-side column sets)
- [`samples/vault/`](samples/vault/) — hand-written vault NDJSON per message shape, plus minimum-field tables
- [`samples/converted/`](samples/converted/) — example output from converting an exporter CSV sample

## Future HTTP ingest

The NDJSON this tool writes is the intended payload for a later vault HTTP API, for example:

- `POST /v1/import` with `Content-Type: application/x-ndjson` (stream of conversation + message records), or
- `POST /v1/conversations` + `POST /v1/messages` with the same JSON objects

No server is implemented in this crate; local files / stdout are the contract.

## License

MIT (or match your vault repos).
