"""CRUD for data source Integrations plus a connection test endpoint.

Pull sources: sqlite, postgresql, api, bigquery, athena.
Push/streaming sources: webhook, aws_sqs, gcp_pubsub (see routers/ingest.py
and streaming.py for how data actually arrives for these)."""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from db import db_lock, new_id
from ingestion import IngestionError, test_connection
from schemas import IntegrationCreate, IntegrationOut

router = APIRouter(prefix="/api/integrations", tags=["integrations"])

_COLUMNS = "id, name, type, config, created_at"

VALID_TYPES = ("sqlite", "postgresql", "api", "bigquery", "athena", "webhook", "aws_sqs", "gcp_pubsub")


def _row_to_out(row) -> dict:
    return {
        "id": row[0], "name": row[1], "type": row[2],
        "config": json.loads(row[3]), "created_at": str(row[4]),
    }


@router.get("", response_model=list[IntegrationOut])
def list_integrations():
    with db_lock() as conn:
        rows = conn.execute(f"SELECT {_COLUMNS} FROM _integrations ORDER BY created_at").fetchall()
    return [_row_to_out(r) for r in rows]


@router.post("", response_model=IntegrationOut)
def create_integration(body: IntegrationCreate):
    if body.type not in VALID_TYPES:
        raise HTTPException(400, f"type must be one of: {', '.join(VALID_TYPES)}")
    iid = new_id()
    now = datetime.now(timezone.utc).isoformat()
    with db_lock() as conn:
        conn.execute(
            "INSERT INTO _integrations (id, name, type, config, created_at) VALUES (?, ?, ?, ?, ?)",
            [iid, body.name, body.type, json.dumps(body.config), now],
        )
        row = conn.execute(f"SELECT {_COLUMNS} FROM _integrations WHERE id = ?", [iid]).fetchone()
    return _row_to_out(row)


@router.get("/{integration_id}", response_model=IntegrationOut)
def get_integration(integration_id: str):
    with db_lock() as conn:
        row = conn.execute(f"SELECT {_COLUMNS} FROM _integrations WHERE id = ?", [integration_id]).fetchone()
    if not row:
        raise HTTPException(404, "Integration not found")
    return _row_to_out(row)


@router.put("/{integration_id}", response_model=IntegrationOut)
def update_integration(integration_id: str, body: IntegrationCreate):
    with db_lock() as conn:
        existing = conn.execute("SELECT id FROM _integrations WHERE id = ?", [integration_id]).fetchone()
        if not existing:
            raise HTTPException(404, "Integration not found")
        conn.execute(
            "UPDATE _integrations SET name = ?, type = ?, config = ? WHERE id = ?",
            [body.name, body.type, json.dumps(body.config), integration_id],
        )
        row = conn.execute(f"SELECT {_COLUMNS} FROM _integrations WHERE id = ?", [integration_id]).fetchone()
    return _row_to_out(row)


@router.delete("/{integration_id}")
def delete_integration(integration_id: str):
    with db_lock() as conn:
        in_use = conn.execute("SELECT COUNT(*) FROM _pipelines WHERE integration_id = ?", [integration_id]).fetchone()[0]
        if in_use:
            raise HTTPException(409, "Integration is used by an ingestion pipeline — delete the pipeline first")
        conn.execute("DELETE FROM _integrations WHERE id = ?", [integration_id])
    return {"ok": True}


@router.post("/test-config")
def test_integration_config(body: IntegrationCreate):
    try:
        test_connection(body.type, body.config)
        return {"status": "ok", "message": "Connection succeeded"}
    except IngestionError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": f"{type(e).__name__}: {e}"}


@router.post("/{integration_id}/test")
def test_integration(integration_id: str):
    with db_lock() as conn:
        row = conn.execute("SELECT type, config FROM _integrations WHERE id = ?", [integration_id]).fetchone()
    if not row:
        raise HTTPException(404, "Integration not found")
    itype, config_json = row[0], json.loads(row[1])
    try:
        test_connection(itype, config_json)
        return {"status": "ok", "message": "Connection succeeded"}
    except IngestionError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": f"{type(e).__name__}: {e}"}
