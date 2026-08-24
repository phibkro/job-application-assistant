#!/usr/bin/env python3
"""Restore one Cloudflare D1 database into a disposable D1, in bounded units.

The source is read only.  The target is created and deleted by this explicit
operator command; no target name is accepted if it is already present or is a
shared stage database.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "db/schema.sql"
DEFAULT_REPORT = ROOT / ".artifacts/d1-restore/report.json"
PROFILE = "profile-qualification"
NAV_PLATFORM = "arbeidsplassen-nav"
PAGE_SIZE = 100
MAX_INSERT_ROWS = 100
MAX_INSERT_BYTES = 250_000
PROVIDER_LIMITATIONS = [
    "Cloudflare D1 has no atomic cross-database snapshot API; per-table counts and digests detect source changes during the run.",
    "Transfer uses Wrangler's bounded JSON query API and therefore requires the operator's ambient Wrangler authentication.",
    "The disposable target is deleted after validation on both success and failure; a retained recovery copy requires a separate provider-approved workflow.",
]
SHARED_TARGET_PREFIXES = (
    "job-index-production",
    "job-index-staging",
    "job-index-preview",
)
SHARED_TARGET_NAMES = {
    "production",
    "staging",
    "preview",
    "prod",
    "stage",
}


class RestoreError(RuntimeError):
    """A redacted, operator-safe restore failure."""


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_wrangler(arguments: list[str]) -> str:
    """Run Wrangler without ever including output or SQL in an error report."""
    environment = os.environ.copy()
    environment["CI"] = "1"
    try:
        completed = subprocess.run(
            ["wrangler", *arguments],
            cwd=ROOT,
            env=environment,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as error:
        raise RestoreError("Wrangler is not available in PATH.") from error
    except subprocess.CalledProcessError as error:
        operation = " ".join(arguments[:3])
        raise RestoreError(
            f"Wrangler command failed with exit status {error.returncode}: {operation}"
        ) from error
    return completed.stdout


def parse_json_output(text: str) -> Any:
    """Parse JSON even when Wrangler prefixes it with informational text."""
    stripped = text.strip()
    candidates = [stripped]
    candidates.extend(stripped[index:] for index, char in enumerate(stripped) if char in "[{" )
    for candidate in reversed(candidates):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    raise RestoreError("Wrangler returned a non-JSON response for a JSON query.")


def execute_json(database: str, sql: str) -> Any:
    output = run_wrangler(
        [
            "d1",
            "execute",
            database,
            "--remote",
            "--json",
            "--yes",
            "--command",
            sql,
        ]
    )
    payload = parse_json_output(output)
    if isinstance(payload, dict) and payload.get("success") is False:
        raise RestoreError(f"D1 query failed for database {database}.")
    return payload


def execute_sql(database: str, sql: str) -> None:
    run_wrangler(
        [
            "d1",
            "execute",
            database,
            "--remote",
            "--yes",
            "--command",
            sql,
        ]
    )


def execute_schema(database: str) -> None:
    run_wrangler(
        [
            "d1",
            "execute",
            database,
            "--remote",
            "--yes",
            "--file",
            str(SCHEMA_PATH),
        ]
    )


def unwrap_rows(payload: Any) -> list[dict[str, Any]]:
    """Extract D1 result rows across Wrangler's supported JSON envelopes."""
    if isinstance(payload, dict):
        if isinstance(payload.get("results"), list):
            return [row for row in payload["results"] if isinstance(row, dict)]
        for key in ("result", "data", "rows"):
            if key in payload:
                rows = unwrap_rows(payload[key])
                if rows or payload[key] == []:
                    return rows
        if payload and not any(key in payload for key in ("success", "meta", "errors", "messages")):
            return [payload]
        return []
    if isinstance(payload, list):
        rows: list[dict[str, Any]] = []
        for item in payload:
            if isinstance(item, dict) and isinstance(item.get("results"), list):
                rows.extend(row for row in item["results"] if isinstance(row, dict))
            else:
                nested = unwrap_rows(item)
                rows.extend(nested)
        return rows
    return []


def database_names(payload: Any) -> set[str]:
    names: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for key in ("name", "database_name", "databaseName"):
                name = value.get(key)
                if isinstance(name, str) and name:
                    names.add(name)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(payload)
    return names


def list_database_names() -> set[str]:
    payload = parse_json_output(run_wrangler(["d1", "list", "--json"]))
    names = database_names(payload)
    if not names:
        raise RestoreError("Wrangler returned no parseable D1 database names.")
    return names


def schema_metadata() -> tuple[list[str], dict[str, list[str]], list[str]]:
    connection = sqlite3.connect(":memory:")
    try:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        tables = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        columns = {
            table: [
                row[1]
                for row in connection.execute(
                    f"PRAGMA table_info({quote_identifier(table)})"
                )
            ]
            for table in tables
        }
        dependencies = {
            table: [
                row[2]
                for row in connection.execute(
                    f"PRAGMA foreign_key_list({quote_identifier(table)})"
                )
                if row[2] in tables
            ]
            for table in tables
        }
    finally:
        connection.close()

    remaining = {table: set(dependencies[table]) for table in tables}
    ordered: list[str] = []
    while remaining:
        ready = sorted(table for table, deps in remaining.items() if not deps)
        if not ready:
            raise RestoreError("Canonical schema contains a foreign-key cycle.")
        ordered.extend(ready)
        for table in ready:
            del remaining[table]
        for deps in remaining.values():
            deps.difference_update(ready)
    return tables, columns, ordered


def table_count(database: str, table: str, where: str | None = None) -> int:
    predicate = f" WHERE {where}" if where else ""
    rows = unwrap_rows(
        execute_json(
            database,
            f"SELECT COUNT(*) AS row_count FROM {quote_identifier(table)}{predicate}",
        )
    )
    if len(rows) != 1 or not isinstance(rows[0].get("row_count"), (int, float)):
        raise RestoreError(f"Could not read the row count for table {table}.")
    return int(rows[0]["row_count"])


def table_names(database: str) -> list[str]:
    rows = unwrap_rows(
        execute_json(
            database,
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
    )
    return [row["name"] for row in rows if isinstance(row.get("name"), str)]




def ordered_select(table: str, columns: list[str], where: str | None = None) -> str:
    selected = ", ".join(quote_identifier(column) for column in columns)
    order = ", ".join(quote_identifier(column) for column in columns)
    statement = f"SELECT {selected} FROM {quote_identifier(table)}"
    if where:
        statement += f" WHERE {where}"
    return f"{statement} ORDER BY {order}"


def fetch_page(
    database: str,
    table: str,
    columns: list[str],
    offset: int,
    where: str | None = None,
) -> list[dict[str, Any]]:
    statement = (
        ordered_select(table, columns, where)
        + f" LIMIT {PAGE_SIZE} OFFSET {offset}"
    )
    return unwrap_rows(execute_json(database, statement))


def digest_row(digest: hashlib._Hash, row: dict[str, Any]) -> None:
    digest.update(
        json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    )
    digest.update(b"\n")

def rows_digest(
    database: str,
    table: str,
    columns: list[str],
    where: str | None = None,
    expected_count: int | None = None,
) -> tuple[int, str]:
    actual_count = table_count(database, table, where)
    if expected_count is not None and actual_count != expected_count:
        raise RestoreError(f"Row count changed while reading {table}.")
    digest = hashlib.sha256()
    offset = 0
    seen = 0
    while offset < actual_count:
        page = fetch_page(database, table, columns, offset, where)
        if not page:
            raise RestoreError(f"D1 returned no rows while reading {table}.")
        for row in page:
            if any(column not in row for column in columns):
                raise RestoreError(f"D1 row for {table} is missing a canonical column.")
            digest_row(digest, {column: row[column] for column in columns})
        seen += len(page)
        offset += len(page)
        if len(page) > PAGE_SIZE:
            raise RestoreError(f"D1 returned an unbounded page for {table}.")
    if seen != actual_count:
        raise RestoreError(f"Source row count changed while reading {table}.")
    return seen, digest.hexdigest()


def insert_rows(database: str, table: str, columns: list[str], rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    column_sql = ", ".join(quote_identifier(column) for column in columns)
    values = []
    for row in rows:
        values.append(
            "(" + ", ".join(sql_literal(row[column]) for column in columns) + ")"
        )
    statement = (
        f"INSERT INTO {quote_identifier(table)} ({column_sql}) VALUES "
        + ", ".join(values)
    )
    if len(statement.encode("utf-8")) > MAX_INSERT_BYTES:
        raise RestoreError(f"A bounded insert for {table} exceeded the SQL size limit.")
    execute_sql(database, statement)


def transfer_table(
    source: str,
    target: str,
    table: str,
    columns: list[str],
) -> tuple[int, str]:
    count = table_count(source, table)
    digest = hashlib.sha256()
    offset = 0
    while offset < count:
        page = fetch_page(source, table, columns, offset)
        if not page:
            raise RestoreError(f"Source returned no rows while transferring {table}.")
        pending: list[dict[str, Any]] = []
        pending_bytes = 0
        for row in page:
            normalized = {column: row[column] for column in columns}
            digest_row(digest, normalized)
            encoded_size = len(json.dumps(normalized, ensure_ascii=False).encode("utf-8"))
            if pending and (
                len(pending) >= MAX_INSERT_ROWS
                or pending_bytes + encoded_size > MAX_INSERT_BYTES
            ):
                insert_rows(target, table, columns, pending)
                pending = []
                pending_bytes = 0
            pending.append(normalized)
            pending_bytes += encoded_size
        insert_rows(target, table, columns, pending)
        offset += len(page)
        if len(page) > PAGE_SIZE:
            raise RestoreError(f"Source returned an unbounded page for {table}.")
    return count, digest.hexdigest()


def owner_invariants(
    source: str,
    target: str,
    columns: dict[str, list[str]],
) -> dict[str, Any]:
    owner_tables = [
        "profiles",
        "saved_jobs",
        "applications",
        "custom_labels",
        "label_assignments",
        "active_applications",
    ]
    owner_report: dict[str, Any] = {"profile_id": PROFILE, "tables": {}}
    owner_where = f"{quote_identifier('profileId')} = {sql_literal(PROFILE)}"
    for table in owner_tables:
        source_count, source_digest = rows_digest(
            source, table, columns[table], owner_where
        )
        target_count, target_digest = rows_digest(
            target, table, columns[table], owner_where
        )
        if (source_count, source_digest) != (target_count, target_digest):
            raise RestoreError(f"Qualification owner data differs in {table}.")
        owner_report["tables"][table] = {
            "source_count": source_count,
            "target_count": target_count,
            "digest_equal": True,
        }

    checks = {
        "applications_saved": (
            "SELECT COUNT(*) AS violations FROM applications a "
            "LEFT JOIN saved_jobs s ON s.profileId = a.profileId AND s.id = a.savedJobId "
            f"WHERE a.profileId = {sql_literal(PROFILE)} AND s.id IS NULL"
        ),
        "label_assignments_saved": (
            "SELECT COUNT(*) AS violations FROM label_assignments la "
            "LEFT JOIN saved_jobs s ON s.profileId = la.profileId AND s.id = la.savedJobId "
            f"WHERE la.profileId = {sql_literal(PROFILE)} AND s.id IS NULL"
        ),
        "label_assignments_labels": (
            "SELECT COUNT(*) AS violations FROM label_assignments la "
            "LEFT JOIN custom_labels l ON l.profileId = la.profileId AND l.id = la.labelId "
            f"WHERE la.profileId = {sql_literal(PROFILE)} AND l.id IS NULL"
        ),
        "active_saved": (
            "SELECT COUNT(*) AS violations FROM active_applications aa "
            "LEFT JOIN saved_jobs s ON s.profileId = aa.profileId AND s.id = aa.savedJobId "
            f"WHERE aa.profileId = {sql_literal(PROFILE)} AND s.id IS NULL"
        ),
        "active_applications": (
            "SELECT COUNT(*) AS violations FROM active_applications aa "
            "LEFT JOIN applications a ON a.profileId = aa.profileId AND a.id = aa.applicationId "
            f"WHERE aa.profileId = {sql_literal(PROFILE)} AND a.id IS NULL"
        ),
    }
    owner_report["referential_checks"] = {}
    for name, statement in checks.items():
        source_rows = unwrap_rows(execute_json(source, statement))
        target_rows = unwrap_rows(execute_json(target, statement))
        source_violations = int(source_rows[0].get("violations", -1)) if source_rows else -1
        target_violations = int(target_rows[0].get("violations", -1)) if target_rows else -1
        if source_violations != 0 or target_violations != 0:
            raise RestoreError(f"Qualification owner invariant failed: {name}.")
        owner_report["referential_checks"][name] = {
            "source_violations": source_violations,
            "target_violations": target_violations,
        }
    return owner_report


def nav_cursor_invariant(
    source: str,
    target: str,
    columns: dict[str, list[str]],
) -> dict[str, Any]:
    where = f"{quote_identifier('platformId')} = {sql_literal(NAV_PLATFORM)}"
    source_count, source_digest = rows_digest(source, "source_state", columns["source_state"], where)
    target_count, target_digest = rows_digest(target, "source_state", columns["source_state"], where)
    if source_count == 0:
        raise RestoreError(f"Source has no NAV cursor for {NAV_PLATFORM}.")
    if (source_count, source_digest) != (target_count, target_digest):
        raise RestoreError("NAV source_state cursor differs after restore.")
    return {
        "platform_id": NAV_PLATFORM,
        "source_rows": source_count,
        "target_rows": target_count,
        "cursor_equal": True,
    }


def restore_data(
    source: str,
    target: str,
    tables: list[str],
    columns: dict[str, list[str]],
    transfer_order: list[str],
) -> dict[str, Any]:
    source_names = table_names(source)
    expected = set(tables)
    missing_source = sorted(expected - set(source_names))
    if missing_source:
        raise RestoreError(f"Source is missing canonical tables: {', '.join(missing_source)}")
    execute_schema(target)
    target_names = table_names(target)
    if target_names != tables:
        raise RestoreError("Target schema does not match the canonical generated schema.")

    for table in reversed(transfer_order):
        execute_sql(target, f"DELETE FROM {quote_identifier(table)}")

    table_report: dict[str, Any] = {}
    for table in transfer_order:
        transferred_count, transferred_digest = transfer_table(source, target, table, columns[table])
        source_count, source_digest = rows_digest(
            source, table, columns[table], expected_count=transferred_count
        )
        if (source_count, source_digest) != (transferred_count, transferred_digest):
            raise RestoreError(f"Source data changed while restoring {table}.")
        target_count, target_digest = rows_digest(
            target, table, columns[table], expected_count=source_count
        )
        if source_count != target_count or source_digest != target_digest:
            raise RestoreError(f"Restored data differs in {table}.")
        table_report[table] = {
            "source_count": source_count,
            "target_count": target_count,
            "digest_equal": True,
            "source_stable": True,
        }

    if table_names(target) != tables:
        raise RestoreError("Target table set changed during restore.")
    return {
        "tables": table_report,
        "owner_invariants": owner_invariants(source, target, columns),
        "nav_cursor": nav_cursor_invariant(source, target, columns),
    }


def shared_target_name(name: str) -> bool:
    lowered = name.lower()
    return lowered in SHARED_TARGET_NAMES or any(
        lowered.startswith(prefix) for prefix in SHARED_TARGET_PREFIXES
    )


def write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Restore every current-schema D1 table into a newly created disposable remote D1, "
            "verify bounded data and qualification invariants, then delete the target."
        ),
        epilog=(
            "Example: python3 scripts/restore-d1.py job-index-staging-typescript-db "
            "job-index-staging-restore-20260813 --confirm"
        ),
    )
    parser.add_argument("source", help="Existing remote D1 name to read")
    parser.add_argument("target", help="New disposable remote D1 name to create and delete")
    parser.add_argument(
        "--confirm",
        "--yes",
        dest="confirm",
        action="store_true",
        help="Acknowledge remote D1 creation and destructive target deletion",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_REPORT,
        help="Machine-readable report path (default: .artifacts/d1-restore/report.json)",
    )
    args = parser.parse_args()
    if not args.confirm:
        parser.error("remote target creation/deletion requires --confirm")
    if not args.source or not args.target:
        parser.error("source and target database names are required")
    return args


def main() -> int:
    args = parse_args()
    report_path = args.report if args.report.is_absolute() else ROOT / args.report
    report: dict[str, Any] = {
        "status": "failed",
        "started_at": utc_now(),
        "source_database": args.source,
        "target_database": args.target,
        "schema": "db/schema.sql",
        "expected_tables": [],
        "changed_paths": {
            "source_database": [],
            "target_database": [],
            "filesystem": [str(report_path.relative_to(ROOT)) if report_path.is_relative_to(ROOT) else str(report_path)],
        },
        "provider_limitations": PROVIDER_LIMITATIONS,
        "cleanup": {"attempted": False, "deleted": False},
    }
    target_created = False
    exit_code = 1
    try:
        if args.source.casefold() == args.target.casefold():
            raise RestoreError("Source and target database names must differ.")
        if shared_target_name(args.target):
            raise RestoreError("The target name is reserved for a shared production or stage database.")
        tables, columns, transfer_order = schema_metadata()
        report["expected_tables"] = tables
        names = list_database_names()
        if args.source not in names:
            raise RestoreError(f"Source database was not found: {args.source}")
        if args.target in names:
            raise RestoreError(f"Target database already exists: {args.target}")

        run_wrangler(["d1", "create", args.target, "--location", "weur"])
        target_created = True
        report["changed_paths"]["target_database"] = [args.target]
        report.update(restore_data(args.source, args.target, tables, columns, transfer_order))
        report["status"] = "passed"
        exit_code = 0
    except BaseException as error:
        if isinstance(error, KeyboardInterrupt):
            report["error"] = "interrupted"
            exit_code = 130
        elif isinstance(error, RestoreError):
            report["error"] = str(error)
        else:
            report["error"] = f"{type(error).__name__}: {error}"
    finally:
        if target_created:
            report["cleanup"]["attempted"] = True
            try:
                run_wrangler(["d1", "delete", args.target, "--skip-confirmation"])
                report["cleanup"]["deleted"] = True
            except RestoreError as error:
                report["cleanup"]["error"] = str(error)
                report["status"] = "failed"
                exit_code = 1
        report["completed_at"] = utc_now()
        try:
            write_report(report_path, report)
        except OSError as error:
            print(f"Could not write D1 restore report: {error}", file=sys.stderr)
            exit_code = 1

    print(json.dumps({"status": report["status"], "report": str(report_path.relative_to(ROOT)) if report_path.is_relative_to(ROOT) else str(report_path)}))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
