"""Dataset catalog — browse bronze/silver/gold tables with schema +
row preview."""

from fastapi import APIRouter, HTTPException

from db import db_lock
from schemas import DatasetOut, QueryResult

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

_COLUMNS = "id, name, table_name, layer, row_count, produced_by_type, produced_by_id, updated_at"


def _row_to_out(row) -> dict:
    return {
        "id": row[0], "name": row[1], "table_name": row[2], "layer": row[3],
        "row_count": row[4], "produced_by_type": row[5], "produced_by_id": row[6],
        "updated_at": str(row[7]),
    }


@router.get("", response_model=list[DatasetOut])
def list_datasets():
    with db_lock() as conn:
        rows = conn.execute(f"SELECT {_COLUMNS} FROM _datasets ORDER BY layer, name").fetchall()
    return [_row_to_out(r) for r in rows]


@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(dataset_id: str):
    with db_lock() as conn:
        row = conn.execute(f"SELECT {_COLUMNS} FROM _datasets WHERE id = ?", [dataset_id]).fetchone()
    if not row:
        raise HTTPException(404, "Dataset not found")
    return _row_to_out(row)


@router.get("/{dataset_id}/schema")
def get_dataset_schema(dataset_id: str):
    with db_lock() as conn:
        row = conn.execute("SELECT table_name FROM _datasets WHERE id = ?", [dataset_id]).fetchone()
        if not row:
            raise HTTPException(404, "Dataset not found")
        cols = conn.execute(
            "SELECT column_name, data_type, is_nullable FROM information_schema.columns "
            "WHERE table_schema = 'main' AND table_name = ? ORDER BY ordinal_position",
            [row[0]],
        ).fetchall()
    return {"columns": [{"name": c[0], "type": c[1], "nullable": c[2] == "YES"} for c in cols]}


@router.get("/{dataset_id}/preview", response_model=QueryResult)
def preview_dataset(dataset_id: str, limit: int = 100):
    with db_lock() as conn:
        row = conn.execute("SELECT table_name FROM _datasets WHERE id = ?", [dataset_id]).fetchone()
        if not row:
            raise HTTPException(404, "Dataset not found")
        cursor = conn.execute(f'SELECT * FROM "{row[0]}" LIMIT ?', [min(int(limit), 1000)])
        columns = [d[0] for d in cursor.description]
        rows = cursor.fetchall()
    return {"columns": columns, "rows": [list(r) for r in rows], "row_count": len(rows)}


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str):
    with db_lock() as conn:
        row = conn.execute("SELECT table_name FROM _datasets WHERE id = ?", [dataset_id]).fetchone()
        if not row:
            raise HTTPException(404, "Dataset not found")
        conn.execute(f'DROP TABLE IF EXISTS "{row[0]}"')
        conn.execute("DELETE FROM _datasets WHERE id = ?", [dataset_id])
    return {"ok": True}
