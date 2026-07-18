"""Shared helpers for CSV → vault NDJSON converters."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "vault"
SCHEMA_VERSION = 1


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


def collect_csvs(input_path: Path, *, recursive: bool = False) -> list[Path]:
    if input_path.is_file():
        if input_path.suffix.lower() != ".csv":
            raise ValueError(f"not a .csv file: {input_path}")
        return [input_path]
    if not input_path.is_dir():
        raise ValueError(f"input does not exist: {input_path}")
    if recursive:
        return sorted(input_path.rglob("*.csv"))
    return sorted(p for p in input_path.iterdir() if p.is_file() and p.suffix.lower() == ".csv")


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def write_ndjson(path: Path, header: dict[str, Any], messages: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as out:
        out.write(json.dumps(header, ensure_ascii=False, separators=(",", ":")))
        out.write("\n")
        for msg in messages:
            out.write(json.dumps(msg, ensure_ascii=False, separators=(",", ":")))
            out.write("\n")


def parse_json_list(raw: str) -> list[Any]:
    raw = (raw or "").strip()
    if not raw or raw in ("[]", "null"):
        return []
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError(f"expected JSON array, got {type(data).__name__}")
    return data


def parse_json_value(raw: str) -> Any | None:
    raw = (raw or "").strip()
    if not raw or raw == "null":
        return None
    return json.loads(raw)


def parse_bool(raw: str) -> bool:
    return (raw or "").strip().lower() in ("1", "true", "yes")


def nonempty(raw: str) -> str | None:
    t = (raw or "").strip()
    return t if t else None
