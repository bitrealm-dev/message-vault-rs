#!/usr/bin/env bash
# Chunked vault-push: two conversations → two POSTs; resume skips the first.
# Also exercises per-user API tokens (no --account) and cross-tenant denial.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ACCOUNT="00000000-0000-0000-0000-00000000s001"
OTHER="00000000-0000-0000-0000-00000000s002"
ADMIN_TOKEN="smoke-push-token"
USER_TOKEN="mv_smoke_user_token_s001"
BIND="127.0.0.1:18081"
TMP="$(mktemp -d)"
trap 'kill ${SERVER_PID:-} 2>/dev/null || true; rm -rf "$TMP"' EXIT

mkdir -p "$TMP/staging/imessage" "$TMP/config" "$TMP/data" \
  "$TMP/client/media"

# Attachment path is message-driven (media/…), not a fixed attachments/ folder
printf '\xff\xd8\xff\xd9' >"$TMP/client/media/photo.jpg"
python3 - <<'PY' >"$TMP/client/chat-a.json"
from pathlib import Path
src = Path("crates/csv-ingest/samples/vault/02-sms-attachment.json").read_text()
print(src.replace("attachments/photo.jpg", "media/photo.jpg"), end="")
PY
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
api_token = "${ADMIN_TOKEN}"

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

# Auth check: bad token → 401; admin token → sources; unknown account → account_ok=false
code="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer wrong-token" \
  "http://${BIND}/v1/auth/check")"
test "$code" = "401"

AUTH="$(curl -sS \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  "http://${BIND}/v1/auth/check?account=${ACCOUNT}")"
echo "$AUTH" | grep -q '"ok":true'
echo "$AUTH" | grep -q '"account_ok":false'
echo "$AUTH" | grep -q 'imessage'
echo "$AUTH" | grep -q '"admin":true'

OUT1="$("$CARGO_TARGET_DIR/release/vault-push" \
  --input "$TMP/client" \
  --output "$TMP/client" \
  --source-id imessage \
  --url "http://${BIND}" \
  --token "$ADMIN_TOKEN" \
  --account "$ACCOUNT" \
  --mode append \
  --skip-convert \
  --continue-on-error 2>&1)" || true

echo "$OUT1" | grep -q 'PROGRESS 1/2 ok'
echo "$OUT1" | grep -q 'PROGRESS 2/2 ok'
test -f "$TMP/client/vault-push-report.json"
test -f "$TMP/client/vault-push-done.json"

AUTH2="$(curl -sS \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  "http://${BIND}/v1/auth/check?account=${ACCOUNT}")"
echo "$AUTH2" | grep -q '"account_ok":true'

# Bind a user token to the account created by import
sqlite3 "$TMP/data/vault.db" <<SQL
CREATE TABLE IF NOT EXISTS account_api_tokens (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
INSERT OR REPLACE INTO account_api_tokens (account_id, token, created_at)
VALUES ('${ACCOUNT}', '${USER_TOKEN}', 'smoke');
SQL

USER_AUTH="$(curl -sS \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  "http://${BIND}/v1/auth/check")"
echo "$USER_AUTH" | grep -q '"ok":true'
echo "$USER_AUTH" | grep -q "\"account_id\":\"${ACCOUNT}\""

# User token cannot target another account
code="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  "http://${BIND}/v1/auth/check?account=${OTHER}")"
test "$code" = "403"

# Push without --account (resolved from user token)
rm -f "$TMP/client/vault-push-done.json"
OUT_USER="$("$CARGO_TARGET_DIR/release/vault-push" \
  --input "$TMP/client" \
  --output "$TMP/client" \
  --source-id imessage \
  --url "http://${BIND}" \
  --token "$USER_TOKEN" \
  --mode append \
  --skip-convert \
  --force-repush 2>&1)"
echo "$OUT_USER" | grep -q "resolved account=${ACCOUNT}"
echo "$OUT_USER" | grep -q 'PROGRESS 1/2 ok'

OUT2="$("$CARGO_TARGET_DIR/release/vault-push" \
  --input "$TMP/client" \
  --output "$TMP/client" \
  --source-id imessage \
  --url "http://${BIND}" \
  --token "$ADMIN_TOKEN" \
  --account "$ACCOUNT" \
  --mode append \
  --skip-convert 2>&1)"

echo "$OUT2" | grep -q 'skip chat-a.json'
echo "$OUT2" | grep -q 'skip chat-b.json'

echo "smoke-vault-push: ok"
