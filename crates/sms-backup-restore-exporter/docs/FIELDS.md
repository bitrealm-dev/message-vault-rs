# Fields in SMS Backup & Restore XML

This page describes the XML attributes that **SMS Backup & Restore** writes, and how **sms-backup-restore-exporter** uses them.

Source: SyncTech’s [Fields in XML backup files](https://www.synctech.com.au/sms-backup-restore/fields-in-xml-backup-files/). Related SyncTech links:

- [Sample XML](https://synctech.com.au/wp-content/uploads/2018/01/sms-sample.xml_.txt)
- [XSD schema](https://synctech.com.au/wp-content/uploads/2018/01/sms.xsd_.txt)
- [Date field FAQ](https://www.synctech.com.au/faqs/what-is-that-number-the-date-field-in-the-backup-file/) — dates are Java epoch milliseconds in UTC (for example `1400773261000` → 2014-05-22)

## File shape

Root element: `<smses>` (current) or `<allsms>` (legacy).

Child message elements:

- `<sms>` — plain text SMS
- `<mms>` — MMS with nested parts and addresses

Call logs use `<calls>` / `<call>`. They are documented below for reference. This exporter does not write call records.

Field values are generally copied as-is from the Android SMS/MMS databases. The backup app does little conversion.

---

## SMS messages (`<sms>`)

| Attribute | Meaning |
|-----------|---------|
| `protocol` | Protocol id; usually `0` for SMS |
| `address` | Phone number of the other person |
| `date` | Sent/received time as Java ms UTC |
| `type` | `1` received, `2` sent, `3` draft, `4` outbox, `5` failed, `6` queued |
| `subject` | Subject; always null for SMS |
| `body` | Message text |
| `toa` | Unused; usually null |
| `sc_toa` | Unused; usually null |
| `service_center` | Service center for received messages; null for sent |
| `read` | `1` read, `0` unread |
| `status` | `-1` none, `0` complete, `32` pending, `64` failed |
| `sub_id` | Optional SIM / subscription index (`0`, `1`, …) |
| `readable_date` | Optional human-readable date string |
| `contact_name` | Optional contact display name |

### How the exporter uses SMS fields

- `address` → chat id and participant handle (after phone normalization)
- `date` → message timestamp (invalid or missing dates are skipped)
- `type` `1` / `2` → `is_from_me` false / true; other types are skipped
- `body` → message text (HTML entities decoded)
- `contact_name` → optional `name_hint` on the participant

Example: `<sms address="+15555550101" date="1400773261000" type="1" body="hello &amp; hi" contact_name="Sam" />` becomes a received message in chat `+15555550101` with text `hello & hi`.

---

## MMS messages (`<mms>`)

An MMS has three layers:

1. Attributes on `<mms>` (time, box, subject, address list)
2. Content in `<parts><part>…</part></parts>`
3. Recipients in `<addrs><addr>…</addr></addrs>`

### `<mms>` attributes

| Attribute | Meaning |
|-----------|---------|
| `date` | Sent/received time as Java ms UTC |
| `ct_t` | Message content type; usually `application/vnd.wap.multipart.related` |
| `msg_box` | `1` received, `2` sent, `3` draft, `4` outbox |
| `rr` | Read-report flag |
| `sub` | Subject, if any |
| `read_status` | Read-status flag |
| `address` | Phone number(s); group threads often use `~`-separated numbers |
| `m_id` | Message-ID from the MMS |
| `read` | Whether the message was read |
| `m_size` | Message size |
| `m_type` | MMS message type (MMS spec) |
| `sim_slot` | SIM card slot |
| `readable_date` | Optional human-readable date |
| `contact_name` | Optional contact display name |

### `<part>` attributes

| Attribute | Meaning |
|-----------|---------|
| `seq` | Order of the part |
| `ct` | Content type (`text/plain`, `image/jpeg`, `application/smil`, …) |
| `name` | Part name |
| `chset` | Charset |
| `cl` | Content location (often the filename used in SMIL) |
| `text` | Text content of the part |
| `data` | Base64-encoded binary content |

### `<addr>` attributes

| Attribute | Meaning |
|-----------|---------|
| `address` | Phone number of sender or recipient |
| `type` | `129` BCC, `130` CC, `151` To, `137` From |
| `charset` | Character set for this entry |

### How the exporter uses MMS fields

- `date` → timestamp (bad dates skipped)
- `msg_box` `2` → sent; otherwise From addr (`type="137"`) sets the sender when received
- `address` plus `<addr>` list → participants; one other person is a 1:1 chat, more than one is a group
- `text/plain` parts → message body; SMIL (`application/smil`) controls text/image order when present
- Non-text `data` → files under `attachments/` (for example `20140522_123101_a1b2c3d4e5f67890_pic.jpg`)
- `contact_name` → optional name hint on 1:1 chats
- Empty participant lists and undecodable attachment base64 are skipped and counted in the run report

Example group address string: `+15555550101~+15555550102` with two From/To addrs becomes a group chat titled from those two numbers.

---

## Call logs (`<call>`) — not exported

| Attribute | Meaning |
|-----------|---------|
| `number` | Phone number of the call |
| `duration` | Duration in seconds |
| `date` | Time as Java ms UTC |
| `type` | `1` incoming, `2` outgoing, `3` missed, `4` voicemail, `5` rejected, `6` refused list |
| `presentation` | Caller ID: `1` allowed, `2` restricted, `3` unknown, `4` payphone |
| `subscription_id` | Optional SIM / subscription id |
| `readable_date` | Optional human-readable date |
| `contact_name` | Optional contact name |

Call rows can appear in the same backup XML. They are listed here so the file format is complete. The exporter ignores them because the SMS NDJSON schema has no call model.
