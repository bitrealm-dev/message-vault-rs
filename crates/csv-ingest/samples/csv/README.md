# Exporter CSV samples

One per-conversation CSV from each workspace CSV exporter (copied for side-by-side comparison). Column sets differ by source; convert with the matching mapping under [`../../mappings/`](../../mappings/).

| File | Exporter | Mapping |
|------|----------|---------|
| [`go-sms-pro.csv`](go-sms-pro.csv) | `go-sms-pro-exporter-csv` | `go-sms-pro.toml` |
| [`imessage.csv`](imessage.csv) | `imessage-exporter-csv` | `imessage.toml` |
| [`sms-backup-plus.csv`](sms-backup-plus.csv) | `sms-backup-plus-exporter-csv` | `sms-backup-plus.toml` |
| [`sms-backup-restore.csv`](sms-backup-restore.csv) | `sms-backup-restore-exporter-csv` | `sms-backup-restore.toml` |

```bash
# Example: convert the GO SMS Pro sample
cargo run -p csv-ingest -- \
  --input crates/csv-ingest/samples/csv/go-sms-pro.csv \
  --output /tmp/vault-out \
  --mapping crates/csv-ingest/mappings/go-sms-pro.toml
```

Canonical copies also live under each exporter’s own `samples/` directory.
