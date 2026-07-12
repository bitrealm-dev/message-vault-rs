# go-sms-pro-exporter

Convert a **GO SMS Pro** (GOMO / Jiubang) local backup into [`message-json`](../message-json) **SMS** NDJSON for this vault.

Part of the [message-vault-rs](../..) Cargo workspace. Prefer the vault’s `ingest` command unless you are debugging the exporter alone.

## Input

A directory containing:

- `gosms_sys*.xml` — SMS (`<GoSms><SMS>…`)
- `I_<unix>_*.pdu` — MMS PDU blobs (attachments extracted by magic-byte heuristics)

There is no public GO SMS Pro backup spec; XML fields mirror [Android Telephony SMS columns](https://developer.android.com/reference/android/provider/Telephony.TextBasedSmsColumns). PDU parsing follows heuristics from the personal `message-vault` GoSMS converter (reference only).

## Preferred: vault ingest

From the repo root:

```bash
cargo run --release -- ingest go-sms-pro --from /path/to/gosms_export
```

Or with the archive helper: `./scripts/ingest-staging.sh go-sms-pro`.

## Standalone usage

From the repo root:

```bash
cargo run --release -p go-sms-pro-exporter -- \
  --input /path/to/gosms_export \
  --output ./staging/go-sms-pro \
  --owner-phone +15555550100
```

Output:

- one `.json` NDJSON file per conversation (first line `conversation`, then `message` lines)
- `attachments/` for media extracted from PDUs
- `service` is `"SMS"`; most optional fields are omitted/empty

Then import:

```bash
cargo run --release -- import --source go-sms-pro --mode replace
cargo run --release -- dedupe-cross-source
```

## License

MIT (or match your vault repos).
