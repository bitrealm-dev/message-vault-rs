#!/usr/bin/env bash
# build-staging.sh — run workspace exporter crates into staging/
#
# Usage:
#   ./scripts/build-staging.sh              # all sources
#   ./scripts/build-staging.sh imessage      # one source id
#
# Input:  each source's source_dir / source_dirs in config/config.toml (required)
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

# Resolve [[sources]] input dirs for an id (source_dirs or source_dir); one path per line.
config_source_dirs() {
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
        dirs = src.get("source_dirs") or []
        if not dirs:
            sd = src.get("source_dir")
            if sd:
                dirs = [sd]
        for d in dirs:
            if d:
                print(d)
        break
PY
}

# Require at least one input dir from config for this source id.
# Prints paths one per line (caller may mapfile into an array).
input_for_source() {
  local id="$1"
  local lines
  lines="$(config_source_dirs "${id}" || true)"
  if [[ -z "${lines}" ]]; then
    echo "error: set source_dir or source_dirs for '${id}' in ${CONFIG}" >&2
    exit 1
  fi
  printf '%s\n' "${lines}"
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
phones = owner.get("phones") or []
if not phones and owner.get("phone_e164"):
    phones = [owner.get("phone_e164")]
phone = ""
for p in phones:
    p = str(p).strip()
    if p:
        phone = p
        break
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
  local -a inputs=()
  mapfile -t inputs < <(input_for_source imessage)
  if [[ ${#inputs[@]} -ne 1 ]]; then
    echo "error: imessage needs exactly one source_dir (got ${#inputs[@]})" >&2
    exit 1
  fi
  local input="${inputs[0]}"
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
  local -a inputs=()
  mapfile -t inputs < <(input_for_source go-sms-pro)
  if [[ ${#inputs[@]} -ne 1 ]]; then
    echo "error: go-sms-pro needs exactly one source_dir (got ${#inputs[@]})" >&2
    exit 1
  fi
  local input="${inputs[0]}"
  local out="${STAGING}/go-sms-pro"
  require_path "${input}" "go-sms-pro input"

  echo "==> go-sms-pro"
  rotate_staging "${out}"
  echo "  exporting → ${out}"
  (cd "${REPO_ROOT}" && cargo run --release -p go-sms-pro-exporter-csv -- \
    --input "${input}" \
    --output "${out}" \
    --owner-phone "${OWNER_PHONE}")
  echo "  done go-sms-pro"
}

run_sms_backup_restore() {
  local -a inputs=()
  mapfile -t inputs < <(input_for_source sms-backup-restore)
  if [[ ${#inputs[@]} -ne 1 ]]; then
    echo "error: sms-backup-restore needs exactly one source_dir (got ${#inputs[@]})" >&2
    exit 1
  fi
  local input="${inputs[0]}"
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
  local -a inputs=()
  mapfile -t inputs < <(input_for_source sms-backup-plus)
  if [[ ${#inputs[@]} -eq 0 ]]; then
    echo "error: set source_dir or source_dirs for sms-backup-plus in ${CONFIG}" >&2
    exit 1
  fi
  local out="${STAGING}/sms-backup-plus-eml"
  local input_args=()
  local inp
  for inp in "${inputs[@]}"; do
    require_path "${inp}" "sms-backup-plus input"
    input_args+=(--input "${inp}")
  done

  echo "==> sms-backup-plus"
  rotate_staging "${out}"
  echo "  exporting → ${out}"
  local email_args=()
  local e
  for e in "${OWNER_EMAILS[@]}"; do
    email_args+=(--owner-email "${e}")
  done
  # Owner/contacts come from vault config.toml / config/contacts.csv — not exporter owner.toml.
  (cd "${REPO_ROOT}" && cargo run --release -p sms-backup-plus-exporter -- -v convert \
    "${input_args[@]}" \
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
