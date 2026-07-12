# Web UI

Next.js app that browses the vault SQLite database (`data/vault.db` by default).

## Setup

From this directory:

```bash
npm install
```

Ensure the vault has been imported (see the [root README](../README.md) ingest flow). Then convert media for the browser:

```bash
npm run process-assets
```

Flags: `--force`, `--dry-run`, `--skip-image`, `--skip-video`, `--skip-audio`.

## Dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Source filter

The sidebar **Source** dropdown lists configured sources from `config/config.toml`.

- A single source shows every message from that archive.
- **All (combined)** merges person threads and hides soft-deduped copies (`duplicate_of`).

## Notes

- Paths and DB location are read from the repo-root `config/config.toml`.
- Converted assets land under `data/<source_id>/assets_converted`.
