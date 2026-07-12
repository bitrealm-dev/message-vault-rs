# sms-backup-plus-exporter

This tool turns **[SMS Backup+](https://github.com/jberkel/sms-backup-plus)** email dumps (`.eml` files) into a clean set of one-message-per-file emails, or into line-by-line JSON (NDJSON) for [`message-vault-rs`](../message-vault-rs).

## Two kinds of input files

An export usually mixes two shapes of `.eml`:

1. **Flat** — one text or picture message in one file.  
   Example: `2015-08-24_165449_SMS.eml` with headers like `X-smssync-address` and `Subject: SMS with Nathan`.

2. **Archive** — many texts packed into one file.  
   Example: `SMS archive with Alice (2011-2013).eml`. Inside the body, each text starts with a line like `2012-05-24 14:20:31 - Alice`.

A messy backup often has the same flat message copied under several folders, plus archive files that repeat some of those texts. See [docs/FORMAT.md](docs/FORMAT.md) for header details.

## Typical workflow

1. Run `dedupe-eml` on the messy export → `./clean-eml` (one clean copy per text, by year).
2. Optional: open `junk/unresolved_names.txt`, fix contacts / name mapping, re-run.
3. Run `convert` on the clean tree → NDJSON + attachments.
4. Import that folder into message-vault-rs.

## `dedupe-eml` — messy tree → one clean copy per message

`dedupe-eml` walks every `.eml` under the input folder. It keeps one flat file when the same text appears many times, and puts winners into year folders.

### Output layout

```
clean-eml/
  2015/
    20150824_165449_recv_19546515240_3ef3bc01e72c.eml
  2016/
    …
  junk/
    2014/
      …          # parsed SMS, but the phone number is still unknown
    unresolved_names.txt
  unparseable/
    message-1-59044.eml   # looked like SMS Backup+, but parsing failed
  dedupe.log
```

Filename pattern:

```
{YYYY}/{YYYYMMDD_HHMMSS}_{sent|recv}_{chat}_{short_id}.eml
```

`dedupe.log` records DROP / REPLACE / COPY / GENERATED / UNPARSEABLE (and unique MAP / CONTACT lines). Per-message KEEP and OVERLAP lines are omitted so large runs stay fast; overlap counts still appear in the summary.

### How two files count as the same text

Matching uses chat, time, direction, and body text (and hashes of any attached files when comparing two flats).

The `X-smssync-id` header is not trusted on its own — two different chats can use the same id (ex. `276`) for different people. When that header is present, the match key still includes chat, time, direction, and text.

Archive body times only go down to whole seconds (`2012-05-24 14:20:31`). Flat files often have millisecond dates. Archive lines are matched to flats using whole-second time and text (attachment hashes are ignored for that check), so a flat at `…488` ms still covers an archive line at the same second.

### Texts that exist only in an archive

Example: `SMS archive with Alice.eml` lists `2012-05-24 14:20:31 - Alice` / `See you Thursday`, but there is no matching flat like `20120524_142031_recv_….eml`.

For those cases, `dedupe-eml` generates a new flat `.eml` (logged as `GENERATED`). That file is not a copy of an original backup email. It uses a made-up `X-smssync-id` and a short set of headers.

### Contacts and name mapping

Some archive (and a few flat) messages only know a person’s name, not their phone. Those can be filled in with CSVs:

| File | Columns | Role |
| --- | --- | --- |
| `config/eml_contacts.csv` | `phones,first_name,last_name` | Name → phone |
| `config/name-mapping.csv` | `correct_name,incorrect_name` | Fix messy subject names, then look up contacts |

Example: subject says `Casey Typo` → mapping rewrites to `Casey Proper` → contacts CSV supplies `+15555550888`.

Unresolved names stay under `junk/` and are listed in `junk/unresolved_names.txt`. The CLI reports **unique** names mapped and contacts resolved (not one count per message).

Start from the example files:

- [`config/eml_contacts.example.csv`](config/eml_contacts.example.csv)
- [`config/name-mapping.example.csv`](config/name-mapping.example.csv)

Real CSVs under `config/` are gitignored.

```bash
cargo run --release -- -v dedupe-eml \
  --input /path/to/messy/exports \
  --output ./clean-eml \
  --owner-phone +15555550100 \
  --owner-email owner@example.com \
  --contacts config/eml_contacts.csv \
  --name-mapping config/name-mapping.csv
```

Global flags (before or after the subcommand):

- `-v` / `--verbose` — progress on stderr every 5000 items  
- `--no-summary` — skip the end-of-run stats on stdout  

## `convert` — clean EML → NDJSON

`convert` reads a tree of flat `.eml` files (ideally the output of `dedupe-eml`) and writes the JSON format message-vault-rs expects (NDJSON), plus an `attachments/` folder for pictures and other media.

```bash
cargo run --release -- convert \
  --input ./clean-eml \
  --output ./export \
  --owner-phone +15555550100 \
  --owner-email owner@example.com
```

## Import into message-vault-rs

```bash
cd ../message-vault-rs
cargo run --release -- import \
  --export-dir ../sms-backup-plus-exporter/export \
  --mode append
```

## Related tools

[message-vault](../message-vault)’s Python `sms_eml_master` pipeline turns the same kind of dump into per-contact conversation JSON for Obsidian and related views. This crate focuses on cleaning EML files and writing NDJSON for message-vault-rs.
