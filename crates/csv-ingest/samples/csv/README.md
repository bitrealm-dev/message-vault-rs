# Exporter CSV samples

One per-conversation CSV from each workspace CSV exporter (copied for side-by-side comparison). Column sets differ by source; convert with the matching Python converter under [`../../python/`](../../python/).

| File | Exporter / source | Converter |
|------|-------------------|-----------|
| [`go-sms-pro.csv`](go-sms-pro.csv) | `go-sms-pro-exporter-csv` | `exporter_csv_to_vault.py` |
| [`imessage.csv`](imessage.csv) | `imessage-exporter-csv` | `exporter_csv_to_vault.py` |
| [`imazing.csv`](imazing.csv) | iMazing 1:1 Messages CSV | `imazing_to_vault.py` |
| [`imazing-group.csv`](imazing-group.csv) | iMazing group Messages CSV | `imazing_to_vault.py` |
| [`sms-backup-plus.csv`](sms-backup-plus.csv) | `sms-backup-plus-exporter-csv` | `exporter_csv_to_vault.py` |
| [`sms-backup-restore.csv`](sms-backup-restore.csv) | `sms-backup-restore-exporter-csv` | `exporter_csv_to_vault.py` |

```bash
# Example: convert the GO SMS Pro sample
cargo run -p csv-ingest -- \
  --input crates/csv-ingest/samples/csv/go-sms-pro.csv \
  --output /tmp/vault-out \
  --source-id go-sms-pro
```
