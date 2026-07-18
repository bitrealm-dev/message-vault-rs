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
  ingest-staging.sh             # staging → import + dedupe wrapper
  import-staging.sh             # import + dedupe only (debug)
web/                            # Next.js browser UI
```

```bash
# Vault
cargo build --workspace --release

# Exporters (separate repo — fill staging/, not used by vault at runtime)
# https://github.com/bitrealm-dev/message-exporters
```

### Pipeline

```text
message-exporters   backup  →  staging/<source>/  (CSV or NDJSON)
message-vault-rs    staging →  optional csv-ingest →  SQLite + UI
```

- **Vault NDJSON** (`message_json::vault`) — standard ingest shape; see [`crates/message-json/docs/CSV_INGEST.md`](crates/message-json/docs/CSV_INGEST.md)
- Vault **never** runs exporters. Fill each source’s `export_dir` first, then `ingest`.

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

Resolved asset roots default to `data/<account_id>/<source_id>/assets` and `…/assets_converted`. Override with full paths on a source if needed.

[`sources/`](sources/) is an optional, gitignored placeholder for keeping raw backups inside the clone. Ingest does **not** read from `sources/` — only from each source’s `export_dir` (staging).

One shared SQLite DB holds all sources. Each message row has a `source` column. The web UI can filter by source or show the combined (all) view.

## Ingest (primary path)

1. Export backups into `staging/<source>/` with [message-exporters](https://github.com/bitrealm-dev/message-exporters) (or any tool that writes vault NDJSON / mapped CSV).
2. Run `ingest` — optional CSV→vault NDJSON, import that source, soft-dedupe across sources:

```bash
cargo run --release -- ingest imessage --account <uuid>
cargo run --release -- ingest go-sms-pro --account <uuid>
cargo run --release -- ingest sms-backup-plus --account <uuid>
cargo run --release -- ingest sms-backup-restore --account <uuid>

# optional flags:
#   --mode append | replace   (default replace)
#   --overwrite-contacts
#   --skip-dedupe
#   --window-secs 2
#   --staging-dir staging/custom
```

Helper (staging must already be populated):

```bash
# one source
./scripts/ingest-staging.sh --account <uuid> go-sms-pro
./scripts/ingest-staging.sh --account <uuid> --append sms-backup-plus

# several, or all known sources (omit ids → all)
./scripts/ingest-staging.sh --account <uuid> imessage go-sms-pro sms-backup-plus sms-backup-restore
./scripts/ingest-staging.sh --account <uuid>
```

Then generate converted media and browse:

```bash
cd web && npm run process-assets
npm run dev
```

Lower-level import-only path:

```bash
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
cargo run --release -- import --source imessage --mode replace --account <uuid>
cargo run --release -- import --all --mode replace --account <uuid>
cargo run --release -- dedupe-cross-source --account <uuid>
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
