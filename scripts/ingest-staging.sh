#!/usr/bin/env bash
# ingest-staging.sh — one-shot export+import+dedupe from archived SOURCE_DATA
#
# Usage:
#   ./scripts/ingest-staging.sh go-sms-pro
#   ./scripts/ingest-staging.sh --append sms-backup-plus
#   ./scripts/ingest-staging.sh --overwrite-contacts imessage
#   ./scripts/ingest-staging.sh --skip-dedupe go-sms-pro
#
# Maps each SOURCE_ID to a fixed path under
#   /pool/archive/projects/message-vault-rs/source-data/
# then runs:
#   cargo run --release -- ingest <id> --from <path> …
#
# For arbitrary paths, call ingest directly:
#   cargo run --release -- ingest go-sms-pro --from /path/to/export

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG="${REPO_ROOT}/config/config.toml"
SOURCE_DATA="/pool/archive/projects/message-vault-rs/source-data"

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

SOURCE_ID:
  imessage
  go-sms-pro
  sms-backup-restore
  sms-backup-plus
EOF
}

input_for_source() {
  case "$1" in
    imessage)
      echo "${SOURCE_DATA}/imessage/iphone_backup"
      ;;
    go-sms-pro)
      echo "${SOURCE_DATA}/go-sms-pro/2015-12-01_232753-export-go-sms-pro"
      ;;
    sms-backup-restore)
      echo "${SOURCE_DATA}/sms-backup-restore"
      ;;
    sms-backup-plus)
      echo "${SOURCE_DATA}/sms-backup-plus-eml/2026-06-28 Master SMS EML Archive - sanitized"
      ;;
    *)
      echo "error: unknown SOURCE_ID '$1'" >&2
      usage >&2
      exit 1
      ;;
  esac
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
  input="$(input_for_source "${id}")"
  if [[ ! -e "${input}" ]]; then
    echo "error: missing input for ${id}: ${input}" >&2
    exit 1
  fi

  # imessage needs the release binary for the shell-out exporter.
  if [[ "${id}" == "imessage" && ! -x target/release/imessage-exporter-json ]]; then
    echo "building imessage-exporter-json…"
    cargo build --release -p imessage-exporter
  fi

  cmd=(
    cargo run --release -- ingest "${id}"
    --from "${input}"
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
