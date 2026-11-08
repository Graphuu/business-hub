"""Single-file DuckDB storage for Business Hub — standalone, no Postgres/
Redis/MinIO/Celery. DuckDB is both the catalog store (pipelines,
transforms, dashboards, widgets — plain tables prefixed `_`) and the
data warehouse itself (bronze/silver/gold land as native DuckDB tables,
no Delta Lake/object storage layer needed at this scale).

One process-wide connection, guarded by a lock — this is a single-user
local tool, not a multi-tenant service, so the simplicity of "one
connection, serialize access" beats a pool. FastAPI's sync `def`
endpoints already run in a thread pool, so without the lock, concurrent
requests could hand the same DuckDB connection object to two threads at
once.
"""

import os
import re
import threading
import uuid
from pathlib import Path

import duckdb

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = os.environ.get("BUSINESS_HUB_DB_PATH", str(_DATA_DIR / "business_hub.duckdb"))

_lock = threading.Lock()
_conn: "duckdb.DuckDBPyConnection | None" = None

_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def new_id() -> str:
    return uuid.uuid4().hex


def safe_identifier(name: str) -> str:
    """Guards every table name spliced directly into DDL/SQL f-strings
    (target_table on a pipeline/transform, dataset table_name) against
    anything but a plain identifier — cheap insurance even in a
    single-user local tool."""
    if not _IDENTIFIER_RE.match(name or ""):
        raise ValueError(f"Invalid identifier: {name!r} (letters, digits, underscore; must not start with a digit)")
    return name


def get_conn() -> duckdb.DuckDBPyConnection:
    global _conn
    if _conn is None:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        _conn = duckdb.connect(DB_PATH)
        _init_schema(_conn)
    return _conn


class db_lock:
    """Context manager serializing all DuckDB access across FastAPI's
    threadpool. Usage: `with db_lock(): conn = get_conn(); ...`"""

    def __enter__(self):
        _lock.acquire()
        return get_conn()

    def __exit__(self, *exc):
        _lock.release()
        return False


def _init_schema(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _integrations (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            type VARCHAR NOT NULL,
            config VARCHAR NOT NULL,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _pipelines (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            integration_id VARCHAR NOT NULL,
            source_config VARCHAR NOT NULL,
            target_table VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'draft',
            last_run_at TIMESTAMP,
            last_run_status VARCHAR,
            last_error VARCHAR,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _transforms (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            sql_text VARCHAR NOT NULL,
            target_layer VARCHAR NOT NULL,
            target_table VARCHAR NOT NULL,
            source_tables VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'draft',
            last_run_at TIMESTAMP,
            last_run_status VARCHAR,
            last_error VARCHAR,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _datasets (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            table_name VARCHAR NOT NULL UNIQUE,
            layer VARCHAR NOT NULL,
            row_count BIGINT,
            produced_by_type VARCHAR,
            produced_by_id VARCHAR,
            updated_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _saved_queries (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            sql_text VARCHAR NOT NULL,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _dashboards (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            description VARCHAR,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _settings (
            key VARCHAR PRIMARY KEY,
            value VARCHAR NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _widgets (
            id VARCHAR PRIMARY KEY,
            dashboard_id VARCHAR NOT NULL,
            title VARCHAR NOT NULL,
            widget_type VARCHAR NOT NULL,
            saved_query_id VARCHAR NOT NULL,
            spec VARCHAR NOT NULL,
            layout VARCHAR NOT NULL,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
