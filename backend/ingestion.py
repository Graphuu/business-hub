"""Bronze ingestion: pulls from a configured Integration and lands the
result as a DuckDB table.

Two write modes:
  - `run_pipeline_ingestion` — full replace (CREATE OR REPLACE TABLE),
    used by scheduled/manual pulls (sqlite, postgresql, api, bigquery,
    athena): each run represents "the current state of the source."
  - `append_rows_to_table` — append-only (CREATE TABLE if missing, else
    INSERT), used by push/streaming sources (webhook, SQS, Pub/Sub):
    each call adds to what's already there rather than replacing it.

The external pull (sqlite/postgres/HTTP/cloud SDK calls) happens
WITHOUT holding the DuckDB lock — it can take seconds and doesn't touch
our shared connection. Only the final write is wrapped in `db_lock()`.
Do not call either write-mode function from inside a `with db_lock():`
block — the lock is not reentrant and both acquire it themselves.
"""

import json
import sqlite3
import time
from typing import Any

import pyarrow as pa

from db import db_lock, safe_identifier
from http_safety import safe_request


class IngestionError(RuntimeError):
    pass


def run_pipeline_ingestion(integration: dict, source_config: dict, target_table: str) -> int:
    target_table = safe_identifier(target_table)
    itype = integration["type"]
    if itype == "sqlite":
        rows = _pull_sqlite(integration["config"], source_config)
    elif itype == "postgresql":
        rows = _pull_postgresql(integration["config"], source_config)
    elif itype == "api":
        rows = _pull_api(integration["config"], source_config)
    elif itype == "bigquery":
        rows = _pull_bigquery(integration["config"], source_config)
    elif itype == "athena":
        rows = _pull_athena(integration["config"], source_config)
    else:
        raise IngestionError(f"{itype} is a push/streaming source — use its start/stop-stream or webhook endpoint, not run-now")

    with db_lock() as conn:
        if not rows:
            conn.execute(f'CREATE OR REPLACE TABLE "{target_table}" (_empty BOOLEAN)')
            return 0
        table = pa.Table.from_pylist(rows)
        conn.register("_ingest_batch", table)
        try:
            conn.execute(f'CREATE OR REPLACE TABLE "{target_table}" AS SELECT * FROM _ingest_batch')
        finally:
            conn.unregister("_ingest_batch")
        return len(rows)


def append_rows_to_table(target_table: str, rows: list[dict]) -> int:
    """Append-mode ingest for push/streaming sources. Creates the table
    from the first batch's shape if it doesn't exist yet; later batches
    must share that shape (a mismatched batch raises rather than
    silently coercing — schema evolution is out of scope here)."""
    if not rows:
        return 0
    target_table = safe_identifier(target_table)
    table = pa.Table.from_pylist(rows)
    with db_lock() as conn:
        conn.register("_append_batch", table)
        try:
            exists = conn.execute(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = 'main' AND table_name = ?",
                [target_table],
            ).fetchone()
            if exists:
                conn.execute(f'INSERT INTO "{target_table}" SELECT * FROM _append_batch')
            else:
                conn.execute(f'CREATE TABLE "{target_table}" AS SELECT * FROM _append_batch')
        finally:
            conn.unregister("_append_batch")
    return len(rows)


def test_connection(itype: str, config: dict) -> None:
    """Raises on failure, returns None on success."""
    if itype == "sqlite":
        _pull_sqlite(config, {"query": "SELECT 1 AS ok"})
    elif itype == "postgresql":
        _pull_postgresql(config, {"query": "SELECT 1 AS ok"})
    elif itype == "api":
        _pull_api(config, {"endpoint_path": config.get("test_path", "")})
    elif itype == "bigquery":
        _pull_bigquery(config, {"query": "SELECT 1 AS ok"})
    elif itype == "athena":
        _pull_athena(config, {"query": "SELECT 1 AS ok"})
    elif itype == "webhook":
        if not config.get("secret_token"):
            raise IngestionError("Set a secret_token — an open, unauthenticated ingest endpoint is not recommended")
    elif itype == "aws_sqs":
        _check_sqs(config)
    elif itype == "gcp_pubsub":
        _check_gcp_pubsub(config)
    else:
        raise IngestionError(f"Unknown integration type: {itype}")


# ---------------------------------------------------------------- sqlite

def _pull_sqlite(config: dict, source_config: dict) -> list[dict]:
    db_path = config.get("db_path")
    query = source_config.get("query")
    if not db_path or not query:
        raise IngestionError("sqlite source requires config.db_path and source_config.query")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.execute(query)
        return [dict(row) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        raise IngestionError(f"sqlite query failed: {e}") from e
    finally:
        conn.close()


# ------------------------------------------------------------ postgresql

def _pull_postgresql(config: dict, source_config: dict) -> list[dict]:
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError as e:
        raise IngestionError("psycopg2-binary is not installed — required for postgresql sources") from e

    query = source_config.get("query")
    if not query:
        raise IngestionError("postgresql source requires source_config.query")
    try:
        conn = psycopg2.connect(
            host=config.get("host"), port=config.get("port", 5432),
            dbname=config.get("database"), user=config.get("username"),
            password=config.get("password"), connect_timeout=10,
        )
    except Exception as e:
        raise IngestionError(f"Could not connect to postgresql source: {e}") from e
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            return [dict(row) for row in cur.fetchall()]
    except Exception as e:
        raise IngestionError(f"postgresql query failed: {e}") from e
    finally:
        conn.close()


# ------------------------------------------------------------- bigquery

def _pull_bigquery(config: dict, source_config: dict) -> list[dict]:
    try:
        from google.cloud import bigquery
        from google.oauth2 import service_account
    except ImportError as e:
        raise IngestionError("google-cloud-bigquery is not installed — required for BigQuery sources") from e

    query = source_config.get("query")
    if not query:
        raise IngestionError("bigquery source requires source_config.query")

    project_id = config.get("project_id")
    credentials_json = config.get("credentials_json")
    if not project_id or not credentials_json:
        raise IngestionError("bigquery source requires config.project_id and config.credentials_json (a pasted service-account key)")

    try:
        info = json.loads(credentials_json) if isinstance(credentials_json, str) else credentials_json
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/bigquery.readonly", "https://www.googleapis.com/auth/cloud-platform.read-only"]
        )
    except Exception as e:
        raise IngestionError(f"Invalid BigQuery credentials_json: {e}") from e

    try:
        client = bigquery.Client(project=project_id, credentials=credentials, location=config.get("location") or None)
        result = client.query(query).result(timeout=config.get("timeout_seconds", 120))
        return [dict(row.items()) for row in result]
    except Exception as e:
        raise IngestionError(f"BigQuery query failed: {e}") from e


# --------------------------------------------------------------- athena

def _pull_athena(config: dict, source_config: dict) -> list[dict]:
    try:
        import boto3
    except ImportError as e:
        raise IngestionError("boto3 is not installed — required for Athena sources") from e

    query = source_config.get("query")
    if not query:
        raise IngestionError("athena source requires source_config.query")
    s3_staging_dir = config.get("s3_staging_dir")
    if not s3_staging_dir:
        raise IngestionError("athena source requires config.s3_staging_dir (an s3:// query-results location)")

    client = boto3.client(
        "athena",
        aws_access_key_id=config.get("aws_access_key_id") or None,
        aws_secret_access_key=config.get("aws_secret_access_key") or None,
        region_name=config.get("region"),
    )
    try:
        exec_kwargs = {
            "QueryString": query,
            "ResultConfiguration": {"OutputLocation": s3_staging_dir},
            "WorkGroup": config.get("workgroup") or "primary",
        }
        if config.get("database"):
            exec_kwargs["QueryExecutionContext"] = {"Database": config["database"]}
        query_id = client.start_query_execution(**exec_kwargs)["QueryExecutionId"]

        timeout_seconds = config.get("timeout_seconds", 120)
        deadline = time.time() + timeout_seconds
        status = {}
        state = "RUNNING"
        while time.time() < deadline:
            status = client.get_query_execution(QueryExecutionId=query_id)["QueryExecution"]["Status"]
            state = status["State"]
            if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
                break
            time.sleep(1.5)

        if state != "SUCCEEDED":
            reason = status.get("StateChangeReason", f"did not finish within {timeout_seconds}s")
            raise IngestionError(f"Athena query did not succeed (state={state}): {reason}")

        # Athena's synchronous results API returns every value as text
        # (VarCharValue) regardless of source type — cast downstream in
        # a silver transform if you need real numeric/date types.
        rows: list[dict] = []
        columns: list[str] | None = None
        for page in client.get_paginator("get_query_results").paginate(QueryExecutionId=query_id):
            for row in page["ResultSet"]["Rows"]:
                values = [c.get("VarCharValue") for c in row["Data"]]
                if columns is None:
                    columns = values
                    continue
                rows.append(dict(zip(columns, values)))
        return rows
    except IngestionError:
        raise
    except Exception as e:
        raise IngestionError(f"Athena query failed: {e}") from e


# ------------------------------------------------------------------ api

def _resolve_api_auth(config: dict) -> tuple[dict, dict, Any]:
    """Returns (extra_headers, extra_params, httpx_auth_or_None) for the
    integration's configured auth_type."""
    import httpx

    headers = dict(config.get("default_headers") or {})
    params = dict(config.get("default_query_params") or {})
    auth_type = config.get("auth_type", "none")

    if auth_type == "bearer":
        token = config.get("bearer_token")
        if token:
            headers["Authorization"] = f"Bearer {token}"
    elif auth_type == "basic":
        return headers, params, httpx.BasicAuth(config.get("basic_username", ""), config.get("basic_password", ""))
    elif auth_type == "api_key":
        name = config.get("api_key_name") or "X-API-Key"
        value = config.get("api_key_value", "")
        if config.get("api_key_location") == "query":
            params[name] = value
        else:
            headers[name] = value
    elif auth_type == "oauth2_client_credentials":
        headers["Authorization"] = f"Bearer {_fetch_oauth2_token(config)}"
    return headers, params, None


def _fetch_oauth2_token(config: dict) -> str:
    token_url = config.get("oauth2_token_url")
    if not token_url:
        raise IngestionError("oauth2_client_credentials auth requires oauth2_token_url")
    data = {
        "grant_type": "client_credentials",
        "client_id": config.get("oauth2_client_id", ""),
        "client_secret": config.get("oauth2_client_secret", ""),
    }
    if config.get("oauth2_scope"):
        data["scope"] = config["oauth2_scope"]
    try:
        resp = safe_request("POST", token_url, data=data, timeout=config.get("timeout_seconds", 15), verify=config.get("verify_tls", True))
    except Exception as e:
        raise IngestionError(f"OAuth2 token request failed: {e}") from e
    if resp.status_code >= 400:
        raise IngestionError(f"OAuth2 token request failed: {resp.status_code} {resp.text[:200]}")
    token = resp.json().get("access_token")
    if not token:
        raise IngestionError("OAuth2 token response did not include an access_token field")
    return token


def _pull_api(config: dict, source_config: dict) -> list[dict]:
    base_url = (config.get("base_url") or "").rstrip("/")
    endpoint_path = source_config.get("endpoint_path", "")
    if not base_url:
        raise IngestionError("api source requires config.base_url")
    url = f"{base_url}{endpoint_path}"

    auth_headers, auth_params, httpx_auth = _resolve_api_auth(config)
    method = (source_config.get("method") or "GET").upper()
    request_body = source_config.get("request_body")
    timeout = config.get("timeout_seconds", 15)
    verify_tls = config.get("verify_tls", True)

    root_path = source_config.get("root_path", "")
    field_mapping = source_config.get("field_mapping") or []
    pagination = source_config.get("pagination") or {"mode": "none"}

    all_records: list[Any] = []
    page = 1
    cursor_value = None
    max_pages = 50

    for _ in range(max_pages):
        params = {**auth_params, **(source_config.get("query_params") or {})}
        mode = pagination.get("mode", "none")
        if mode == "page_param":
            params[pagination.get("param_name", "page")] = page
        elif mode == "cursor_param" and cursor_value:
            params[pagination.get("param_name", "cursor")] = cursor_value

        request_kwargs = {"headers": auth_headers, "params": params, "timeout": timeout, "verify": verify_tls}
        if httpx_auth is not None:
            request_kwargs["auth"] = httpx_auth
        if method == "POST" and request_body is not None:
            request_kwargs["json"] = request_body

        try:
            resp = safe_request(method, url, **request_kwargs)
        except Exception as e:
            raise IngestionError(f"API request failed: {e}") from e
        if resp.status_code >= 400:
            raise IngestionError(f"API request failed: {resp.status_code} {resp.text[:200]}")
        payload = resp.json()
        batch = _extract_path(payload, root_path)
        if not isinstance(batch, list):
            batch = [batch] if batch is not None else []
        if not batch:
            break
        all_records.extend(batch)

        if mode == "page_param":
            page += 1
            if len(batch) < pagination.get("page_size_hint", len(batch) or 1):
                break
        elif mode == "cursor_param":
            cursor_value = _extract_path(payload, pagination.get("cursor_path", ""))
            if not cursor_value:
                break
        else:
            break

    return [_map_record(rec, field_mapping) for rec in all_records]


def _extract_path(payload: Any, dotted_path: str) -> Any:
    if not dotted_path:
        return payload
    current = payload
    for part in dotted_path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def map_record(record: dict, field_mapping: list[dict]) -> dict:
    """Public alias of _map_record — used by webhook/streaming consumers
    that map incoming push payloads the same way pull sources do."""
    return _map_record(record, field_mapping)


def _map_record(record: dict, field_mapping: list[dict]) -> dict:
    if not field_mapping:
        return {k: _coerce(v) for k, v in record.items()}
    out = {}
    for mapping in field_mapping:
        value = _extract_path(record, mapping["source"])
        out[mapping["target"]] = _coerce(value)
    return out


def _coerce(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return value


# ------------------------------------------------------- connection checks

def _check_sqs(config: dict) -> None:
    try:
        import boto3
    except ImportError as e:
        raise IngestionError("boto3 is not installed — required for AWS SQS sources") from e
    queue_url = config.get("queue_url")
    if not queue_url:
        raise IngestionError("aws_sqs source requires config.queue_url")
    try:
        client = boto3.client(
            "sqs",
            aws_access_key_id=config.get("aws_access_key_id") or None,
            aws_secret_access_key=config.get("aws_secret_access_key") or None,
            region_name=config.get("region"),
        )
        client.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])
    except Exception as e:
        raise IngestionError(f"Could not reach SQS queue: {e}") from e


def _check_gcp_pubsub(config: dict) -> None:
    try:
        from google.cloud import pubsub_v1
        from google.oauth2 import service_account
    except ImportError as e:
        raise IngestionError("google-cloud-pubsub is not installed — required for GCP Pub/Sub sources") from e
    project_id = config.get("project_id")
    subscription_id = config.get("subscription_id")
    credentials_json = config.get("credentials_json")
    if not project_id or not subscription_id or not credentials_json:
        raise IngestionError("gcp_pubsub source requires config.project_id, subscription_id, and credentials_json")
    try:
        info = json.loads(credentials_json) if isinstance(credentials_json, str) else credentials_json
        credentials = service_account.Credentials.from_service_account_info(info)
        client = pubsub_v1.SubscriberClient(credentials=credentials)
        path = client.subscription_path(project_id, subscription_id)
        client.get_subscription(subscription=path)
        client.close()
    except Exception as e:
        raise IngestionError(f"Could not reach Pub/Sub subscription: {e}") from e
