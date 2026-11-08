"""CRUD + run for bronze ingestion Pipelines.

Pipelines split into two families:
  - Pull (sqlite/postgresql/api/bigquery/athena): `run-now` executes a
    one-shot fetch via `run_pipeline_ingestion`.
  - Push/streaming (webhook/aws_sqs/gcp_pubsub): webhook pipelines
    receive data at `POST /api/ingest/webhook/{id}` (see routers/ingest.py);
    aws_sqs/gcp_pubsub pipelines are started/stopped here, which spawns
    or tears down a background consumer thread (see streaming.py).
"""

import json
import traceback
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

import streaming
from db import db_lock, new_id, safe_identifier
from ingestion import run_pipeline_ingestion
from schemas import PipelineCreate, PipelineOut

router = APIRouter(prefix="/api/pipelines", tags=["pipelines"])

_COLUMNS = "id, name, integration_id, source_config, target_table, status, last_run_at, last_run_status, last_error, created_at"


def _row_to_out(row) -> dict:
    return {
        "id": row[0], "name": row[1], "integration_id": row[2],
        "source_config": json.loads(row[3]), "target_table": row[4],
        "status": row[5], "last_run_at": row[6] and str(row[6]),
        "last_run_status": row[7], "last_error": row[8], "created_at": str(row[9]),
    }


@router.get("", response_model=list[PipelineOut])
def list_pipelines():
    with db_lock() as conn:
        rows = conn.execute(f"SELECT {_COLUMNS} FROM _pipelines ORDER BY created_at").fetchall()
    return [_row_to_out(r) for r in rows]


@router.post("", response_model=PipelineOut)
def create_pipeline(body: PipelineCreate):
    safe_identifier(body.target_table)
    pid = new_id()
    now = datetime.now(timezone.utc).isoformat()
    with db_lock() as conn:
        integ = conn.execute("SELECT id FROM _integrations WHERE id = ?", [body.integration_id]).fetchone()
        if not integ:
            raise HTTPException(400, "integration_id does not reference an existing integration")
        conn.execute(
            "INSERT INTO _pipelines (id, name, integration_id, source_config, target_table, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, 'draft', ?)",
            [pid, body.name, body.integration_id, json.dumps(body.source_config), body.target_table, now],
        )
        row = conn.execute(f"SELECT {_COLUMNS} FROM _pipelines WHERE id = ?", [pid]).fetchone()
    return _row_to_out(row)


@router.get("/{pipeline_id}", response_model=PipelineOut)
def get_pipeline(pipeline_id: str):
    with db_lock() as conn:
        row = conn.execute(f"SELECT {_COLUMNS} FROM _pipelines WHERE id = ?", [pipeline_id]).fetchone()
    if not row:
        raise HTTPException(404, "Pipeline not found")
    return _row_to_out(row)


@router.put("/{pipeline_id}", response_model=PipelineOut)
def update_pipeline(pipeline_id: str, body: PipelineCreate):
    safe_identifier(body.target_table)
    with db_lock() as conn:
        existing = conn.execute("SELECT id FROM _pipelines WHERE id = ?", [pipeline_id]).fetchone()
        if not existing:
            raise HTTPException(404, "Pipeline not found")
        conn.execute(
            "UPDATE _pipelines SET name = ?, integration_id = ?, source_config = ?, target_table = ? WHERE id = ?",
            [body.name, body.integration_id, json.dumps(body.source_config), body.target_table, pipeline_id],
        )
        row = conn.execute(f"SELECT {_COLUMNS} FROM _pipelines WHERE id = ?", [pipeline_id]).fetchone()
    return _row_to_out(row)


@router.delete("/{pipeline_id}")
def delete_pipeline(pipeline_id: str):
    with db_lock() as conn:
        conn.execute("DELETE FROM _pipelines WHERE id = ?", [pipeline_id])
    return {"ok": True}


@router.post("/{pipeline_id}/run", response_model=PipelineOut)
def run_pipeline(pipeline_id: str):
    now = datetime.now(timezone.utc).isoformat()

    with db_lock() as conn:
        row = conn.execute(
            "SELECT id, name, integration_id, source_config, target_table FROM _pipelines WHERE id = ?", [pipeline_id]
        ).fetchone()
        if not row:
            raise HTTPException(404, "Pipeline not found")
        integ_row = conn.execute("SELECT id, name, type, config FROM _integrations WHERE id = ?", [row[2]]).fetchone()
        if not integ_row:
            raise HTTPException(400, "Pipeline's integration no longer exists")
        integration = {"id": integ_row[0], "name": integ_row[1], "type": integ_row[2], "config": json.loads(integ_row[3])}
        source_config = json.loads(row[3])
        pipeline_name = row[1]
        target_table = row[4]

    # run_pipeline_ingestion manages its own DB lock (it does slow
    # external I/O before its DuckDB write) — must not be called while
    # already holding db_lock, since the lock isn't reentrant.
    try:
        row_count = run_pipeline_ingestion(integration, source_config, target_table)
    except Exception as e:
        with db_lock() as conn:
            conn.execute(
                "UPDATE _pipelines SET last_run_at = ?, last_run_status = 'failed', last_error = ? WHERE id = ?",
                [now, f"{type(e).__name__}: {e}", pipeline_id],
            )
        traceback.print_exc()
        raise HTTPException(400, f"Pipeline run failed: {e}")

    with db_lock() as conn:
        conn.execute(
            "UPDATE _pipelines SET status = 'active', last_run_at = ?, last_run_status = 'success', last_error = NULL WHERE id = ?",
            [now, pipeline_id],
        )
        existing_ds = conn.execute("SELECT id FROM _datasets WHERE table_name = ?", [target_table]).fetchone()
        if existing_ds:
            conn.execute("UPDATE _datasets SET row_count = ?, updated_at = ? WHERE table_name = ?", [row_count, now, target_table])
        else:
            conn.execute(
                "INSERT INTO _datasets (id, name, table_name, layer, row_count, produced_by_type, produced_by_id, updated_at) "
                "VALUES (?, ?, ?, 'bronze', ?, 'pipeline', ?, ?)",
                [new_id(), pipeline_name, target_table, row_count, pipeline_id, now],
            )
        out_row = conn.execute(f"SELECT {_COLUMNS} FROM _pipelines WHERE id = ?", [pipeline_id]).fetchone()
    return _row_to_out(out_row)


@router.post("/{pipeline_id}/start-stream", response_model=PipelineOut)
def start_stream(pipeline_id: str):
    with db_lock() as conn:
        row = conn.execute(
            "SELECT p.source_config, p.target_table, i.id, i.type, i.config "
            "FROM _pipelines p JOIN _integrations i ON i.id = p.integration_id WHERE p.id = ?",
            [pipeline_id],
        ).fetchone()
        if not row:
            raise HTTPException(404, "Pipeline not found")
        source_config_json, target_table, integ_id, itype, config_json = row
        if itype not in streaming.STREAMING_TYPES:
            raise HTTPException(400, f"'{itype}' is not a streaming integration type — use run-now instead")
        integration = {"id": integ_id, "type": itype, "config": json.loads(config_json)}
        source_config = json.loads(source_config_json)

    streaming.start_consumer(pipeline_id, integration, source_config, target_table)

    now = datetime.now(timezone.utc).isoformat()
    with db_lock() as conn:
        conn.execute(
            "UPDATE _pipelines SET status = 'active', last_run_at = ?, last_run_status = 'success', last_error = NULL WHERE id = ?",
            [now, pipeline_id],
        )
        out_row = conn.execute(f"SELECT {_COLUMNS} FROM _pipelines WHERE id = ?", [pipeline_id]).fetchone()
    return _row_to_out(out_row)


@router.post("/{pipeline_id}/stop-stream", response_model=PipelineOut)
def stop_stream(pipeline_id: str):
    with db_lock() as conn:
        row = conn.execute("SELECT id FROM _pipelines WHERE id = ?", [pipeline_id]).fetchone()
        if not row:
            raise HTTPException(404, "Pipeline not found")

    streaming.stop_consumer(pipeline_id)

    with db_lock() as conn:
        conn.execute("UPDATE _pipelines SET status = 'paused' WHERE id = ?", [pipeline_id])
        out_row = conn.execute(f"SELECT {_COLUMNS} FROM _pipelines WHERE id = ?", [pipeline_id]).fetchone()
    return _row_to_out(out_row)


@router.get("/{pipeline_id}/stream-status")
def stream_status(pipeline_id: str):
    return {"running": streaming.is_running(pipeline_id)}
