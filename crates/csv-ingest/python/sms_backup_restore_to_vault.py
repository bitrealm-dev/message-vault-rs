#!/usr/bin/env python3
"""Convert sms-backup-restore-exporter-csv output to vault NDJSON.

Example of a one-script-per-source converter. Shared reshape logic lives in
`exporter_csv.py`. Add a new source by copying this file and changing
SOURCE_ID / DEFAULT_SERVICE (and any source-specific transforms later).

Usage:
  python3 sms_backup_restore_to_vault.py --input path/to.csv --output /tmp/out
"""

from __future__ import annotations

from exporter_csv import run_exporter_main

SOURCE_ID = "sms-backup-restore"
DEFAULT_SERVICE = "SMS"


def main(argv: list[str] | None = None) -> int:
    return run_exporter_main(
        source_id=SOURCE_ID,
        default_service=DEFAULT_SERVICE,
        description=__doc__ or SOURCE_ID,
        argv=argv,
    )


if __name__ == "__main__":
    raise SystemExit(main())
