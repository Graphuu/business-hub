"""Executes a validated SELECT (silver/gold transform definition)
against current DuckDB tables and materializes the result as a new
table. Pure-DuckDB, no external I/O — every function here takes an
already-locked `conn` (see db.db_lock) rather than acquiring the lock
itself, so callers control the lock's scope.
"""

from db import safe_identifier
from sql_guard import SqlGuardError, validate_read_only_sql


def list_available_tables(conn) -> set[str]:
    """Catalog tables (prefixed `_`) are deliberately excluded — a
    transform/query must never be able to read Integration credentials
    or other catalog internals."""
    rows = conn.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'main' AND NOT starts_with(table_name, '_')
    """).fetchall()
    return {r[0] for r in rows}


def run_transform(conn, sql_text: str, target_table: str) -> int:
    target_table = safe_identifier(target_table)
    allowed = list_available_tables(conn)
    root = validate_read_only_sql(sql_text, allowed)
    rendered = root.sql(dialect="duckdb")

    conn.execute(f'CREATE OR REPLACE TABLE "{target_table}" AS {rendered}')
    count_row = conn.execute(f'SELECT COUNT(*) FROM "{target_table}"').fetchone()
    return count_row[0] if count_row else 0


def preview_transform(conn, sql_text: str, max_rows: int = 100) -> dict:
    allowed = list_available_tables(conn)
    try:
        root = validate_read_only_sql(sql_text, allowed)
    except SqlGuardError as e:
        return {"error": str(e)}
    rendered = root.sql(dialect="duckdb")
    limited = f"SELECT * FROM ({rendered}) AS _preview LIMIT {int(max_rows)}"
    cursor = conn.execute(limited)
    columns = [d[0] for d in cursor.description]
    rows = cursor.fetchall()
    return {"columns": columns, "rows": [list(r) for r in rows], "row_count": len(rows)}
