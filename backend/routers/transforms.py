"""CRUD + run for silver/gold Transforms (validated SQL producing a new
DuckDB table from existing ones)."""

import traceback
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from db import db_lock, new_id, safe_identifier
from schemas import QueryRequest, QueryResult, TransformCreate, TransformOut
from transform_runner import preview_transform, run_transform

router = APIRouter(prefix="/api/transforms", tags=["transforms"])

_COLUMNS = "id, name, sql_text, target_layer, target_table, status, last_run_at, last_run_status, last_error, created_at"


def _row_to_out(row) -> dict:
    return {
        "id": row[0], "name": row[1], "sql_text": row[2], "target_layer": row[3],
        "target_table": row[4], "status": row[5], "last_run_at": row[6] and str(row[6]),
        "last_run_status": row[7], "last_error": row[8], "created_at": str(row[9]),
    }


@router.get("", response_model=list[TransformOut])
def list_transforms():
    with db_lock() as conn:
        rows = conn.execute(f"SELECT {_COLUMNS} FROM _transforms ORDER BY created_at").fetchall()
    return [_row_to_out(r) for r in rows]


@router.post("/preview", response_model=QueryResult)
def preview(body: QueryRequest):
    with db_lock() as conn:
        result = preview_transform(conn, body.sql)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@router.post("", response_model=TransformOut)
def create_transform(body: TransformCreate):
    if body.target_layer not in ("silver", "gold"):
        raise HTTPException(400, "target_layer must be 'silver' or 'gold'")
    safe_identifier(body.target_table)
    tid = new_id()
    now = datetime.now(timezone.utc).isoformat()
    with db_lock() as conn:
        conn.execute(
            "INSERT INTO _transforms (id, name, sql_text, target_layer, target_table, source_tables, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, '[]', 'draft', ?)",
            [tid, body.name, body.sql_text, body.target_layer, body.target_table, now],
        )
        row = conn.execute(f"SELECT {_COLUMNS} FROM _transforms WHERE id = ?", [tid]).fetchone()
    return _row_to_out(row)


@router.get("/{transform_id}", response_model=TransformOut)
def get_transform(transform_id: str):
    with db_lock() as conn:
        row = conn.execute(f"SELECT {_COLUMNS} FROM _transforms WHERE id = ?", [transform_id]).fetchone()
    if not row:
        raise HTTPException(404, "Transform not found")
    return _row_to_out(row)


@router.put("/{transform_id}", response_model=TransformOut)
def update_transform(transform_id: str, body: TransformCreate):
    safe_identifier(body.target_table)
    with db_lock() as conn:
        existing = conn.execute("SELECT id FROM _transforms WHERE id = ?", [transform_id]).fetchone()
        if not existing:
            raise HTTPException(404, "Transform not found")
        conn.execute(
            "UPDATE _transforms SET name = ?, sql_text = ?, target_layer = ?, target_table = ? WHERE id = ?",
            [body.name, body.sql_text, body.target_layer, body.target_table, transform_id],
        )
        row = conn.execute(f"SELECT {_COLUMNS} FROM _transforms WHERE id = ?", [transform_id]).fetchone()
    return _row_to_out(row)


@router.delete("/{transform_id}")
def delete_transform(transform_id: str):
    with db_lock() as conn:
        conn.execute("DELETE FROM _transforms WHERE id = ?", [transform_id])
    return {"ok": True}


@router.post("/{transform_id}/run", response_model=TransformOut)
def run(transform_id: str):
    now = datetime.now(timezone.utc).isoformat()
    with db_lock() as conn:
        row = conn.execute(
            "SELECT id, name, sql_text, target_layer, target_table FROM _transforms WHERE id = ?", [transform_id]
        ).fetchone()
        if not row:
            raise HTTPException(404, "Transform not found")
        _, name, sql_text, target_layer, target_table = row
        try:
            row_count = run_transform(conn, sql_text, target_table)
            conn.execute(
                "UPDATE _transforms SET status = 'active', last_run_at = ?, last_run_status = 'success', last_error = NULL WHERE id = ?",
                [now, transform_id],
            )
            existing_ds = conn.execute("SELECT id FROM _datasets WHERE table_name = ?", [target_table]).fetchone()
            if existing_ds:
                conn.execute("UPDATE _datasets SET row_count = ?, updated_at = ? WHERE table_name = ?", [row_count, now, target_table])
            else:
                conn.execute(
                    "INSERT INTO _datasets (id, name, table_name, layer, row_count, produced_by_type, produced_by_id, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, 'transform', ?, ?)",
                    [new_id(), name, target_table, target_layer, row_count, transform_id, now],
                )
        except Exception as e:
            conn.execute(
                "UPDATE _transforms SET last_run_at = ?, last_run_status = 'failed', last_error = ? WHERE id = ?",
                [now, f"{type(e).__name__}: {e}", transform_id],
            )
            traceback.print_exc()
            raise HTTPException(400, f"Transform run failed: {e}")
        out_row = conn.execute(f"SELECT {_COLUMNS} FROM _transforms WHERE id = ?", [transform_id]).fetchone()
    return _row_to_out(out_row)
