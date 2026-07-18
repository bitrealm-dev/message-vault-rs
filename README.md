# message-vault-rs

Import message archives into SQLite and browse them in a local web UI.

**Backup → CSV / exporter binaries** live in [`message-exporters`](https://github.com/bitrealm-dev/message-exporters). This vault repo owns vault JSON, CSV→vault ingest, SQLite, and the web UI.

```text
crates/
  message-json/                 # vault (+ legacy sms/imessage) NDJSON schemas
  csv-ingest/                   # CSV + mapping → vault NDJSON (Rust + Python adapters)
  demo-seed/                    # demo data generator
config/                         # local machine config (examples committed)
sources/                        # optional placeholder for raw backups (gitignored)
scripts/
  ingest-staging.sh             # archive-path wrapper around `ingest`
  build-staging.sh              # export only (debug)
  import-staging.sh             # import + dedupe only (debug)
web/                            # Next.js browser UI
```

```bash
# Exporters (sibling clone)
cd ../message-exporters && cargo build --workspace --release
export MESSAGE_EXPORTERS_BIN="$PWD/target/release"

# Vault
cd ../message-vault-rs
cargo build --workspace --release
```

### Pipeline

```text
message-exporters   backup  →  CSV or SMS/iMessage NDJSON
message-vault-rs    CSV     →  vault NDJSON (csv-ingest)  →  SQLite + UI
                    NDJSON  →  import (schema auto-detect)
```

- **Vault NDJSON** (`message_json::vault`) — standard ingest shape; see [`crates/message-json/docs/CSV_INGEST.md`](crates/message-json/docs/CSV_INGEST.md)
- Ingest shells out to exporter binaries (`MESSAGE_EXPORTERS_BIN`, sibling `../message-exporters/target/release`, or `PATH`)

## Multi-source layout

Configure sources in [`config/config.toml`](config/config.toml) (copy from [`config/config.toml.example`](config/config.toml.example)):

```toml
[paths]
db = "data/vault.db"
data_dir = "data"
assets_dir = "assets"                 # originals dir name under each source
assets_converted_dir = "assets_converted"

[[sources]]
id = "imessage"
export_dir = "staging/imessage"
# Optional: raw input for `ingest` / scripts (omit --from when set)
# source_dir = "/path/to/iphone_backup"

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

### Raw inputs (`sources/` vs `source_dir`)

[`sources/`](sources/) is an optional, gitignored placeholder for keeping raw backups inside the clone (contents are ignored; only `.gitkeep` is tracked). Ingest does **not** read from `sources/` automatically.

Point each `[[sources]]` entry at real input with absolute (or repo-relative) `source_dir` / `source_dirs` in `config.toml`, or pass `--from` on the CLI. Putting trees under `sources/` is only a convenience for local layout — paths still go in config or `--from`.

One shared SQLite DB holds all sources. Each message row has a `source` column. The web UI can filter by source or show the combined (all) view.

## Ingest (primary path)

One command exports raw source data → NDJSON under `staging/<source>/` → imports that source → soft-dedupes across sources:

```bash
# --from required unless that source has source_dir / source_dirs in config
cargo run --release -- ingest imessage --from /path/to/iphone_backup
cargo run --release -- ingest go-sms-pro --from /path/to/gosms-export
cargo run --release -- ingest sms-backup-plus --from /path/to/eml-tree
cargo run --release -- ingest sms-backup-restore --from /path/to/sms-xml

# with source_dir / source_dirs configured:
cargo run --release -- ingest go-sms-pro
cargo run --release -- ingest sms-backup-plus

# optional flags:
#   --mode append | replace   (default replace)
#   --overwrite-contacts
#   --skip-dedupe
#   --window-secs 2
#   --staging-dir staging/custom
```

Helper (uses each source’s `source_dir` / `source_dirs` from config):

```bash
# one source
./scripts/ingest-staging.sh go-sms-pro
./scripts/ingest-staging.sh --append sms-backup-plus

# several, or all configured sources (omit ids → all)
./scripts/ingest-staging.sh imessage go-sms-pro sms-backup-plus sms-backup-restore
./scripts/ingest-staging.sh
```

Or call `ingest` once per source yourself (same flags each time):

```bash
for id in imessage go-sms-pro sms-backup-plus sms-backup-restore; do
  cargo run --release -- ingest "$id"
done
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

Database tables and how they connect: [docs/schema.md](docs/schema.md).

```bash
cargo run --release -- import --source imessage --mode replace
cargo run --release -- import --all --mode replace
cargo run --release -- dedupe-cross-source
```

## Obsidian markdown export

Export 1:1 contacts (no groups) as bubble-styled markdown — one file per person-year, combined/soft-deduped timeline, attachments copied under `_assets/`:

```bash
cargo run --release -- export-markdown --out /path/to/Obsidian-Message-Vault
# Enable snippet: Settings → Appearance → CSS snippets → message-vault-bubbles
```

Layout: `People/{Name}/{year}.md`, hub notes `_{Name}.md`, and `.obsidian/snippets/message-vault-bubbles.css` (from `config/obsidian-message-vault.css`).

## Demo dataset

A committed iMessage bundle lives under [`demo/`](demo/) (~30 contacts, ~50 conversations, thousands of messages). Bootstrap without a real backup:

```bash
./scripts/setup-demo.sh
cd web && npm run dev
```

Restore the default demo state after exploring the UI (sidebar **Reset demo**, or CLI):

```bash
cargo run --release -- reset-demo
```

Regenerate committed NDJSON (maintainers):

```bash
cargo run -p demo-seed -- --out demo --seed 42
```

See [`demo/README.md`](demo/README.md) for what the dataset exercises.

## Web

See [`web/README.md`](web/README.md). Quick start:

```bash
cd web && npm run process-assets && npm run dev
```

Use the **Source** dropdown in the sidebar for a single source or **All (combined)** person threads.

Contact browsing:

- **Contacts** — everyone with messages who is not excluded (`exclude=false` in `config/contacts.csv`). Derived as All − Excluded; you only manage the `exclude` column.
- **All** — every contact with messages, including excluded.
- **Excluded** — `exclude=true`. Still browsable; hidden from Contacts and from labels.

`contacts.csv` maps **phone numbers** only. In SQLite, `contact_handles` stores phones and optional iMessage emails for thread linking; emails are never written back to the CSV. Email-only peers you do not want to map stay under Unassigned.

Older DBs with `contact_phones` / `preferred_phone` are not upgraded — wipe `data/vault.db` and re-ingest.
