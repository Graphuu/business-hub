"""Runs a read-only SQL statement (ad-hoc query, saved query, or a
dashboard widget's bound query) through the same sql_guard used by
transforms, capped at a max row count for interactive use. Pure-DuckDB
— callers pass an already-locked `conn`.
"""

from sql_guard import SqlGuardError, validate_read_only_sql
from transform_runner import list_available_tables

MAX_ROWS = 5000


def run_query(conn, sql_text: str, max_rows: int = MAX_ROWS) -> dict:
    allowed = list_available_tables(conn)
    try:
        root = validate_read_only_sql(sql_text, allowed)
    except SqlGuardError as e:
        return {"error": str(e)}
    rendered = root.sql(dialect="duckdb")
    limited = f"SELECT * FROM ({rendered}) AS _guarded LIMIT {int(max_rows)}"
    cursor = conn.execute(limited)
    columns = [d[0] for d in cursor.description]
    rows = cursor.fetchall()
    return {"columns": columns, "rows": [list(r) for r in rows], "row_count": len(rows)}
