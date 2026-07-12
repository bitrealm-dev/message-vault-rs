#!/usr/bin/env bash
# ingest-staging.sh — one-shot export+import+dedupe using config source_dir
#
# Usage:
#   ./scripts/ingest-staging.sh go-sms-pro
#   ./scripts/ingest-staging.sh --append sms-backup-plus
#   ./scripts/ingest-staging.sh --overwrite-contacts imessage
#   ./scripts/ingest-staging.sh --skip-dedupe go-sms-pro
#
# Requires each SOURCE_ID to have source_dir set in config/config.toml, then runs:
#   cargo run --release -- ingest <id> …
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

usage() {
  cat <<'EOF'
Usage: ingest-staging.sh [OPTIONS] SOURCE_ID…

Options:
  --append               Import mode append (default: replace)
  --overwrite-contacts   Reload contacts CSV on import
  --skip-dedupe          Skip cross-source soft-dedupe after import
  -h, --help             Show this help

SOURCE_ID must exist in config/config.toml with source_dir set:
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
  echo "error: pass at least one SOURCE_ID" >&2
  usage >&2
  exit 1
fi

cd "${REPO_ROOT}"

for id in "${SOURCES[@]}"; do
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
  if [[ "${SKIP_DEDUPE}" -eq 1 ]]; then
    cmd+=(--skip-dedupe)
  fi

  echo "+" "${cmd[@]}"
  "${cmd[@]}"
done
