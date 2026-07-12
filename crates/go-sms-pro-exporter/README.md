# go-sms-pro-exporter

Convert a **GO SMS Pro** (GOMO / Jiubang) local backup into imessage-json **schema v3** NDJSON so it can be imported with [`message-vault-rs`](../message-vault-rs).

## Input

A directory containing:

- `gosms_sys*.xml` — SMS (`<GoSms><SMS>…`)
- `I_<unix>_*.pdu` — MMS PDU blobs (attachments extracted by magic-byte heuristics)

There is no public GO SMS Pro backup spec; XML fields mirror [Android Telephony SMS columns](https://developer.android.com/reference/android/provider/Telephony.TextBasedSmsColumns). PDU parsing follows heuristics from the personal `message-vault` GoSMS converter (reference only).

## Usage

```bash
cargo run --release -- \
  --input /path/to/gosms_export \
  --output ./export \
  --owner-phone +19412660605
```

Output:

- one `.json` NDJSON file per conversation (first line `conversation`, then `message` lines)
- `attachments/` for media extracted from PDUs
- `service` is `"SMS"`; most optional fields are omitted/empty

## Import into message-vault-rs

```bash
cd ../message-vault-rs
cargo run --release -- import \
  --source go-sms-pro \
  --mode replace
```

## License

MIT (or match your vault repos).
