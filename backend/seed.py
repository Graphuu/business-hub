"""Builds the full mock medallion demo: a synthetic 'orders' SQLite
database as a database Integration, JSONPlaceholder as an api
Integration, two bronze pipelines, one silver transform, five gold
transforms, saved queries for each, and a fully laid-out 'Executive
Overview' dashboard with 9 widgets.

Idempotent by name/table — reruns update existing rows instead of
duplicating them, so a "Reseed Demo Data" button in the UI is safe to
click repeatedly.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from db import db_lock, new_id
from ingestion import run_pipeline_ingestion
from mock_orders import generate_mock_orders_db
from transform_runner import run_transform

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MOCK_ORDERS_DB_PATH = _DATA_DIR / "mock_orders.sqlite"

DB_INTEGRATION_NAME = "Demo Orders Database"
API_INTEGRATION_NAME = "Demo Customers API"
DB_PIPELINE_NAME = "Ingest Orders (Bronze)"
API_PIPELINE_NAME = "Ingest Customers (Bronze)"
DASHBOARD_NAME = "Executive Overview"

SILVER_SQL = """
SELECT id, customer_id, product_name, category, unit_price, quantity,
  unit_price * quantity AS line_total, status, city, country,
  CAST(order_date AS TIMESTAMP) AS order_date
FROM bronze_orders WHERE status <> 'cancelled'
""".strip()

GOLD_TRANSFORMS = [
    {
        "name": "Revenue by Category", "target_table": "gold_revenue_by_category",
        "sql": """
SELECT category,
  ROUND(SUM(line_total), 2) AS total_revenue,
  COUNT(*) AS total_orders,
  ROUND(AVG(line_total), 2) AS avg_order_value
FROM silver_orders GROUP BY category ORDER BY total_revenue DESC
""".strip(),
    },
    {
        "name": "Orders by Status", "target_table": "gold_orders_by_status",
        "sql": """
SELECT status,
  COUNT(*) AS order_count,
  ROUND(SUM(unit_price * quantity), 2) AS total_value
FROM bronze_orders GROUP BY status ORDER BY order_count DESC
""".strip(),
    },
    {
        "name": "Revenue by Customer", "target_table": "gold_revenue_by_customer",
        "sql": """
SELECT c.name AS customer_name, c.company AS company_name,
  ROUND(SUM(o.line_total), 2) AS total_revenue,
  COUNT(*) AS order_count
FROM silver_orders o JOIN bronze_customers c ON o.customer_id = c.id
GROUP BY c.name, c.company ORDER BY total_revenue DESC LIMIT 10
""".strip(),
    },
    {
        "name": "Monthly Revenue Trend", "target_table": "gold_monthly_revenue",
        "sql": """
SELECT strftime(order_date, '%Y-%m') AS month,
  ROUND(SUM(line_total), 2) AS total_revenue,
  COUNT(*) AS order_count
FROM silver_orders GROUP BY month ORDER BY month
""".strip(),
    },
    {
        "name": "Revenue by City", "target_table": "gold_revenue_by_city",
        "sql": """
SELECT city, country,
  ROUND(SUM(line_total), 2) AS total_revenue,
  COUNT(*) AS order_count
FROM silver_orders GROUP BY city, country ORDER BY total_revenue DESC LIMIT 10
""".strip(),
    },
]

SAVED_QUERIES = [
    {"name": "KPI: Total Revenue", "sql": "SELECT ROUND(SUM(line_total), 2) AS total_revenue FROM silver_orders"},
    {"name": "KPI: Total Orders", "sql": "SELECT COUNT(*) AS total_orders FROM silver_orders"},
    {"name": "KPI: Avg Order Value", "sql": "SELECT ROUND(AVG(line_total), 2) AS avg_order_value FROM silver_orders"},
    {"name": "KPI: Active Customers", "sql": "SELECT COUNT(DISTINCT customer_id) AS active_customers FROM silver_orders"},
    {"name": "Revenue by Category", "sql": "SELECT * FROM gold_revenue_by_category"},
    {"name": "Orders by Status", "sql": "SELECT * FROM gold_orders_by_status"},
    {"name": "Monthly Revenue Trend", "sql": "SELECT * FROM gold_monthly_revenue"},
    {"name": "Revenue by City", "sql": "SELECT * FROM gold_revenue_by_city"},
    {"name": "Top Customers", "sql": "SELECT * FROM gold_revenue_by_customer"},
]

WIDGETS = [
    {"title": "Total Revenue", "type": "kpi", "query": "KPI: Total Revenue", "spec": {"value_column": "total_revenue", "format": "currency"}, "layout": {"x": 0, "y": 0, "w": 3, "h": 2}},
    {"title": "Total Orders", "type": "kpi", "query": "KPI: Total Orders", "spec": {"value_column": "total_orders", "format": "number"}, "layout": {"x": 3, "y": 0, "w": 3, "h": 2}},
    {"title": "Avg Order Value", "type": "kpi", "query": "KPI: Avg Order Value", "spec": {"value_column": "avg_order_value", "format": "currency"}, "layout": {"x": 6, "y": 0, "w": 3, "h": 2}},
    {"title": "Active Customers", "type": "kpi", "query": "KPI: Active Customers", "spec": {"value_column": "active_customers", "format": "number"}, "layout": {"x": 9, "y": 0, "w": 3, "h": 2}},
    {"title": "Revenue by Category", "type": "bar", "query": "Revenue by Category", "spec": {"x_column": "category", "y_columns": ["total_revenue"]}, "layout": {"x": 0, "y": 2, "w": 7, "h": 5}},
    {"title": "Orders by Status", "type": "pie", "query": "Orders by Status", "spec": {"label_column": "status", "value_column": "order_count"}, "layout": {"x": 7, "y": 2, "w": 5, "h": 5}},
    {"title": "Monthly Revenue Trend", "type": "area", "query": "Monthly Revenue Trend", "spec": {"x_column": "month", "y_columns": ["total_revenue"]}, "layout": {"x": 0, "y": 7, "w": 12, "h": 5}},
    {"title": "Revenue by City", "type": "bar", "query": "Revenue by City", "spec": {"x_column": "city", "y_columns": ["total_revenue"]}, "layout": {"x": 0, "y": 12, "w": 5, "h": 5}},
    {"title": "Top Customers", "type": "table", "query": "Top Customers", "spec": {"columns": None}, "layout": {"x": 5, "y": 12, "w": 7, "h": 5}},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _find_or_create_integration(conn, name: str, itype: str, config: dict) -> str:
    row = conn.execute("SELECT id FROM _integrations WHERE name = ?", [name]).fetchone()
    if row:
        conn.execute("UPDATE _integrations SET config = ? WHERE id = ?", [json.dumps(config), row[0]])
        return row[0]
    iid = new_id()
    conn.execute(
        "INSERT INTO _integrations (id, name, type, config, created_at) VALUES (?, ?, ?, ?, ?)",
        [iid, name, itype, json.dumps(config), _now()],
    )
    return iid


def _find_or_create_pipeline(conn, name: str, integration_id: str, source_config: dict, target_table: str) -> str:
    row = conn.execute("SELECT id FROM _pipelines WHERE name = ?", [name]).fetchone()
    if row:
        conn.execute(
            "UPDATE _pipelines SET integration_id = ?, source_config = ?, target_table = ? WHERE id = ?",
            [integration_id, json.dumps(source_config), target_table, row[0]],
        )
        return row[0]
    pid = new_id()
    conn.execute(
        "INSERT INTO _pipelines (id, name, integration_id, source_config, target_table, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, 'draft', ?)",
        [pid, name, integration_id, json.dumps(source_config), target_table, _now()],
    )
    return pid


def _upsert_dataset(conn, name: str, table_name: str, layer: str, row_count: int, produced_by_type: str, produced_by_id: str):
    row = conn.execute("SELECT id FROM _datasets WHERE table_name = ?", [table_name]).fetchone()
    if row:
        conn.execute("UPDATE _datasets SET row_count = ?, updated_at = ? WHERE table_name = ?", [row_count, _now(), table_name])
    else:
        conn.execute(
            "INSERT INTO _datasets (id, name, table_name, layer, row_count, produced_by_type, produced_by_id, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [new_id(), name, table_name, layer, row_count, produced_by_type, produced_by_id, _now()],
        )


def _find_or_create_transform(conn, name: str, sql_text: str, layer: str, target_table: str) -> str:
    row = conn.execute("SELECT id FROM _transforms WHERE name = ?", [name]).fetchone()
    if row:
        conn.execute(
            "UPDATE _transforms SET sql_text = ?, target_layer = ?, target_table = ? WHERE id = ?",
            [sql_text, layer, target_table, row[0]],
        )
        return row[0]
    tid = new_id()
    conn.execute(
        "INSERT INTO _transforms (id, name, sql_text, target_layer, target_table, source_tables, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, '[]', 'draft', ?)",
        [tid, name, sql_text, layer, target_table, _now()],
    )
    return tid


def _find_or_create_saved_query(conn, name: str, sql_text: str) -> str:
    row = conn.execute("SELECT id FROM _saved_queries WHERE name = ?", [name]).fetchone()
    if row:
        conn.execute("UPDATE _saved_queries SET sql_text = ? WHERE id = ?", [sql_text, row[0]])
        return row[0]
    qid = new_id()
    conn.execute(
        "INSERT INTO _saved_queries (id, name, sql_text, created_at) VALUES (?, ?, ?, ?)",
        [qid, name, sql_text, _now()],
    )
    return qid


def _find_or_create_dashboard(conn, name: str, description: str) -> str:
    row = conn.execute("SELECT id FROM _dashboards WHERE name = ?", [name]).fetchone()
    if row:
        return row[0]
    did = new_id()
    conn.execute(
        "INSERT INTO _dashboards (id, name, description, created_at) VALUES (?, ?, ?, ?)",
        [did, name, description, _now()],
    )
    return did


def _find_or_create_widget(conn, dashboard_id: str, title: str, widget_type: str, saved_query_id: str, spec: dict, layout: dict):
    row = conn.execute("SELECT id FROM _widgets WHERE dashboard_id = ? AND title = ?", [dashboard_id, title]).fetchone()
    if row:
        conn.execute(
            "UPDATE _widgets SET widget_type = ?, saved_query_id = ?, spec = ?, layout = ? WHERE id = ?",
            [widget_type, saved_query_id, json.dumps(spec), json.dumps(layout), row[0]],
        )
        return row[0]
    wid = new_id()
    conn.execute(
        "INSERT INTO _widgets (id, dashboard_id, title, widget_type, saved_query_id, spec, layout, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [wid, dashboard_id, title, widget_type, saved_query_id, json.dumps(spec), json.dumps(layout), _now()],
    )
    return wid


def seed_mock_demo() -> dict:
    generate_mock_orders_db(MOCK_ORDERS_DB_PATH)

    with db_lock() as conn:
        db_integration_id = _find_or_create_integration(
            conn, DB_INTEGRATION_NAME, "sqlite", {"db_path": str(MOCK_ORDERS_DB_PATH)}
        )
        api_integration_id = _find_or_create_integration(
            conn, API_INTEGRATION_NAME, "api", {"base_url": "https://jsonplaceholder.typicode.com"}
        )
        db_pipeline_id = _find_or_create_pipeline(
            conn, DB_PIPELINE_NAME, db_integration_id, {"query": "SELECT * FROM orders"}, "bronze_orders",
        )
        api_field_mapping = [
            {"source": "id", "target": "id"},
            {"source": "name", "target": "name"},
            {"source": "email", "target": "email"},
            {"source": "address.city", "target": "city"},
            {"source": "company.name", "target": "company"},
        ]
        api_pipeline_id = _find_or_create_pipeline(
            conn, API_PIPELINE_NAME, api_integration_id,
            {"endpoint_path": "/users", "field_mapping": api_field_mapping, "pagination": {"mode": "none"}},
            "bronze_customers",
        )

        db_pipeline_row = conn.execute("SELECT source_config FROM _pipelines WHERE id = ?", [db_pipeline_id]).fetchone()
        api_pipeline_row = conn.execute("SELECT source_config FROM _pipelines WHERE id = ?", [api_pipeline_id]).fetchone()
        db_integ_row = conn.execute("SELECT id, name, type, config FROM _integrations WHERE id = ?", [db_integration_id]).fetchone()
        api_integ_row = conn.execute("SELECT id, name, type, config FROM _integrations WHERE id = ?", [api_integration_id]).fetchone()

    db_integration = {"id": db_integ_row[0], "name": db_integ_row[1], "type": db_integ_row[2], "config": json.loads(db_integ_row[3])}
    api_integration = {"id": api_integ_row[0], "name": api_integ_row[1], "type": api_integ_row[2], "config": json.loads(api_integ_row[3])}

    # Unlocked — these do real external I/O (sqlite file read, HTTP call).
    db_rows = run_pipeline_ingestion(db_integration, json.loads(db_pipeline_row[0]), "bronze_orders")
    api_rows = run_pipeline_ingestion(api_integration, json.loads(api_pipeline_row[0]), "bronze_customers")

    with db_lock() as conn:
        conn.execute(
            "UPDATE _pipelines SET status = 'active', last_run_at = ?, last_run_status = 'success' WHERE id IN (?, ?)",
            [_now(), db_pipeline_id, api_pipeline_id],
        )
        _upsert_dataset(conn, "Orders (Bronze)", "bronze_orders", "bronze", db_rows, "pipeline", db_pipeline_id)
        _upsert_dataset(conn, "Customers (Bronze)", "bronze_customers", "bronze", api_rows, "pipeline", api_pipeline_id)

        silver_id = _find_or_create_transform(conn, "Clean Orders (Silver)", SILVER_SQL, "silver", "silver_orders")
        silver_rows = run_transform(conn, SILVER_SQL, "silver_orders")
        conn.execute("UPDATE _transforms SET status = 'active', last_run_at = ?, last_run_status = 'success' WHERE id = ?", [_now(), silver_id])
        _upsert_dataset(conn, "Clean Orders (Silver)", "silver_orders", "silver", silver_rows, "transform", silver_id)

        gold_ids = {}
        for spec in GOLD_TRANSFORMS:
            tid = _find_or_create_transform(conn, spec["name"], spec["sql"], "gold", spec["target_table"])
            rows_written = run_transform(conn, spec["sql"], spec["target_table"])
            conn.execute("UPDATE _transforms SET status = 'active', last_run_at = ?, last_run_status = 'success' WHERE id = ?", [_now(), tid])
            _upsert_dataset(conn, spec["name"], spec["target_table"], "gold", rows_written, "transform", tid)
            gold_ids[spec["name"]] = tid

        saved_query_ids = {}
        for sq in SAVED_QUERIES:
            saved_query_ids[sq["name"]] = _find_or_create_saved_query(conn, sq["name"], sq["sql"])

        dashboard_id = _find_or_create_dashboard(conn, DASHBOARD_NAME, "Company-wide revenue, orders, and customer performance at a glance.")

        for w in WIDGETS:
            _find_or_create_widget(conn, dashboard_id, w["title"], w["type"], saved_query_ids[w["query"]], w["spec"], w["layout"])

    return {
        "db_integration_id": db_integration_id, "api_integration_id": api_integration_id,
        "db_pipeline_id": db_pipeline_id, "api_pipeline_id": api_pipeline_id,
        "bronze_orders_rows": db_rows, "bronze_customers_rows": api_rows,
        "silver_orders_rows": silver_rows, "gold_tables": list(gold_ids.keys()),
        "dashboard_id": dashboard_id, "widget_count": len(WIDGETS),
    }


def reset_all() -> dict:
    with db_lock() as conn:
        data_tables = conn.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'main' AND NOT starts_with(table_name, '_')
        """).fetchall()
        for (table_name,) in data_tables:
            conn.execute(f'DROP TABLE IF EXISTS "{table_name}"')
        for t in ("_widgets", "_dashboards", "_saved_queries", "_transforms", "_pipelines", "_integrations", "_datasets"):
            conn.execute(f"DELETE FROM {t}")
    return {"ok": True}
