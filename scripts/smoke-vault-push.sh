#!/usr/bin/env bash
# Chunked vault-push: two conversations → two POSTs; resume skips the first.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ACCOUNT="00000000-0000-0000-0000-00000000s001"
TOKEN="smoke-push-token"
BIND="127.0.0.1:18081"
TMP="$(mktemp -d)"
trap 'kill ${SERVER_PID:-} 2>/dev/null || true; rm -rf "$TMP"' EXIT

mkdir -p "$TMP/staging/imessage" "$TMP/config" "$TMP/data" \
  "$TMP/client/attachments"

printf '\xff\xd8\xff\xd9' >"$TMP/client/attachments/photo.jpg"
cp "$ROOT/crates/csv-ingest/samples/vault/02-sms-attachment.json" \
  "$TMP/client/chat-a.json"
cp "$ROOT/crates/csv-ingest/samples/vault/01-sms-text.json" \
  "$TMP/client/chat-b.json"

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
cargo build --release -q -p message-vault-rs -p csv-ingest

"$CARGO_TARGET_DIR/release/message-vault-rs" serve --config "$TMP/config/config.toml" &
SERVER_PID=$!

for _ in $(seq 1 50); do
  if curl -sf "http://${BIND}/health" >/dev/null; then
    break
  fi
  sleep 0.1
done
curl -sf "http://${BIND}/health" >/dev/null

# Auth check: bad token → 401; good token → sources; unknown account → account_ok=false
code="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer wrong-token" \
  "http://${BIND}/v1/auth/check")"
test "$code" = "401"

AUTH="$(curl -sS \
  -H "Authorization: Bearer ${TOKEN}" \
  "http://${BIND}/v1/auth/check?account=${ACCOUNT}")"
echo "$AUTH" | grep -q '"ok":true'
echo "$AUTH" | grep -q '"account_ok":false'
echo "$AUTH" | grep -q 'imessage'

OUT1="$("$CARGO_TARGET_DIR/release/vault-push" \
  --input "$TMP/client" \
  --output "$TMP/client" \
  --source-id imessage \
  --url "http://${BIND}" \
  --token "$TOKEN" \
  --account "$ACCOUNT" \
  --mode append \
  --skip-convert \
  --continue-on-error 2>&1)" || true

echo "$OUT1" | grep -q 'PROGRESS 1/2 ok'
echo "$OUT1" | grep -q 'PROGRESS 2/2 ok'
test -f "$TMP/client/vault-push-report.json"
test -f "$TMP/client/vault-push-done.json"

AUTH2="$(curl -sS \
  -H "Authorization: Bearer ${TOKEN}" \
  "http://${BIND}/v1/auth/check?account=${ACCOUNT}")"
echo "$AUTH2" | grep -q '"account_ok":true'

OUT2="$("$CARGO_TARGET_DIR/release/vault-push" \
  --input "$TMP/client" \
  --output "$TMP/client" \
  --source-id imessage \
  --url "http://${BIND}" \
  --token "$TOKEN" \
  --account "$ACCOUNT" \
  --mode append \
  --skip-convert 2>&1)"

echo "$OUT2" | grep -q 'skip chat-a.json'
echo "$OUT2" | grep -q 'skip chat-b.json'

echo "smoke-vault-push: ok"
