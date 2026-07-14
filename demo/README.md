# Message Vault demo dataset

Committed iMessage NDJSON bundle for local browsing without a real iPhone backup.

Regenerate with:

```bash
cargo run -p demo-seed -- --out demo --seed 42
```

Then import:

```bash
cargo run --release -- reset-demo
cd web && npm run process-assets
```

## Contents

| Item | Count |
|------|-------|
| Contacts (CSV) | 30 |
| Conversation files | 47 |
| Messages | 1425 |
| Attachment references | 392 |

## Exercises

- **Contacts / All / Excluded / No Messages** — CSV `exclude` and zero-message rows
- **Unassigned** — handles with messages but no CSV row (phone + email-only)
- **Group Chats** — named titles, generic `chat…` ids, 3–9 participants, announcements
- **Year threads** — 1:1 messages from 2020 through present
- **Replies, tapbacks, attachments** — including one intentionally missing file
- **orphaned.json** — messages without a conversation header
- **exclude.csv** — short-code spam absent after import
