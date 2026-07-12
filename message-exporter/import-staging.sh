#!/usr/bin/env bash
# import-staging.sh — import NDJSON from staging/ into the vault DB
#
# Usage:
#   ./message-exporter/import-staging.sh                 # all sources, replace
#   ./message-exporter/import-staging.sh --append        # all sources, append
#   ./message-exporter/import-staging.sh imessage        # one source, replace
#   ./message-exporter/import-staging.sh --append go-sms-pro
#   ./message-exporter/import-staging.sh --overwrite-contacts
#
# Modes:
#   replace (default) — delete that source's messages, then import
#   --append          — keep existing; dedupe by (source, guid)
#
# After import, runs `dedupe-cross-source` to soft-hide the same SMS across sources.
#
# Source ids must match [[sources]] in config/config.toml
# (imessage, sms-backup-plus, go-sms-pro, sms-backup-restore, …).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG="${REPO_ROOT}/config/config.toml"

MODE="replace"
OVERWRITE_CONTACTS=0
SOURCES=()

usage() {
  cat <<'EOF'
Usage: import-staging.sh [OPTIONS] [SOURCE_ID…]

Options:
  --append               Import mode append (default: replace)
  --overwrite-contacts   Reload contacts CSV on the first import
  -h, --help             Show this help

SOURCE_ID:
  Omit to import all configured sources (--all).
  Otherwise pass one or more ids from config.toml [[sources]].
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

cd "${REPO_ROOT}"

run_import() {
  local -a cmd=(
    cargo run --release -- import
    --config "${CONFIG}"
    --mode "${MODE}"
  )
  if [[ "${OVERWRITE_CONTACTS}" -eq 1 ]]; then
    cmd+=(--overwrite-contacts)
  fi
  cmd+=("$@")

  echo "+" "${cmd[@]}"
  "${cmd[@]}"
}

if [[ ${#SOURCES[@]} -eq 0 ]]; then
  run_import --all
else
  # --overwrite-contacts only on the first cargo invocation (matches CLI batch behavior).
  for id in "${SOURCES[@]}"; do
    run_import --source "${id}"
    OVERWRITE_CONTACTS=0
  done
fi

echo "Import finished (mode=${MODE})."

dedupe_cmd=(
  cargo run --release -- dedupe-cross-source
  --config "${CONFIG}"
)
echo "+" "${dedupe_cmd[@]}"
"${dedupe_cmd[@]}"
echo "Cross-source dedupe finished."
