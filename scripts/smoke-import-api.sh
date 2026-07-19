#!/usr/bin/env bash
# Smoke-test POST /v1/import against a temporary config + DB.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SAMPLE="${ROOT}/crates/csv-ingest/samples/vault/01-sms-text.json"
ACCOUNT="00000000-0000-0000-0000-00000000s001"
TOKEN="smoke-test-token"
BIND="127.0.0.1:18080"
TMP="$(mktemp -d)"
trap 'kill ${SERVER_PID:-} 2>/dev/null || true; rm -rf "$TMP"' EXIT

mkdir -p "$TMP/staging/imessage" "$TMP/config" "$TMP/data"
cp "$SAMPLE" "$TMP/staging/imessage/"
printf 'phones,first_name,last_name,exclude,group_1,group_2,group_3,group_4,group_5\n' \
  >"$TMP/config/contacts.csv"
printf 'phones,label\n' >"$TMP/config/exclude.csv"

cat >"$TMP/config/config.toml" <<EOF
[paths]
db = "${TMP}/data/vault.db"
data_dir = "${TMP}/data"
assets_dir = "assets"
assets_converted_dir = "assets_converted"
contacts_csv = "${TMP}/config/contacts.csv"
exclude_csv = "${TMP}/config/exclude.csv"

[server]
bind = "${BIND}"
api_token = "${TOKEN}"

[[sources]]
id = "imessage"
export_dir = "${TMP}/staging/imessage"
EOF

export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT/target}"
cargo build --release -q
"$CARGO_TARGET_DIR/release/message-vault-rs" serve --config "$TMP/config/config.toml" &
SERVER_PID=$!

for _ in $(seq 1 50); do
  if curl -sf "http://${BIND}/health" >/dev/null; then
    break
  fi
  sleep 0.1
done
curl -sf "http://${BIND}/health" >/dev/null

RESP="$(curl -sS -X POST \
  "http://${BIND}/v1/import?source=imessage&account=${ACCOUNT}&mode=replace" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @"$SAMPLE")"

echo "$RESP" | grep -q '"ok":true'
echo "$RESP" | grep -q '"messages":1'
echo "smoke-import-api: ok"
echo "$RESP"
