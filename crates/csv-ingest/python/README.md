# Python CSV → vault converters

Adapters that need real transforms (timezones, chat ids, reaction prose) live here.
Rust `csv-ingest` shells out to `python3` when a mapping sets `backend = "python"`.

## iMazing

[`imazing_to_vault.py`](imazing_to_vault.py) — iMazing Messages CSV → vault NDJSON.

```bash
# Direct (uses this computer's local timezone for Message Date)
python3 crates/csv-ingest/python/imazing_to_vault.py \
  --input crates/csv-ingest/samples/csv/imazing.csv \
  --output /tmp/imazing-out

# Via csv-ingest (reads mappings/imazing.toml)
cargo run -p csv-ingest -- \
  --input crates/csv-ingest/samples/csv/imazing.csv \
  --output /tmp/imazing-out \
  --source-id imazing
```

Timezone is usually automatic. Set `timezone = "…"` in `imazing.toml` or pass `--timezone` only if the phone lived in a different zone than this machine.

Requires Python 3.9+ (`zoneinfo`). No third-party packages.
