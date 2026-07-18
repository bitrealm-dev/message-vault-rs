#!/usr/bin/env python3
"""Convert iMazing Messages CSV exports to vault NDJSON.

Usage:
  python3 imazing_to_vault.py --input path/to.csv --output /tmp/out
  python3 imazing_to_vault.py --input path/to/dir --output /tmp/out --timezone America/Chicago

Message Date has no offset. By default the script uses this computer's local
timezone. Pass --timezone only if the phone lived in a different zone than this machine.

Writes one {stem}.json NDJSON file per input CSV (conversation header + messages).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

SCHEMA = "vault"
SCHEMA_VERSION = 1

PHONE_RE = re.compile(r"^\+\d{7,15}$")
PHONE_IN_TEXT_RE = re.compile(r"\+\d{7,15}")
REACTION_YOU_RE = re.compile(
    r"You reacted with\s+(.+?)\s+on\s+(.+)$", re.IGNORECASE | re.DOTALL
)
REACTION_HANDLE_RE = re.compile(
    r"(\+\d{7,15})\s+reacted with\s+(.+?)\s+on\s+(.+)$", re.IGNORECASE | re.DOTALL
)


def stable_guid(
    chat_id: str,
    timestamp: str,
    is_from_me: bool,
    text: str,
    attachment_paths: list[str],
) -> str:
    h = hashlib.sha256()
    h.update(chat_id.encode())
    h.update(b"|")
    h.update(timestamp.encode())
    h.update(b"|")
    h.update(b"1" if is_from_me else b"0")
    h.update(b"|")
    h.update(text.encode())
    for p in attachment_paths:
        h.update(b"|")
        h.update(p.encode())
    return h.hexdigest()


def parse_local_time(raw: str, tz: ZoneInfo) -> tuple[str, str] | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            naive = datetime.strptime(raw, fmt)
            local = naive.replace(tzinfo=tz)
            utc = local.astimezone(timezone.utc)
            return (
                local.isoformat(timespec="seconds"),
                utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
            )
        except ValueError:
            continue
    return None


def split_session_parts(chat_session: str) -> list[str]:
    return [p.strip() for p in chat_session.split(" & ") if p.strip()]


def phones_from_session(chat_session: str) -> list[str]:
    return sorted(set(PHONE_IN_TEXT_RE.findall(chat_session or "")))


def collect_peer_handles(rows: list[dict[str, str]]) -> list[str]:
    handles: set[str] = set()
    for row in rows:
        sid = (row.get("Sender ID") or "").strip()
        if PHONE_RE.match(sid) or ("@" in sid and "." in sid):
            handles.add(sid)
        for phone in phones_from_session(row.get("Chat Session") or ""):
            handles.add(phone)
    return sorted(handles)


def is_group(chat_session: str, peer_handles: list[str]) -> bool:
    if " & " in (chat_session or ""):
        return True
    return len(peer_handles) >= 2


def resolve_chat_identifier(
    chat_session: str, peer_handles: list[str], group: bool
) -> str:
    if group:
        if peer_handles:
            return ",".join(peer_handles)
        return chat_session.strip()
    if len(peer_handles) == 1:
        return peer_handles[0]
    if peer_handles:
        return peer_handles[0]
    return chat_session.strip()


def build_participants(
    chat_session: str, rows: list[dict[str, str]], peer_handles: list[str]
) -> list[dict[str, Any]]:
    name_by_handle: dict[str, str] = {}
    for row in rows:
        sid = (row.get("Sender ID") or "").strip()
        name = (row.get("Sender Name") or "").strip()
        if sid and name and sid not in name_by_handle:
            name_by_handle[sid] = name

    # Attach session name tokens to matching sender names when possible.
    session_names = [
        p for p in split_session_parts(chat_session) if not PHONE_RE.match(p)
    ]
    for name in session_names:
        for handle, hint in list(name_by_handle.items()):
            if hint == name:
                break
        else:
            # Name with no handle yet — skip (no phone to store).
            pass

    participants: list[dict[str, Any]] = []
    for handle in peer_handles:
        entry: dict[str, Any] = {"handle": handle}
        if handle in name_by_handle:
            entry["name_hint"] = name_by_handle[handle]
        participants.append(entry)

    if not participants and chat_session.strip():
        # Fallback: display-only session title as handle.
        participants.append({"handle": chat_session.strip()})
    return participants


def parse_reactions(raw: str) -> list[dict[str, Any]]:
    if not (raw or "").strip():
        return []
    tapbacks: list[dict[str, Any]] = []
    for line in raw.replace("\r\n", "\n").split("\n"):
        line = line.strip()
        if not line:
            continue
        m = REACTION_HANDLE_RE.match(line)
        if m:
            handle, emoji, _when = m.group(1), m.group(2).strip(), m.group(3)
            tapbacks.append(
                {
                    "part_index": 0,
                    "kind": "emoji",
                    "emoji": emoji,
                    "is_from_me": False,
                    "sender": handle,
                }
            )
            continue
        m = REACTION_YOU_RE.match(line)
        if m:
            emoji = m.group(1).strip()
            tapbacks.append(
                {
                    "part_index": 0,
                    "kind": "emoji",
                    "emoji": emoji,
                    "is_from_me": True,
                }
            )
    return tapbacks


def attachment_records(row: dict[str, str]) -> list[dict[str, Any]]:
    path = (row.get("Attachment") or "").strip()
    if not path:
        return []
    kind = (row.get("Attachment type") or "").strip()
    name = path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    att: dict[str, Any] = {"path": path, "original_name": name}
    if kind:
        att["mime_type"] = kind
    return [att]


def row_has_body(row: dict[str, str], attachments: list[dict[str, Any]]) -> bool:
    if (row.get("Text") or "").strip():
        return True
    if attachments:
        return True
    return False


def convert_csv(path: Path, tz: ZoneInfo, exported_at: str) -> tuple[dict, list[dict]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    if not rows:
        raise ValueError(f"no data rows in {path}")

    chat_session = (rows[0].get("Chat Session") or "").strip()
    peer_handles = collect_peer_handles(rows)
    group = is_group(chat_session, peer_handles)
    chat_id = resolve_chat_identifier(chat_session, peer_handles, group)
    participants = build_participants(chat_session, rows, peer_handles)

    # Prefer first non-empty Service; default iMessage/SMS later per row.
    default_service = "SMS"
    for row in rows:
        svc = (row.get("Service") or "").strip()
        if svc:
            default_service = svc
            break

    header: dict[str, Any] = {
        "record": "conversation",
        "schema": SCHEMA,
        "schema_version": SCHEMA_VERSION,
        "chat_identifier": chat_id,
        "service": default_service,
        "conversation_type": "group" if group else "individual",
        "participants": participants,
        "exported_at": exported_at,
    }
    if group and chat_session:
        header["group_title"] = chat_session

    messages: list[dict[str, Any]] = []
    for row in rows:
        msg_type = (row.get("Type") or "").strip()
        is_from_me = msg_type.lower() == "outgoing"
        attachments = attachment_records(row)
        if not row_has_body(row, attachments):
            continue

        parsed = parse_local_time(row.get("Message Date") or "", tz)
        if not parsed:
            continue
        ts_local, ts_utc = parsed

        text = (row.get("Text") or "").strip()
        sender = (row.get("Sender ID") or "").strip()
        service = (row.get("Service") or "").strip() or default_service
        subject = (row.get("Subject") or "").strip()
        deleted = bool((row.get("Deleted Date") or "").strip())
        tapbacks = parse_reactions(row.get("Reactions") or "")
        replying = (row.get("Replying to") or "").strip()

        att_paths = [a["path"] for a in attachments if a.get("path")]
        guid = stable_guid(chat_id, ts_local, is_from_me, text, att_paths)

        msg: dict[str, Any] = {
            "record": "message",
            "guid": guid,
            "timestamp": ts_local,
            "timestamp_utc": ts_utc,
            "is_from_me": is_from_me,
            "service": service,
        }
        if not is_from_me and sender:
            msg["sender"] = sender
        if subject:
            msg["subject"] = subject
        if text:
            msg["text"] = text
        if deleted:
            msg["is_deleted"] = True
        if attachments:
            msg["attachments"] = attachments
        if tapbacks:
            msg["tapbacks"] = tapbacks
        if replying:
            msg["is_reply"] = True
            # No originator guid in iMazing CSV; keep prose out of vault fields for now.

        messages.append(msg)

    if not messages:
        raise ValueError(f"no convertible messages in {path}")
    return header, messages


def collect_csvs(input_path: Path) -> list[Path]:
    if input_path.is_file():
        if input_path.suffix.lower() != ".csv":
            raise ValueError(f"not a .csv file: {input_path}")
        return [input_path]
    if not input_path.is_dir():
        raise ValueError(f"input does not exist: {input_path}")
    return sorted(input_path.rglob("*.csv"))


def default_local_timezone() -> tuple[Any, str]:
    """Timezone of this machine (what most home users want). Prefers an IANA name for DST."""
    # Linux: /etc/localtime → .../zoneinfo/America/New_York
    try:
        link = Path("/etc/localtime").resolve()
        parts = link.parts
        if "zoneinfo" in parts:
            i = parts.index("zoneinfo")
            name = "/".join(parts[i + 1 :])
            if name:
                return ZoneInfo(name), name
    except Exception:
        pass
    # /etc/timezone (Debian/Ubuntu)
    try:
        name = Path("/etc/timezone").read_text(encoding="utf-8").strip()
        if name:
            return ZoneInfo(name), name
    except Exception:
        pass
    local = datetime.now().astimezone().tzinfo
    key = getattr(local, "key", None)
    if isinstance(key, str) and key:
        try:
            return ZoneInfo(key), key
        except Exception:
            pass
    if local is not None:
        return local, str(local)
    return ZoneInfo("UTC"), "UTC"


def resolve_timezone(name: str | None) -> tuple[Any, str]:
    if name and name.strip():
        tz = ZoneInfo(name.strip())
        return tz, name.strip()
    return default_local_timezone()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True, type=Path, help="CSV file or directory")
    p.add_argument("--output", required=True, type=Path, help="Output directory for .json")
    p.add_argument(
        "--timezone",
        default=None,
        help="Override timezone for Message Date (default: this computer's local zone)",
    )
    args = p.parse_args(argv)

    try:
        tz, tz_label = resolve_timezone(args.timezone)
    except Exception as e:
        print(f"error: invalid --timezone {args.timezone!r}: {e}", file=sys.stderr)
        return 2

    csvs = collect_csvs(args.input)
    if not csvs:
        print(f"error: no .csv under {args.input}", file=sys.stderr)
        return 2

    args.output.mkdir(parents=True, exist_ok=True)
    exported_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"using timezone={tz_label}", file=sys.stderr)

    conversations = 0
    messages = 0
    errors: list[str] = []

    for csv_path in csvs:
        try:
            header, msgs = convert_csv(csv_path, tz, exported_at)
            out_path = args.output / f"{csv_path.stem}.json"
            with out_path.open("w", encoding="utf-8") as out:
                out.write(json.dumps(header, ensure_ascii=False, separators=(",", ":")))
                out.write("\n")
                for msg in msgs:
                    out.write(json.dumps(msg, ensure_ascii=False, separators=(",", ":")))
                    out.write("\n")
            conversations += 1
            messages += len(msgs)
            print(f"wrote {out_path} ({len(msgs)} messages)")
        except Exception as e:
            errors.append(f"{csv_path}: {e}")

    print(
        f"done conversations={conversations} messages={messages} errors={len(errors)}",
        file=sys.stderr,
    )
    for err in errors[:10]:
        print(f"  {err}", file=sys.stderr)
    return 0 if conversations > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
