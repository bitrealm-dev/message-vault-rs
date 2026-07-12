#!/usr/bin/env bash
# build-staging.sh — run workspace exporter crates into staging/
#
# Usage:
#   ./scripts/build-staging.sh              # all sources
#   ./scripts/build-staging.sh imessage      # one source id
#
# Input:  each source's source_dir in config/config.toml (required)
# Output: <repo>/staging/<staging-dir>/   (NDJSON + media)
#
# Exporters live under crates/ and are invoked with cargo -p from the repo root.
#
# Rotate: if staging/<id>/ already has current files (not .gitkeep / not prior
# YYYYMMDDTHHMMSSZ archives), move them into a new UTC timestamp sibling dir
# before writing fresh output.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
STAGING="${REPO_ROOT}/staging"
CONFIG="${REPO_ROOT}/config/config.toml"

# Placeholders only; overwritten from config/config.toml when present.
OWNER_PHONE="+15555550100"
OWNER_EMAILS=()

# Resolve [[sources]].source_dir for an id from config.toml; empty if unset.
config_source_dir() {
  local id="$1"
  if [[ ! -f "${CONFIG}" ]] || ! command -v python3 >/dev/null 2>&1; then
    return 0
  fi
  python3 - "${CONFIG}" "${id}" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
want = sys.argv[2]
text = path.read_text()
try:
    import tomllib
except ImportError:
    import tomli as tomllib  # type: ignore
cfg = tomllib.loads(text)
for src in cfg.get("sources") or []:
    if src.get("id") == want:
        sd = src.get("source_dir")
        if sd:
            print(sd)
        break
PY
}

# Require source_dir from config for this source id.
input_for_source() {
  local id="$1"
  local from_cfg
  from_cfg="$(config_source_dir "${id}" || true)"
  if [[ -z "${from_cfg}" ]]; then
    echo "error: set source_dir for '${id}' in ${CONFIG}" >&2
    exit 1
  fi
  echo "${from_cfg}"
}

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
    OWNER_EMAILS=("owner@example.com")
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
  local input
  input="$(input_for_source imessage)"
  local out="${STAGING}/imessage"
  require_path "${input}" "imessage input"

  echo "==> imessage"
  rotate_staging "${out}"
  echo "  building imessage-exporter-json…"
  (cd "${REPO_ROOT}" && cargo build --release -p imessage-exporter)
  local bin="${REPO_ROOT}/target/release/imessage-exporter-json"
  require_path "${bin}" "imessage-exporter-json binary"
  echo "  exporting → ${out}"
  "${bin}" -f json -c clone -a iOS -p "${input}" -o "${out}"
  echo "  done imessage"
}

run_go_sms_pro() {
  local input
  input="$(input_for_source go-sms-pro)"
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
  local input
  input="$(input_for_source sms-backup-restore)"
  local out="${STAGING}/sms-backup-restore"
  require_path "${input}" "sms-backup-restore input"

  echo "==> sms-backup-restore"
  rotate_staging "${out}"
  echo "  exporting → ${out}"
  (cd "${REPO_ROOT}" && cargo run --release -p sms-backup-restore-exporter -- \
    --input "${input}" \
    --output "${out}" \
    --owner-phone "${OWNER_PHONE}")
  echo "  done sms-backup-restore"
}

run_sms_backup_plus() {
  local input
  input="$(input_for_source sms-backup-plus)"
  local out="${STAGING}/sms-backup-plus-eml"
  require_path "${input}" "sms-backup-plus input"

  echo "==> sms-backup-plus"
  rotate_staging "${out}"
  echo "  exporting → ${out}"
  local email_args=()
  local e
  for e in "${OWNER_EMAILS[@]}"; do
    email_args+=(--owner-email "${e}")
  done
  (cd "${REPO_ROOT}" && cargo run --release -p sms-backup-plus-exporter -- -v convert \
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
