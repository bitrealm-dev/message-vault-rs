# Python CSV → vault converters

All CSV → vault NDJSON conversion lives here. Rust `csv-ingest` shells out to `python3`.

**CSV is for humans.** Open it, check phones/chats, edit or re-export — then convert. These scripts only reshape columns into vault NDJSON; they do not look up contacts or “fix” handles.

## One script per source

Each source has its own entry script (copy one as a template when adding a new exporter):

| Source id | Script | Default service |
|-----------|--------|-----------------|
| `go-sms-pro` | [`go_sms_pro_to_vault.py`](go_sms_pro_to_vault.py) | SMS |
| `sms-backup-plus` | [`sms_backup_plus_to_vault.py`](sms_backup_plus_to_vault.py) | SMS |
| `sms-backup-restore` | [`sms_backup_restore_to_vault.py`](sms_backup_restore_to_vault.py) | SMS |
| `imessage` | [`imessage_to_vault.py`](imessage_to_vault.py) | iMessage |
| `imazing` | [`imazing_to_vault.py`](imazing_to_vault.py) | (from CSV) |

Shared modules (not run directly by Rust):

| Module | Role |
|--------|------|
| [`exporter_csv.py`](exporter_csv.py) | Near-vault exporter CSV reshape + CLI helper |
| [`vault_common.py`](vault_common.py) | GUID, NDJSON write, CSV collect |

To add a source that uses the same column shape as go-sms-pro / imessage:

1. Copy `go_sms_pro_to_vault.py` → `my_source_to_vault.py`
2. Set `SOURCE_ID` and `DEFAULT_SERVICE`
3. Register the script in Rust `CONVERTERS` in `src/convert.rs`

```bash
python3 crates/csv-ingest/python/go_sms_pro_to_vault.py \
  --input crates/csv-ingest/samples/csv/go-sms-pro.csv \
  --output /tmp/out

python3 crates/csv-ingest/python/imazing_to_vault.py \
  --input crates/csv-ingest/samples/csv/imazing.csv \
  --output /tmp/imazing-out

cargo run -p csv-ingest -- \
  --input crates/csv-ingest/samples/csv/imessage.csv \
  --output /tmp/out \
  --source-id imessage
```

Requires Python 3.9+ (`zoneinfo` for iMazing). No third-party packages.
