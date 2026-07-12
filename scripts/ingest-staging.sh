#!/usr/bin/env bash
# ingest-staging.sh — one-shot export+import+dedupe using config source_dir
#
# Usage:
#   ./scripts/ingest-staging.sh                         # all known sources
#   ./scripts/ingest-staging.sh go-sms-pro
#   ./scripts/ingest-staging.sh imessage go-sms-pro sms-backup-plus
#   ./scripts/ingest-staging.sh --append sms-backup-plus
#   ./scripts/ingest-staging.sh --overwrite-contacts imessage
#   ./scripts/ingest-staging.sh --skip-dedupe go-sms-pro
#
# Requires each SOURCE_ID to have source_dir set in config/config.toml, then runs:
#   cargo run --release -- ingest <id> …
#
# When multiple sources run, cross-source dedupe runs once after the last ingest
# (unless --skip-dedupe).
#
# Override the path for one run:
#   cargo run --release -- ingest go-sms-pro --from /path/to/export

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG="${REPO_ROOT}/config/config.toml"

MODE="replace"
OVERWRITE_CONTACTS=0
SKIP_DEDUPE=0
SOURCES=()

# Default order when no SOURCE_ID args are given.
ALL_SOURCES=(imessage go-sms-pro sms-backup-restore sms-backup-plus)

usage() {
  cat <<'EOF'
Usage: ingest-staging.sh [OPTIONS] [SOURCE_ID…]

With no SOURCE_ID, ingests all known sources (each must have source_dir in config).

Options:
  --append               Import mode append (default: replace)
  --overwrite-contacts   Reload contacts CSV on import
  --skip-dedupe          Skip cross-source soft-dedupe after import
  -h, --help             Show this help

SOURCE_ID:
  imessage
  go-sms-pro
  sms-backup-restore
  sms-backup-plus
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --append)
      MODE="append"
      shift
      ;;
    --overwrite-contacts)
      OVERWRITE_CONTACTS=1
      shift
      ;;
    --skip-dedupe)
      SKIP_DEDUPE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "error: unknown option '$1'" >&2
      usage >&2
      exit 1
      ;;
    *)
      SOURCES+=("$1")
      shift
      ;;
  esac
done

if [[ ${#SOURCES[@]} -eq 0 ]]; then
  SOURCES=("${ALL_SOURCES[@]}")
fi

cd "${REPO_ROOT}"

last_idx=$((${#SOURCES[@]} - 1))
echo "Ingesting ${#SOURCES[@]} source(s): ${SOURCES[*]}"
echo

for i in "${!SOURCES[@]}"; do
  id="${SOURCES[$i]}"
  n=$((i + 1))
  echo "==> [${n}/${#SOURCES[@]}] ${id}"

  # imessage needs the release binary for the shell-out exporter.
  if [[ "${id}" == "imessage" && ! -x target/release/imessage-exporter-json ]]; then
    echo "building imessage-exporter-json…"
    cargo build --release -p imessage-exporter
  fi

  cmd=(
    cargo run --release -- ingest "${id}"
    --config "${CONFIG}"
    --mode "${MODE}"
  )
  if [[ "${OVERWRITE_CONTACTS}" -eq 1 ]]; then
    cmd+=(--overwrite-contacts)
  fi
  # Dedupe once after the last source (or never if --skip-dedupe).
  if [[ "${SKIP_DEDUPE}" -eq 1 || "${i}" -lt "${last_idx}" ]]; then
    cmd+=(--skip-dedupe)
  fi

  echo "+" "${cmd[@]}"
  "${cmd[@]}"
  echo
done

echo "All ${#SOURCES[@]} source(s) finished."
