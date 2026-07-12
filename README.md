# message-vault-rs

Import NDJSON message archives into SQLite and browse them in a local web UI.

This repo is a **Cargo workspace**: the vault binary, shared NDJSON schema, and per-source exporters live under [`crates/`](crates/). Helper shell scripts live under [`scripts/`](scripts/). One clone is enough — no sibling exporter checkouts.

```text
crates/
  message-json/                 # shared NDJSON schema
  go-sms-pro-exporter/
  sms-backup-restore-exporter/
  sms-backup-plus-exporter/
  imessage-database/            # iMessage SQLite parsers
  imessage-exporter/            # bin: imessage-exporter-json
scripts/
  ingest-staging.sh             # archive-path wrapper around `ingest`
  build-staging.sh              # export only (debug)
  import-staging.sh             # import + dedupe only (debug)
web/                            # Next.js browser UI
```

```bash
cargo build --workspace --release
```

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

[[sources]]
id = "go-sms-pro"
export_dir = "staging/go-sms-pro"

[[sources]]
id = "sms-backup-restore"
export_dir = "staging/sms-backup-restore"
```

Resolved asset roots default to `data/<source_id>/assets` and `data/<source_id>/assets_converted`. Override with full paths on a source if needed.

One shared SQLite DB holds all sources. Each message row has a `source` column. The web UI can filter by source or show the combined (all) view.

## Ingest (primary path)

One command exports raw source data → NDJSON under `staging/<source>/` → imports that source → soft-dedupes across sources:

```bash
cargo run --release -- ingest imessage --from /path/to/iphone_backup
cargo run --release -- ingest go-sms-pro --from /path/to/gosms-export
cargo run --release -- ingest sms-backup-plus --from /path/to/eml-tree
cargo run --release -- ingest sms-backup-restore --from /path/to/sms-xml

# optional flags:
#   --mode append | replace   (default replace)
#   --overwrite-contacts
#   --skip-dedupe
#   --window-secs 2
#   --staging-dir staging/custom
```

Archive helper (fixed paths under `/pool/archive/.../source-data/`):

```bash
./scripts/ingest-staging.sh go-sms-pro
./scripts/ingest-staging.sh --append sms-backup-plus
./scripts/ingest-staging.sh imessage
```

Then generate converted media and browse:

```bash
cd web && npm run process-assets
npm run dev
```

NDJSON under `staging/` is an implementation detail of ingest. Lower-level scripts remain for debugging:

```bash
./scripts/build-staging.sh          # export only
./scripts/import-staging.sh         # import + dedupe only
```

### Import modes

- **replace** — delete that source’s messages, then reload from staging.
- **append** — keep existing rows; skip when the same `(source, guid)` already exists.

Other sources are left alone.

### Cross-source dedupe

Ingest (and `import-staging.sh`) finish with `dedupe-cross-source`. That pass:

1. Rebuilds every message **content key** (chat + UTC epoch seconds + direction + normalized body + attachment hashes).
2. Soft-hides exact cross-source matches (`duplicate_of`).
3. Soft-hides near matches in the same conversation within ±2 seconds (same body or same attachment hashes).

Rows are not deleted. **All (combined)** hides soft-hidden copies. A single-source filter still shows every row for that archive.

Full walkthrough with diagrams: [docs/dedupe.md](docs/dedupe.md).

```bash
cargo run --release -- import --source imessage --mode replace
cargo run --release -- import --all --mode replace
cargo run --release -- dedupe-cross-source
```

## Web

See [`web/README.md`](web/README.md). Quick start:

```bash
cd web && npm run process-assets && npm run dev
```

Use the **Source** dropdown in the sidebar for a single source or **All (combined)** person threads.
