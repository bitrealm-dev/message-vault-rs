# Python CSV → vault converters

All CSV → vault NDJSON conversion lives here. Rust `csv-ingest` shells out to `python3`.

**CSV is for humans.** Open it, check phones/chats, edit or re-export — then convert. These scripts only reshape columns into vault NDJSON; they do not look up contacts or “fix” handles.

| Script | Sources |
|--------|---------|
| [`exporter_csv_to_vault.py`](exporter_csv_to_vault.py) | go-sms-pro, sms-backup-plus, sms-backup-restore, imessage |
| [`imazing_to_vault.py`](imazing_to_vault.py) | iMazing Messages CSV |
| [`vault_common.py`](vault_common.py) | Shared helpers (GUID, NDJSON write, …) |

```bash
# Exporter-style CSV (near-vault columns)
python3 crates/csv-ingest/python/exporter_csv_to_vault.py \
  --input crates/csv-ingest/samples/csv/go-sms-pro.csv \
  --output /tmp/out \
  --source-id go-sms-pro

# iMazing (local timezone for Message Date)
python3 crates/csv-ingest/python/imazing_to_vault.py \
  --input crates/csv-ingest/samples/csv/imazing.csv \
  --output /tmp/imazing-out

# Via Rust dispatcher
cargo run -p csv-ingest -- \
  --input crates/csv-ingest/samples/csv/imazing.csv \
  --output /tmp/imazing-out \
  --source-id imazing
```

Requires Python 3.9+ (`zoneinfo`). No third-party packages.
