# csv-ingest

Convert per-conversation **CSV** into **vault NDJSON** using Python converters. Rust provides the CLI and a thin dispatcher that shells out to `python3`.

**`vault-push`** (CLI) converts a local export directory and uploads **one conversation at a time** to a remote `message-vault-rs serve` (multipart NDJSON + attachments). **`vault-push-gui`** is a cross-platform egui front-end that only collects settings and runs the CLI.

Ingest contract: [`../message-json/docs/CSV_INGEST.md`](../message-json/docs/CSV_INGEST.md).

## Why CSV exists

CSV is the **human checkpoint**: open it in a spreadsheet, spot bad phones / wrong chats / junk rows, edit or re-export, then convert.

## Convert only

```bash
cargo run -p csv-ingest -- \
  --input ./staging/go-sms-pro \
  --output ./staging/go-sms-pro
```

## Remote push (CLI)

```bash
cargo run -p csv-ingest --bin vault-push --release -- \
  --input ./staging/go-sms-pro \
  --source-id go-sms-pro \
  --url http://vault-host:8080 \
  --token "$VAULT_API_TOKEN" \
  --account <uuid> \
  --mode append
```

| Flag | Role |
|------|------|
| `--input` | Export dir from message-exporters |
| `--source-id` | Vault source + converter |
| `--url` / `VAULT_URL` | Vault base URL |
| `--token` / `VAULT_API_TOKEN` | Bearer token |
| `--account` | Account UUID |
| `--mode append` | Default; resume-safe |
| `--mode replace` | Wipe source on first conversation, then append |
| `--continue-on-error` | Keep going after a failed chat |
| `--force-repush` | Ignore checkpoint |
| `--report` / `--log` / `--checkpoint` | Paths (default: under export dir) |

**Per conversation:** multipart `ndjson` + `file` parts. Missing local attachments → that chat fails (no silent `assets_missing` import). Re-run with `append` **skips** chats listed in `vault-push-done.json`.

Artifacts: `vault-push.log`, `vault-push-report.json`, `vault-push-done.json`.

Stdout progress (for the GUI): `PROGRESS 12/400 ok chat.json …` / `fail` / `skip`.

## GUI wrapper

```bash
cargo run -p csv-ingest --bin vault-push-gui --features gui --release
```

Requires `vault-push` on `PATH` or next to the GUI binary. Form → spawn CLI → live log → open report/log.

## Converters

| Source id | Script |
|-----------|--------|
| `go-sms-pro` | [`python/go_sms_pro_to_vault.py`](python/go_sms_pro_to_vault.py) |
| `sms-backup-plus` | [`python/sms_backup_plus_to_vault.py`](python/sms_backup_plus_to_vault.py) |
| `sms-backup-restore` | [`python/sms_backup_restore_to_vault.py`](python/sms_backup_restore_to_vault.py) |
| `imessage` | [`python/imessage_to_vault.py`](python/imessage_to_vault.py) |
| `imazing` | [`python/imazing_to_vault.py`](python/imazing_to_vault.py) |

## Samples

- [`samples/csv/`](samples/csv/), [`samples/vault/`](samples/vault/), [`samples/converted/`](samples/converted/)

Smoke: `../../scripts/smoke-vault-push.sh`.

## License

MIT (or match your vault repos).
