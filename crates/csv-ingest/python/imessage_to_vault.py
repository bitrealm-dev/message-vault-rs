#!/usr/bin/env python3
"""Convert imessage-exporter-csv output to vault NDJSON.

Example of a one-script-per-source converter. Shared reshape logic lives in
`exporter_csv.py`. Default service is iMessage; rich columns (tapbacks, parts,
…) are still parsed when present in the CSV.

Usage:
  python3 imessage_to_vault.py --input path/to.csv --output /tmp/out
"""

from __future__ import annotations

from exporter_csv import run_exporter_main

SOURCE_ID = "imessage"
DEFAULT_SERVICE = "iMessage"


def main(argv: list[str] | None = None) -> int:
    return run_exporter_main(
        source_id=SOURCE_ID,
        default_service=DEFAULT_SERVICE,
        description=__doc__ or SOURCE_ID,
        argv=argv,
    )


if __name__ == "__main__":
    raise SystemExit(main())
