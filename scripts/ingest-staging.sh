#!/usr/bin/env bash
# ingest-staging.sh — import pre-filled staging + optional csv-ingest + dedupe
#
# Staging must already contain exporter output (CSV and/or vault NDJSON).
# Fill it with message-exporters (or another tool), then run this script.
#
# Usage:
#   ./scripts/ingest-staging.sh --account <uuid>                         # all known sources
#   ./scripts/ingest-staging.sh --account <uuid> go-sms-pro
#   ./scripts/ingest-staging.sh --account <uuid> imessage go-sms-pro sms-backup-plus
#   ./scripts/ingest-staging.sh --account <uuid> --append sms-backup-plus
#   ./scripts/ingest-staging.sh --account <uuid> --overwrite-contacts imessage
#   ./scripts/ingest-staging.sh --account <uuid> --skip-dedupe go-sms-pro
#
# Runs:
#   cargo run --release -- ingest <id> --account <uuid> …
#
# When multiple sources run, cross-source dedupe runs once after the last ingest
# (unless --skip-dedupe).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG="${REPO_ROOT}/config/config.toml"

MODE="replace"
OVERWRITE_CONTACTS=0
SKIP_DEDUPE=0
ACCOUNT=""
SOURCES=()

# Default order when no SOURCE_ID args are given.
ALL_SOURCES=(imessage go-sms-pro sms-backup-restore sms-backup-plus)

usage() {
  cat <<'EOF'
Usage: ingest-staging.sh --account <uuid> [OPTIONS] [SOURCE_ID…]

Staging must already be populated (message-exporters → staging/<source>/).
With no SOURCE_ID, ingests all known sources that have staging content.

Options:
  --account <uuid>       Vault account UUID (required)
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
    --account)
      ACCOUNT="${2:-}"
      if [[ -z "${ACCOUNT}" ]]; then
        echo "error: --account requires a uuid" >&2
        exit 1
      fi
      shift 2
      ;;
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

if [[ -z "${ACCOUNT}" ]]; then
  echo "error: --account <uuid> is required" >&2
  usage >&2
  exit 1
fi

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

  cmd=(
    cargo run --release -- ingest "${id}"
    --config "${CONFIG}"
    --account "${ACCOUNT}"
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
