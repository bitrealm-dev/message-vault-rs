# message-vault-rs

Import NDJSON message archives into SQLite and browse them in a local web UI.

## Multi-source layout

Configure sources in [`config/config.toml`](config/config.toml):

```toml
[paths]
db = "data/vault.db"
data_dir = "data"
assets_dir = "assets"                 # originals dir name under each source
assets_converted_dir = "assets_converted"

[[sources]]
id = "imessage"
export_dir = "staging/imessage"

[[sources]]
id = "sms-backup-plus"
export_dir = "staging/sms-backup-plus-eml"
```

Resolved asset roots default to `data/<source_id>/assets` and `data/<source_id>/assets_converted`. Override with full paths on a source if needed.

One shared SQLite DB holds all sources. Each message row has a `source` column. The web UI can filter by source or show the combined (all) view.

## Staging pipeline

```bash
# 1. Build NDJSON (+ media) into staging/<source>/ from archived source-data
./message-exporter/build-staging.sh
# or: ./message-exporter/build-staging.sh imessage

# 2. Import staging into data/vault.db
./message-exporter/import-staging.sh                 # all sources, replace
./message-exporter/import-staging.sh --append        # all sources, append
./message-exporter/import-staging.sh imessage        # one source, replace
./message-exporter/import-staging.sh --append go-sms-pro

# 3. Generate converted media under data/<source>/assets_converted/
cd web && npm run process-assets
# or: npm run process-assets -- --source imessage

# 4. Browse
npm run dev
```

`replace` deletes that source’s messages then reloads; `append` keeps existing rows and dedupes by `(source, guid)`. Other sources are left alone.

Equivalent cargo commands:

```bash
cargo run --release -- import --source imessage --mode replace
cargo run --release -- import --all --mode replace
cargo run --release -- import --source go-sms-pro --mode append
```

## Web

```bash
cd web && npm run dev
```

Use the **Source** dropdown in the sidebar for a single source or **All (combined)** person threads.
