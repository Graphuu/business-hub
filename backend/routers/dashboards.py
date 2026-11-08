"""Dashboards + widgets. GET /{id}/data runs every widget's bound query
in a single call — the dashboard viewer fetches all chart data in one
round trip instead of one request per widget."""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from db import db_lock, new_id
from query_runner import run_query
from schemas import DashboardCreate, DashboardOut, LayoutUpdateRequest, WidgetCreate, WidgetOut

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])

_W_COLUMNS = "id, dashboard_id, title, widget_type, saved_query_id, spec, layout, created_at"


def _db_row_to_out(row) -> dict:
    return {"id": row[0], "name": row[1], "description": row[2], "created_at": str(row[3])}


def _widget_row_to_out(row) -> dict:
    return {
        "id": row[0], "dashboard_id": row[1], "title": row[2], "widget_type": row[3],
        "saved_query_id": row[4], "spec": json.loads(row[5]), "layout": json.loads(row[6]),
        "created_at": str(row[7]),
    }


@router.get("", response_model=list[DashboardOut])
def list_dashboards():
    with db_lock() as conn:
        rows = conn.execute("SELECT id, name, description, created_at FROM _dashboards ORDER BY created_at").fetchall()
    return [_db_row_to_out(r) for r in rows]


@router.post("", response_model=DashboardOut)
def create_dashboard(body: DashboardCreate):
    did = new_id()
    now = datetime.now(timezone.utc).isoformat()
    with db_lock() as conn:
        conn.execute(
            "INSERT INTO _dashboards (id, name, description, created_at) VALUES (?, ?, ?, ?)",
            [did, body.name, body.description, now],
        )
        row = conn.execute("SELECT id, name, description, created_at FROM _dashboards WHERE id = ?", [did]).fetchone()
    return _db_row_to_out(row)


@router.get("/{dashboard_id}", response_model=DashboardOut)
def get_dashboard(dashboard_id: str):
    with db_lock() as conn:
        row = conn.execute("SELECT id, name, description, created_at FROM _dashboards WHERE id = ?", [dashboard_id]).fetchone()
    if not row:
        raise HTTPException(404, "Dashboard not found")
    return _db_row_to_out(row)


@router.put("/{dashboard_id}", response_model=DashboardOut)
def update_dashboard(dashboard_id: str, body: DashboardCreate):
    with db_lock() as conn:
        existing = conn.execute("SELECT id FROM _dashboards WHERE id = ?", [dashboard_id]).fetchone()
        if not existing:
            raise HTTPException(404, "Dashboard not found")
        conn.execute("UPDATE _dashboards SET name = ?, description = ? WHERE id = ?", [body.name, body.description, dashboard_id])
        row = conn.execute("SELECT id, name, description, created_at FROM _dashboards WHERE id = ?", [dashboard_id]).fetchone()
    return _db_row_to_out(row)


@router.delete("/{dashboard_id}")
def delete_dashboard(dashboard_id: str):
    with db_lock() as conn:
        conn.execute("DELETE FROM _widgets WHERE dashboard_id = ?", [dashboard_id])
        conn.execute("DELETE FROM _dashboards WHERE id = ?", [dashboard_id])
    return {"ok": True}


@router.get("/{dashboard_id}/widgets", response_model=list[WidgetOut])
def list_widgets(dashboard_id: str):
    with db_lock() as conn:
        rows = conn.execute(f"SELECT {_W_COLUMNS} FROM _widgets WHERE dashboard_id = ? ORDER BY created_at", [dashboard_id]).fetchall()
    return [_widget_row_to_out(r) for r in rows]


@router.post("/{dashboard_id}/widgets", response_model=WidgetOut)
def create_widget(dashboard_id: str, body: WidgetCreate):
    with db_lock() as conn:
        dash = conn.execute("SELECT id FROM _dashboards WHERE id = ?", [dashboard_id]).fetchone()
        if not dash:
            raise HTTPException(404, "Dashboard not found")
        sq = conn.execute("SELECT id FROM _saved_queries WHERE id = ?", [body.saved_query_id]).fetchone()
        if not sq:
            raise HTTPException(400, "saved_query_id does not reference an existing saved query")
        wid = new_id()
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO _widgets (id, dashboard_id, title, widget_type, saved_query_id, spec, layout, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [wid, dashboard_id, body.title, body.widget_type, body.saved_query_id, json.dumps(body.spec), json.dumps(body.layout), now],
        )
        row = conn.execute(f"SELECT {_W_COLUMNS} FROM _widgets WHERE id = ?", [wid]).fetchone()
    return _widget_row_to_out(row)


@router.put("/{dashboard_id}/widgets/{widget_id}", response_model=WidgetOut)
def update_widget(dashboard_id: str, widget_id: str, body: WidgetCreate):
    with db_lock() as conn:
        existing = conn.execute("SELECT id FROM _widgets WHERE id = ? AND dashboard_id = ?", [widget_id, dashboard_id]).fetchone()
        if not existing:
            raise HTTPException(404, "Widget not found")
        conn.execute(
            "UPDATE _widgets SET title = ?, widget_type = ?, saved_query_id = ?, spec = ?, layout = ? WHERE id = ?",
            [body.title, body.widget_type, body.saved_query_id, json.dumps(body.spec), json.dumps(body.layout), widget_id],
        )
        row = conn.execute(f"SELECT {_W_COLUMNS} FROM _widgets WHERE id = ?", [widget_id]).fetchone()
    return _widget_row_to_out(row)


@router.delete("/{dashboard_id}/widgets/{widget_id}")
def delete_widget(dashboard_id: str, widget_id: str):
    with db_lock() as conn:
        conn.execute("DELETE FROM _widgets WHERE id = ? AND dashboard_id = ?", [widget_id, dashboard_id])
    return {"ok": True}


@router.patch("/{dashboard_id}/layout")
def update_layout(dashboard_id: str, body: LayoutUpdateRequest):
    with db_lock() as conn:
        for item in body.items:
            conn.execute(
                "UPDATE _widgets SET layout = ? WHERE id = ? AND dashboard_id = ?",
                [json.dumps({"x": item.x, "y": item.y, "w": item.w, "h": item.h}), item.id, dashboard_id],
            )
    return {"ok": True}


@router.get("/{dashboard_id}/data")
def get_dashboard_data(dashboard_id: str):
    with db_lock() as conn:
        dash = conn.execute("SELECT id, name, description, created_at FROM _dashboards WHERE id = ?", [dashboard_id]).fetchone()
        if not dash:
            raise HTTPException(404, "Dashboard not found")
        widget_rows = conn.execute(f"SELECT {_W_COLUMNS} FROM _widgets WHERE dashboard_id = ? ORDER BY created_at", [dashboard_id]).fetchall()

        widgets_out = []
        for w in widget_rows:
            widget = _widget_row_to_out(w)
            sq_row = conn.execute("SELECT sql_text FROM _saved_queries WHERE id = ?", [w[4]]).fetchone()
            if sq_row:
                result = run_query(conn, sq_row[0])
                widget["data"] = result if "error" not in result else None
                widget["error"] = result.get("error")
            else:
                widget["data"] = None
                widget["error"] = "Saved query no longer exists"
            widgets_out.append(widget)

    return {"dashboard": _db_row_to_out(dash), "widgets": widgets_out}
