#!/usr/bin/env bash
# build-staging.sh — run each message-exporter against source-data into staging/
#
# Usage:
#   ./message-exporter/build-staging.sh              # all sources
#   ./message-exporter/build-staging.sh imessage      # one source id
#
# Input:  /pool/archive/projects/message-vault-rs/source-data/<source>/…
# Output: <repo>/staging/<staging-dir>/   (NDJSON + assets)
#
# Rotate: if staging/<id>/ already has current files (not .gitkeep / not prior
# YYYYMMDDTHHMMSSZ archives), move them into a new UTC timestamp sibling dir
# before writing fresh output.
#
# Source map:
#   imessage            ← source-data/imessage/iphone_backup
#   go-sms-pro          ← source-data/go-sms-pro/2015-12-01_232753-export-go-sms-pro
#   sms-backup-restore  ← source-data/sms-backup-restore/
#   sms-backup-plus     ← source-data/sms-backup-plus-eml/…sanitized
#                         (staging dir: sms-backup-plus-eml)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_DATA="/pool/archive/projects/message-vault-rs/source-data"
STAGING="${REPO_ROOT}/staging"
CONFIG="${REPO_ROOT}/config/config.toml"
EXPORTERS="${SCRIPT_DIR}"

OWNER_PHONE="+19412660605"
OWNER_EMAILS=()

load_owner_from_config() {
  if [[ ! -f "${CONFIG}" ]]; then
    return 0
  fi
  # Prefer Python tomllib when available; fall back to defaults above.
  if command -v python3 >/dev/null 2>&1; then
    local parsed
    parsed="$(
      python3 - "${CONFIG}" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
text = path.read_text()
try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib  # type: ignore
    except ImportError:
        sys.exit(0)
data = tomllib.loads(text)
owner = data.get("owner") or {}
phone = (owner.get("phone_e164") or "").strip()
emails = owner.get("emails") or []
if phone:
    print("PHONE=" + phone)
for e in emails:
    e = str(e).strip()
    if e:
        print("EMAIL=" + e)
PY
    )" || true
    while IFS= read -r line; do
      case "${line}" in
        PHONE=*) OWNER_PHONE="${line#PHONE=}" ;;
        EMAIL=*) OWNER_EMAILS+=("${line#EMAIL=}") ;;
      esac
    done <<<"${parsed}"
  fi
  if [[ ${#OWNER_EMAILS[@]} -eq 0 ]]; then
    OWNER_EMAILS=("mjbeisser@gmail.com")
  fi
}

# Move current staging contents into a UTC timestamp sibling archive dir.
# Leaves prior YYYYMMDDTHHMMSSZ dirs and .gitkeep in place.
rotate_staging() {
  local dest="$1"
  mkdir -p "${dest}"

  local has_current=0
  local name
  shopt -s nullglob
  for entry in "${dest}"/* "${dest}"/.[!.]* "${dest}"/..?*; do
    [[ -e "${entry}" ]] || continue
    name="$(basename "${entry}")"
    [[ "${name}" == "." || "${name}" == ".." ]] && continue
    [[ "${name}" == ".gitkeep" ]] && continue
    if [[ "${name}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
      continue
    fi
    has_current=1
    break
  done
  shopt -u nullglob

  if [[ "${has_current}" -eq 0 ]]; then
    echo "  staging empty (or archives only): ${dest}"
    return 0
  fi

  local stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local archive="${dest}/${stamp}"
  mkdir -p "${archive}"
  echo "  rotating current files → ${archive}"

  shopt -s nullglob
  for entry in "${dest}"/* "${dest}"/.[!.]* "${dest}"/..?*; do
    [[ -e "${entry}" ]] || continue
    name="$(basename "${entry}")"
    [[ "${name}" == "." || "${name}" == ".." ]] && continue
    [[ "${name}" == ".gitkeep" ]] && continue
    [[ "${name}" == "${stamp}" ]] && continue
    if [[ "${name}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
      continue
    fi
    mv "${entry}" "${archive}/"
  done
  shopt -u nullglob
}

require_path() {
  local path="$1"
  local label="$2"
  if [[ ! -e "${path}" ]]; then
    echo "error: missing ${label}: ${path}" >&2
    exit 1
  fi
}

run_imessage() {
  local input="${SOURCE_DATA}/imessage/iphone_backup"
  local out="${STAGING}/imessage"
  local workspace="${EXPORTERS}/imessage-exporter-json"
  require_path "${input}" "imessage input"
  require_path "${workspace}" "imessage-exporter-json workspace"

  echo "==> imessage"
  rotate_staging "${out}"
  echo "  building imessage-exporter-json…"
  (cd "${workspace}" && cargo build --release -p imessage-exporter)
  local bin="${workspace}/target/release/imessage-exporter-json"
  require_path "${bin}" "imessage-exporter-json binary"
  echo "  exporting → ${out}"
  "${bin}" -f json -c clone -a iOS -p "${input}" -o "${out}"
  echo "  done imessage"
}

run_go_sms_pro() {
  local input="${SOURCE_DATA}/go-sms-pro/2015-12-01_232753-export-go-sms-pro"
  local out="${STAGING}/go-sms-pro"
  require_path "${input}" "go-sms-pro input"

  echo "==> go-sms-pro"
  rotate_staging "${out}"
  echo "  exporting → ${out}"
  (cd "${REPO_ROOT}" && cargo run --release -p go-sms-pro-exporter -- \
    --input "${input}" \
    --output "${out}" \
    --owner-phone "${OWNER_PHONE}")
  echo "  done go-sms-pro"
}

run_sms_backup_restore() {
  local input="${SOURCE_DATA}/sms-backup-restore"
  local out="${STAGING}/sms-backup-restore"
  local crate="${EXPORTERS}/sms-backup-restore-exporter"
  require_path "${input}" "sms-backup-restore input"
  require_path "${crate}" "sms-backup-restore-exporter"

  echo "==> sms-backup-restore"
  rotate_staging "${out}"
  echo "  exporting → ${out}"
  (cd "${crate}" && cargo run --release -- \
    --input "${input}" \
    --output "${out}" \
    --owner-phone "${OWNER_PHONE}")
  echo "  done sms-backup-restore"
}

run_sms_backup_plus() {
  local input="${SOURCE_DATA}/sms-backup-plus-eml/2026-06-28 Master SMS EML Archive - sanitized"
  local out="${STAGING}/sms-backup-plus-eml"
  local crate="${EXPORTERS}/sms-backup-plus-exporter"
  require_path "${input}" "sms-backup-plus input"
  require_path "${crate}" "sms-backup-plus-exporter"

  echo "==> sms-backup-plus"
  rotate_staging "${out}"
  echo "  exporting → ${out}"
  local email_args=()
  local e
  for e in "${OWNER_EMAILS[@]}"; do
    email_args+=(--owner-email "${e}")
  done
  (cd "${crate}" && cargo run --release -- -v convert \
    --input "${input}" \
    --output "${out}" \
    --owner-phone "${OWNER_PHONE}" \
    "${email_args[@]}")
  echo "  done sms-backup-plus"
}

usage() {
  cat <<'EOF'
Usage: build-staging.sh [SOURCE_ID…]

SOURCE_ID (default: all):
  imessage
  go-sms-pro
  sms-backup-restore
  sms-backup-plus
EOF
}

main() {
  load_owner_from_config
  require_path "${SOURCE_DATA}" "SOURCE_DATA"
  mkdir -p "${STAGING}"

  local targets=("$@")
  if [[ ${#targets[@]} -eq 0 ]]; then
    targets=(imessage go-sms-pro sms-backup-restore sms-backup-plus)
  fi

  local id
  for id in "${targets[@]}"; do
    case "${id}" in
      imessage) run_imessage ;;
      go-sms-pro) run_go_sms_pro ;;
      sms-backup-restore) run_sms_backup_restore ;;
      sms-backup-plus) run_sms_backup_plus ;;
      -h|--help) usage; exit 0 ;;
      *)
        echo "error: unknown source id '${id}'" >&2
        usage >&2
        exit 1
        ;;
    esac
  done

  echo "All requested exports finished under ${STAGING}"
}

main "$@"
