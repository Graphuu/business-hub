"""Read-only SQL AST validation for every user-supplied SELECT (ad-hoc
queries, saved queries, transform definitions). A runtime "read-only
connection" flag is not enough on its own — DuckDB's filesystem/network
table functions (read_csv, read_parquet, httpfs) aren't governed by
that flag — so the parsed AST itself is inspected before anything runs.
"""

import sqlglot
from sqlglot import exp

BLOCKED_EXPRESSIONS = (
    exp.Insert, exp.Update, exp.Delete, exp.Create, exp.Drop, exp.Alter,
    exp.Copy, exp.Attach, exp.Pragma, exp.Set, exp.Command,
)

BLOCKED_FUNCTIONS = {
    "read_csv", "read_csv_auto", "read_parquet", "read_json", "read_json_auto",
    "read_ndjson", "read_ndjson_auto", "glob", "httpfs", "read_text", "read_blob",
}


class SqlGuardError(ValueError):
    pass


def validate_read_only_sql(sql: str, allowed_tables: set[str]) -> exp.Expression:
    """Raises SqlGuardError unless `sql` is exactly one read-only SELECT
    (or UNION of selects) touching only `allowed_tables`. Returns the
    parsed expression so callers can re-render normalized SQL without
    re-parsing the caller's raw text."""
    if not sql or not sql.strip():
        raise SqlGuardError("SQL text is empty.")

    try:
        statements = [s for s in sqlglot.parse(sql, read="duckdb") if s is not None]
    except Exception as e:
        raise SqlGuardError(f"Could not parse SQL: {e}") from e

    if len(statements) != 1:
        raise SqlGuardError("Exactly one SQL statement is allowed.")
    root = statements[0]

    if not isinstance(root, (exp.Select, exp.Union)):
        raise SqlGuardError("Only SELECT statements are allowed.")

    blocked = root.find(*BLOCKED_EXPRESSIONS)
    if blocked is not None:
        raise SqlGuardError(f"Statement type not allowed: {type(blocked).__name__}")

    for func in root.find_all(exp.Func):
        fname = (func.sql_name() or func.name or "").lower()
        if fname in BLOCKED_FUNCTIONS:
            raise SqlGuardError(f"Function not allowed: {fname}")

    allowed_lower = {t.lower() for t in allowed_tables}
    for table in root.find_all(exp.Table):
        table_name = table.name.lower()
        if table_name not in allowed_lower:
            raise SqlGuardError(f"Table not allowed or does not exist: {table_name}")

    return root
