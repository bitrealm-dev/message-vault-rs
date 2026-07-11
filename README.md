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

## Import

```bash
# one source (replace that source's messages; keep others)
cargo run --release -- import --source imessage --mode replace

# every configured source
cargo run --release -- import --all --mode replace

# append / dedupe by (source, guid)
cargo run --release -- import --source go-sms-pro --mode append
```

Then generate converted media:

```bash
cd web && npm run process-assets
# or: npm run process-assets -- --source imessage
```

## Web

```bash
cd web && npm run dev
```

Use the **Source** dropdown in the sidebar for a single source or **All (combined)**.
