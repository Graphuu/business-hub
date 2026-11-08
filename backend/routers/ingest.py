"""Public-facing ingestion endpoint for the webhook push source —
external systems POST here directly rather than us pulling from them.
Validated by a per-integration shared secret instead of the rest of
this app's (nonexistent) auth, since this is the one endpoint the
outside world calls into."""

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request

from db import db_lock, new_id, safe_identifier
from ingestion import append_rows_to_table, map_record

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


@router.post("/webhook/{pipeline_id}")
async def ingest_webhook(pipeline_id: str, request: Request, x_webhook_secret: Optional[str] = Header(default=None)):
    with db_lock() as conn:
        row = conn.execute(
            "SELECT p.name, p.source_config, p.target_table, i.type, i.config "
            "FROM _pipelines p JOIN _integrations i ON i.id = p.integration_id WHERE p.id = ?",
            [pipeline_id],
        ).fetchone()
    if not row:
        raise HTTPException(404, "Pipeline not found")
    pipeline_name, source_config_json, target_table, itype, config_json = row
    if itype != "webhook":
        raise HTTPException(400, "This pipeline is not backed by a webhook integration")

    config = json.loads(config_json)
    expected_secret = config.get("secret_token")
    if expected_secret and x_webhook_secret != expected_secret:
        raise HTTPException(401, "Invalid or missing X-Webhook-Secret header")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Request body must be JSON")
    records = body if isinstance(body, list) else [body]

    source_config = json.loads(source_config_json)
    field_mapping = source_config.get("field_mapping") or []
    mapped = [map_record(r, field_mapping) for r in records]

    try:
        count = append_rows_to_table(target_table, mapped)
    except Exception as e:
        raise HTTPException(400, f"Ingest failed: {e}")

    now = datetime.now(timezone.utc).isoformat()
    with db_lock() as conn:
        conn.execute(
            "UPDATE _pipelines SET status = 'active', last_run_at = ?, last_run_status = 'success', last_error = NULL WHERE id = ?",
            [now, pipeline_id],
        )
        total = conn.execute(f'SELECT COUNT(*) FROM "{safe_identifier(target_table)}"').fetchone()[0]
        ds_row = conn.execute("SELECT id FROM _datasets WHERE table_name = ?", [target_table]).fetchone()
        if ds_row:
            conn.execute("UPDATE _datasets SET row_count = ?, updated_at = ? WHERE table_name = ?", [total, now, target_table])
        else:
            conn.execute(
                "INSERT INTO _datasets (id, name, table_name, layer, row_count, produced_by_type, produced_by_id, updated_at) "
                "VALUES (?, ?, ?, 'bronze', ?, 'pipeline', ?, ?)",
                [new_id(), pipeline_name, target_table, total, pipeline_id, now],
            )

    return {"ok": True, "rows_ingested": count, "total_rows": total}
