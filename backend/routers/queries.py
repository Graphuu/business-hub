"""Ad-hoc SQL execution + saved queries (reusable named queries that
dashboard widgets bind to)."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from db import db_lock, new_id
from query_runner import run_query
from schemas import QueryRequest, QueryResult, SavedQueryCreate, SavedQueryOut

router = APIRouter(prefix="/api", tags=["queries"])


@router.post("/query", response_model=QueryResult)
def execute_query(body: QueryRequest):
    with db_lock() as conn:
        result = run_query(conn, body.sql)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


def _sq_row_to_out(row) -> dict:
    return {"id": row[0], "name": row[1], "sql_text": row[2], "created_at": str(row[3])}


@router.get("/saved-queries", response_model=list[SavedQueryOut])
def list_saved_queries():
    with db_lock() as conn:
        rows = conn.execute("SELECT id, name, sql_text, created_at FROM _saved_queries ORDER BY created_at").fetchall()
    return [_sq_row_to_out(r) for r in rows]


@router.post("/saved-queries", response_model=SavedQueryOut)
def create_saved_query(body: SavedQueryCreate):
    qid = new_id()
    now = datetime.now(timezone.utc).isoformat()
    with db_lock() as conn:
        conn.execute(
            "INSERT INTO _saved_queries (id, name, sql_text, created_at) VALUES (?, ?, ?, ?)",
            [qid, body.name, body.sql_text, now],
        )
        row = conn.execute("SELECT id, name, sql_text, created_at FROM _saved_queries WHERE id = ?", [qid]).fetchone()
    return _sq_row_to_out(row)


@router.get("/saved-queries/{query_id}", response_model=SavedQueryOut)
def get_saved_query(query_id: str):
    with db_lock() as conn:
        row = conn.execute("SELECT id, name, sql_text, created_at FROM _saved_queries WHERE id = ?", [query_id]).fetchone()
    if not row:
        raise HTTPException(404, "Saved query not found")
    return _sq_row_to_out(row)


@router.put("/saved-queries/{query_id}", response_model=SavedQueryOut)
def update_saved_query(query_id: str, body: SavedQueryCreate):
    with db_lock() as conn:
        existing = conn.execute("SELECT id FROM _saved_queries WHERE id = ?", [query_id]).fetchone()
        if not existing:
            raise HTTPException(404, "Saved query not found")
        conn.execute("UPDATE _saved_queries SET name = ?, sql_text = ? WHERE id = ?", [body.name, body.sql_text, query_id])
        row = conn.execute("SELECT id, name, sql_text, created_at FROM _saved_queries WHERE id = ?", [query_id]).fetchone()
    return _sq_row_to_out(row)


@router.delete("/saved-queries/{query_id}")
def delete_saved_query(query_id: str):
    with db_lock() as conn:
        in_use = conn.execute("SELECT COUNT(*) FROM _widgets WHERE saved_query_id = ?", [query_id]).fetchone()[0]
        if in_use:
            raise HTTPException(409, "Saved query is used by a dashboard widget — remove the widget first")
        conn.execute("DELETE FROM _saved_queries WHERE id = ?", [query_id])
    return {"ok": True}


@router.post("/saved-queries/{query_id}/run", response_model=QueryResult)
def run_saved_query(query_id: str):
    with db_lock() as conn:
        row = conn.execute("SELECT sql_text FROM _saved_queries WHERE id = ?", [query_id]).fetchone()
        if not row:
            raise HTTPException(404, "Saved query not found")
        result = run_query(conn, row[0])
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result
