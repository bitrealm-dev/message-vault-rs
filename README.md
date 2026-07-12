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

# 2. Import into data/vault.db, then soft-hide cross-source duplicates
./message-exporter/import-staging.sh                 # all sources, replace + dedupe
./message-exporter/import-staging.sh --append        # all sources, append + dedupe
./message-exporter/import-staging.sh imessage        # one source, replace + dedupe
./message-exporter/import-staging.sh --append go-sms-pro

# 3. Generate converted media under data/<source>/assets_converted/
cd web && npm run process-assets
# or: npm run process-assets -- --source imessage

# 4. Browse
npm run dev
```

### Import modes

- **replace** — delete that source’s messages, then reload from staging.
- **append** — keep existing rows; skip when the same `(source, guid)` already exists.

Other sources are left alone.

### Cross-source dedupe

`import-staging.sh` finishes with `dedupe-cross-source`. That pass:

1. Rebuilds every message **content key** (chat + UTC epoch seconds + direction + normalized body + attachment hashes).
2. Soft-hides exact cross-source matches (`duplicate_of`).
3. Soft-hides near matches in the same conversation within ±2 seconds (same body or same attachment hashes).

Rows are not deleted. **All (combined)** hides soft-hidden copies. A single-source filter still shows every row for that archive.

Full walkthrough with diagrams: [docs/dedupe.md](docs/dedupe.md).

```bash
cargo run --release -- import --source imessage --mode replace
cargo run --release -- import --all --mode replace
cargo run --release -- import --source go-sms-pro --mode append
cargo run --release -- dedupe-cross-source
# optional: --window-secs 2
```

## Web

```bash
cd web && npm run dev
```

Use the **Source** dropdown in the sidebar for a single source or **All (combined)** person threads.
