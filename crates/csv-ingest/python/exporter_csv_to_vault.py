#!/usr/bin/env python3
"""Convert message-exporters CSV (near-vault columns) to vault NDJSON.

Handles go-sms-pro, sms-backup-plus, sms-backup-restore, and imessage CSV shapes:
columns are already vault-oriented; JSON cells (`attachments_json`, `tapbacks_json`,
…) are parsed when present. Exporter-only columns are ignored.

Does not look up contacts or normalize phone numbers — that belongs in the
backup→CSV step. This script only reshapes CSV cells into vault JSON.

Usage:
  python3 exporter_csv_to_vault.py --input path/to.csv --output /tmp/out
  python3 exporter_csv_to_vault.py --input path/to/dir --output /tmp/out \\
      --default-service iMessage
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from typing import Any

from vault_common import (
    SCHEMA,
    SCHEMA_VERSION,
    collect_csvs,
    nonempty,
    parse_bool,
    parse_json_list,
    parse_json_value,
    stable_guid,
    utc_now,
    write_ndjson,
)

DEFAULT_SERVICES = {
    "imessage": "iMessage",
    "go-sms-pro": "SMS",
    "sms-backup-plus": "SMS",
    "sms-backup-restore": "SMS",
}


def parse_attachments(raw: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in parse_json_list(raw):
        if not isinstance(item, dict):
            continue
        att: dict[str, Any] = {}
        if item.get("path"):
            att["path"] = item["path"]
        if item.get("original_name"):
            att["original_name"] = item["original_name"]
        if item.get("mime_type"):
            att["mime_type"] = item["mime_type"]
        if item.get("is_sticker"):
            att["is_sticker"] = bool(item["is_sticker"])
        if item.get("transcription"):
            att["transcription"] = item["transcription"]
        if att:
            out.append(att)
    return out


def parse_tapbacks(raw: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in parse_json_list(raw):
        if not isinstance(item, dict):
            continue
        reactor = (item.get("reactor_handle") or "").strip()
        reactor_name = (item.get("reactor_display_name") or "").strip()
        is_from_me = not reactor or reactor_name == "Me"
        tb: dict[str, Any] = {
            "part_index": int(item.get("part_index") or 0),
            "kind": item.get("kind") or "emoji",
            "is_from_me": is_from_me,
        }
        emoji = item.get("emoji")
        if emoji:
            tb["emoji"] = emoji
        if reactor:
            tb["sender"] = reactor
        out.append(tb)
    return out


def parse_participants(raw: str) -> list[tuple[str, str | None]]:
    out: list[tuple[str, str | None]] = []
    for item in parse_json_list(raw):
        if not isinstance(item, dict):
            continue
        handle = (item.get("handle") or "").strip()
        if not handle:
            continue
        name = (item.get("display_name") or "").strip()
        out.append((handle, name or None))
    return out


def parse_parts(raw: str) -> list[dict[str, Any]]:
    return [p for p in parse_json_list(raw) if isinstance(p, dict)]


def parse_edits(raw: str) -> list[dict[str, Any]]:
    return [e for e in parse_json_list(raw) if isinstance(e, dict)]


def row_to_message(
    row: dict[str, str], default_service: str
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    chat_id = (row.get("chat_identifier") or "").strip()
    timestamp = (row.get("timestamp") or "").strip()
    timestamp_utc = (row.get("timestamp_utc") or "").strip()
    direction = (row.get("direction") or "").strip()
    if not chat_id or not direction or (not timestamp and not timestamp_utc):
        return None

    is_from_me = direction.lower() == "outgoing"
    text = (row.get("text") or "").strip()
    attachments = parse_attachments(row.get("attachments_json") or "")
    is_announcement = parse_bool(row.get("is_announcement") or "")
    announcement = nonempty(row.get("announcement") or "")

    if (
        not text
        and not attachments
        and not (is_announcement and announcement)
    ):
        return None

    ts = timestamp or timestamp_utc
    guid = (row.get("guid") or "").strip()
    att_paths = [a["path"] for a in attachments if a.get("path")]
    if not guid:
        guid = stable_guid(chat_id, ts, is_from_me, text, att_paths)

    service = (row.get("service") or "").strip() or default_service
    sender_handle = (row.get("sender_handle") or "").strip()
    sender_display = (row.get("sender_display_name") or "").strip()

    msg: dict[str, Any] = {
        "record": "message",
        "guid": guid,
        "timestamp": ts,
        "is_from_me": is_from_me,
        "service": service,
    }
    if timestamp_utc:
        msg["timestamp_utc"] = timestamp_utc
    if not is_from_me and sender_handle:
        msg["sender"] = sender_handle
    if subject := nonempty(row.get("subject") or ""):
        msg["subject"] = subject
    if text:
        msg["text"] = text
    if rr := nonempty(row.get("read_receipt") or ""):
        msg["read_receipt"] = rr
    if parse_bool(row.get("is_deleted") or ""):
        msg["is_deleted"] = True
    if se := nonempty(row.get("send_effect") or ""):
        msg["send_effect"] = se
    if sl := nonempty(row.get("shared_location") or ""):
        msg["shared_location"] = sl
    if is_announcement:
        msg["is_announcement"] = True
    if announcement:
        msg["announcement"] = announcement
    if attachments:
        msg["attachments"] = attachments

    tapbacks = parse_tapbacks(row.get("tapbacks_json") or "")
    if tapbacks:
        msg["tapbacks"] = tapbacks
    parts = parse_parts(row.get("parts_json") or "")
    if parts:
        msg["parts"] = parts
    edits = parse_edits(row.get("edits_json") or "")
    if edits:
        msg["edits"] = edits
    app = parse_json_value(row.get("app_json") or "")
    if app is not None:
        msg["app"] = app

    if parse_bool(row.get("is_reply") or ""):
        msg["is_reply"] = True
    if tog := nonempty(row.get("thread_originator_guid") or ""):
        msg["thread_originator_guid"] = tog
    top = (row.get("thread_originator_part") or "").strip()
    if top:
        try:
            msg["thread_originator_part"] = int(top)
        except ValueError:
            pass
    nr = (row.get("num_replies") or "").strip()
    if nr:
        try:
            n = int(nr)
            if n:
                msg["num_replies"] = n
        except ValueError:
            pass

    meta = {
        "chat_identifier": chat_id,
        "conversation_type": (row.get("conversation_type") or "").strip() or "individual",
        "group_title": nonempty(row.get("group_title") or ""),
        "service": service,
        "participants_json": row.get("participants_json") or "",
        "sender_handle": sender_handle,
        "sender_display_name": sender_display,
    }
    return msg, meta


def convert_csv(
    path: Path, default_service: str, exported_at: str
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise ValueError(f"no data rows in {path}")

    messages: list[dict[str, Any]] = []
    participants: dict[str, str | None] = {}
    chat_id = ""
    conversation_type = "individual"
    group_title: str | None = None
    service = default_service
    skipped = 0

    for row in rows:
        converted = row_to_message(row, default_service)
        if converted is None:
            skipped += 1
            continue
        msg, meta = converted
        if not chat_id:
            chat_id = meta["chat_identifier"]
            conversation_type = meta["conversation_type"]
            group_title = meta["group_title"]
            service = meta["service"] or default_service
            for handle, hint in parse_participants(meta["participants_json"]):
                participants.setdefault(handle, hint)
        if meta["sender_handle"]:
            participants.setdefault(
                meta["sender_handle"],
                meta["sender_display_name"] or None,
            )
        if not msg["is_from_me"] and msg.get("sender"):
            participants.setdefault(msg["sender"], None)
        if chat_id:
            participants.setdefault(chat_id, None)
        messages.append(msg)

    if not chat_id or not messages:
        raise ValueError(f"no convertible messages in {path} (skipped={skipped})")

    participant_list: list[dict[str, Any]] = []
    for handle, hint in participants.items():
        entry: dict[str, Any] = {"handle": handle}
        if hint:
            entry["name_hint"] = hint
        participant_list.append(entry)

    header: dict[str, Any] = {
        "record": "conversation",
        "schema": SCHEMA,
        "schema_version": SCHEMA_VERSION,
        "chat_identifier": chat_id,
        "service": service,
        "conversation_type": conversation_type,
        "participants": participant_list,
        "exported_at": exported_at,
    }
    if group_title:
        header["group_title"] = group_title
    return header, messages


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument(
        "--source-id",
        default=None,
        help="Optional source id (sets default service when --default-service omitted)",
    )
    p.add_argument(
        "--default-service",
        default=None,
        help="Fallback service when CSV service cell is empty (default: SMS)",
    )
    p.add_argument(
        "--timezone",
        default=None,
        help="Ignored (accepted for a uniform Rust dispatcher CLI)",
    )
    args = p.parse_args(argv)

    default_service = args.default_service
    if not default_service and args.source_id:
        default_service = DEFAULT_SERVICES.get(args.source_id, "SMS")
    if not default_service:
        default_service = "SMS"

    try:
        csvs = collect_csvs(args.input, recursive=False)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    if not csvs:
        print(f"error: no .csv under {args.input}", file=sys.stderr)
        return 2

    args.output.mkdir(parents=True, exist_ok=True)
    exported_at = utc_now()
    conversations = 0
    messages = 0
    errors: list[str] = []

    for csv_path in csvs:
        try:
            header, msgs = convert_csv(csv_path, default_service, exported_at)
            out_path = args.output / f"{csv_path.stem}.json"
            write_ndjson(out_path, header, msgs)
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
