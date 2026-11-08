"""AI-generated medallion layers + dashboard.

Given a set of bronze tables (and an optional goal in plain language),
asks the configured LLM for a plan — silver transforms, gold transforms,
and a dashboard of widgets — then proves the plan works before anyone
applies it:

1. **Profile** — column types plus DuckDB `SUMMARIZE` stats and a few
   sample rows per table (samples and min/max are optional, for data
   that shouldn't leave the machine).
2. **Generate** — one LLM call returning a JSON plan.
3. **Dry-run** — every transform is materialized and every widget query
   executed inside a DuckDB transaction that is always rolled back.
   Errors (bad SQL, missing columns, a KPI returning many rows...) go
   back to the model, which repairs its own plan — up to
   MAX_REPAIR_ROUNDS times.
4. **Apply** (separate call, after the user has reviewed the previews) —
   creates transforms, datasets, saved queries, a dashboard and
   auto-laid-out widgets, using the same runners as the rest of the app.

Every SQL statement still goes through sql_guard, so nothing the model
writes can do more than a user-typed SELECT could.
"""

import json
import re
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal, Optional

import duckdb
from pydantic import BaseModel, Field, ValidationError

from ai_providers import AIProviderError, build_provider, load_settings, parse_json_object
from db import db_lock, new_id, safe_identifier
from query_runner import run_query
from transform_runner import list_available_tables, run_transform

MAX_REPAIR_ROUNDS = 2
MAX_SOURCE_TABLES = 8
MAX_COLUMNS_PER_TABLE = 80
SAMPLE_ROWS = 5
PREVIEW_ROWS = 50
KPI_FORMATS = ("number", "currency", "percent")


class PlanError(ValueError):
    pass


# ─── Plan model ─────────────────────────────────────────────────────────

class PlanTransform(BaseModel):
    name: str
    target_table: str
    description: str = ""
    sql: str


class PlanWidget(BaseModel):
    title: str
    type: Literal["kpi", "bar", "area", "pie", "table"]
    sql: str
    value_column: Optional[str] = None
    format: Optional[str] = None
    x_column: Optional[str] = None
    y_columns: Optional[list[str]] = None
    label_column: Optional[str] = None
    width: Optional[int] = None


class PlanDashboard(BaseModel):
    name: str
    description: str = ""
    widgets: list[PlanWidget] = Field(default_factory=list)


class Plan(BaseModel):
    summary: str = ""
    silver: list[PlanTransform] = Field(default_factory=list)
    gold: list[PlanTransform] = Field(default_factory=list)
    dashboard: PlanDashboard

    def normalized(self) -> "Plan":
        for t in self.silver + self.gold:
            t.target_table = t.target_table.strip().lower()
            t.sql = t.sql.strip().rstrip(";").strip()
        for w in self.dashboard.widgets:
            w.sql = w.sql.strip().rstrip(";").strip()
            if w.type == "kpi" and w.format not in KPI_FORMATS:
                w.format = "number"
        return self


_STR = {"type": "string"}
_TRANSFORM_SCHEMA = {
    "type": "object",
    "properties": {"name": _STR, "target_table": _STR, "description": _STR, "sql": _STR},
    "required": ["name", "target_table", "description", "sql"],
    "additionalProperties": False,
}
PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": _STR,
        "silver": {"type": "array", "items": _TRANSFORM_SCHEMA},
        "gold": {"type": "array", "items": _TRANSFORM_SCHEMA},
        "dashboard": {
            "type": "object",
            "properties": {
                "name": _STR,
                "description": _STR,
                "widgets": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": _STR,
                            "type": {"type": "string", "enum": ["kpi", "bar", "area", "pie", "table"]},
                            "sql": _STR,
                            "value_column": _STR,
                            "format": {"type": "string", "enum": list(KPI_FORMATS)},
                            "x_column": _STR,
                            "y_columns": {"type": "array", "items": _STR},
                            "label_column": _STR,
                            "width": {"type": "integer"},
                        },
                        "required": ["title", "type", "sql"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["name", "description", "widgets"],
            "additionalProperties": False,
        },
    },
    "required": ["summary", "silver", "gold", "dashboard"],
    "additionalProperties": False,
}


# ─── Prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a senior analytics engineer designing a medallion data model in DuckDB.

You receive profiles of raw "bronze" tables. Design:
- silver transforms: cleaned, typed, de-duplicated versions of the bronze tables worth keeping. Cast text to proper types (prefer TRY_CAST so one bad value doesn't fail the whole table), trim and normalize strings, give columns clear snake_case names, drop obviously invalid rows, and join bronze tables only when the relationship is clear from the data.
- gold transforms: aggregated, business-ready tables answering the questions a stakeholder would actually ask of this data (trends over time, breakdowns by meaningful categories, top-N rankings, rates and ratios).
- a dashboard that tells the story of the data at a glance.

How the plan is executed — your SQL must work under these rules:
- Each transform is exactly one read-only SELECT in DuckDB SQL (no semicolons, no DDL, no file or network functions such as read_csv). Its result is materialized as target_table.
- Transforms run in order: all silver in the listed order, then all gold. A transform may only read bronze tables, the other existing tables listed, and tables created earlier in the plan.
- target_table names must be snake_case, start with "silver_" or "gold_" matching their layer, and must not reuse the name of any existing table.
- Use only columns that appear in the profiles or that you created in an earlier transform. Column names are case-sensitive as listed; double-quote any that aren't plain lowercase identifiers.
- Dates: strftime(ts, '%Y-%m') for month labels, date_trunc('month', ts) for buckets. Round money with ROUND(x, 2).

Dashboard widgets — each has its own SELECT, usually over gold (or silver) tables from the plan:
- kpi: returns exactly one row; value_column names the numeric column; format is number, currency or percent. Use 3–4 KPIs.
- bar: x_column is a category, y_columns are numeric columns; keep it to about 20 rows or fewer (ORDER BY ... LIMIT).
- area: a time series; x_column is the time label, ordered ascending; y_columns numeric.
- pie: label_column + value_column; 8 slices or fewer.
- table: a ranked detail list, LIMIT 50 or fewer.
- Every column named in a widget must exactly match an output column alias of that widget's SELECT.
- width is the chart's share of a 12-column grid (4–12); KPIs are laid out automatically. Aim for 4–7 charts besides the KPIs, mixing types where it helps the story.

Write a one-paragraph summary of the model you designed. Names and descriptions should read well to a business user."""


def _user_prompt(profiles: list[dict], other_tables: list[str], goal: str, include_samples: bool) -> str:
    parts = ["Bronze tables to model:", json.dumps(profiles, default=str, separators=(",", ":"))]
    if other_tables:
        parts += ["", "Other existing tables (you may read them; never use their names as targets):", ", ".join(other_tables)]
    if not include_samples:
        parts += ["", "Sample values were withheld for privacy — infer meaning from column names and types."]
    parts += ["", f"Goal: {goal.strip()}" if goal and goal.strip() else "Goal: none given — design the most useful analytics this data supports."]
    return "\n".join(parts)


def _repair_prompt(errors: list[str]) -> str:
    bullet_list = "\n".join(f"- {e}" for e in errors)
    return (
        "I dry-ran your plan against the real database. These parts failed:\n"
        f"{bullet_list}\n\n"
        "Fix them and return the complete corrected plan (everything, not just the changed parts). "
        "Keep the parts that worked unless a fix requires changing them."
    )


# ─── Profiling ──────────────────────────────────────────────────────────

def _short(value, limit: int = 60):
    if value is None:
        return None
    if isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    text = str(value)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def profile_tables(conn, tables: list[str], include_samples: bool) -> list[dict]:
    profiles = []
    for table in tables:
        safe_identifier(table)
        cols = conn.execute(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema = 'main' AND table_name = ? ORDER BY ordinal_position",
            [table],
        ).fetchall()
        row_count = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]

        stats: dict[str, dict] = {}
        try:
            cursor = conn.execute(f'SUMMARIZE "{table}"')
            names = [d[0] for d in cursor.description]
            for row in cursor.fetchall():
                record = dict(zip(names, row))
                stats[record["column_name"]] = record
        except duckdb.Error:
            pass  # stats are a nice-to-have; types alone still work

        columns = []
        for name, dtype in cols[:MAX_COLUMNS_PER_TABLE]:
            s = stats.get(name, {})
            col = {"name": name, "type": dtype, "approx_distinct": s.get("approx_unique"), "null_pct": _short(s.get("null_percentage"))}
            if include_samples:
                col["min"] = _short(s.get("min"), 40)
                col["max"] = _short(s.get("max"), 40)
            columns.append(col)

        profile = {"table": table, "row_count": row_count, "columns": columns}
        if len(cols) > MAX_COLUMNS_PER_TABLE:
            profile["note"] = f"{len(cols) - MAX_COLUMNS_PER_TABLE} more columns omitted"
        if include_samples:
            cursor = conn.execute(f'SELECT * FROM "{table}" LIMIT {SAMPLE_ROWS}')
            names = [d[0] for d in cursor.description][:MAX_COLUMNS_PER_TABLE]
            profile["sample_rows"] = [{n: _short(v) for n, v in zip(names, row)} for row in cursor.fetchall()]
        profiles.append(profile)
    return profiles


# ─── Validation (dry run) ───────────────────────────────────────────────

def _clean_error(e: Exception) -> str:
    text = str(e).strip().replace("\n", " ")
    return text if len(text) <= 400 else text[:399] + "…"


def _ui_message(error: str) -> str:
    """DuckDB appends a `LINE 1: ... ^` caret excerpt — useful to the
    model, noise in the review UI."""
    return error.split(" LINE ")[0].strip()


def _failed_dependency(sql_text: str, failed: set[str]) -> Optional[str]:
    for table in failed:
        if re.search(rf"\b{re.escape(table)}\b", sql_text, re.IGNORECASE):
            return table
    return None


def _target_problem(target: str, layer: str, existing: set[str], seen: set[str]) -> Optional[str]:
    try:
        safe_identifier(target)
    except ValueError:
        return f'"{target}" is not a valid table name (letters, digits, underscores).'
    if not target.startswith(f"{layer}_"):
        return f'Table name must start with "{layer}_".'
    if target in {t.lower() for t in existing}:
        return f'A table named "{target}" already exists — choose a new name.'
    if target in seen:
        return f'"{target}" is used twice in this plan.'
    return None


def _spec_problems(w: PlanWidget, result: dict) -> list[str]:
    cols = result["columns"]
    available = ", ".join(cols)

    def missing(col: Optional[str], role: str) -> Optional[str]:
        if not col:
            return f"{role} is required for a {w.type} widget."
        if col not in cols:
            return f'{role} "{col}" is not an output column (available: {available}).'
        return None

    problems: list[Optional[str]] = []
    if w.type == "kpi":
        problems.append(missing(w.value_column, "value_column"))
        if result["row_count"] != 1:
            problems.append(f"A KPI query must return exactly one row; it returned {result['row_count']}.")
    elif w.type in ("bar", "area"):
        problems.append(missing(w.x_column, "x_column"))
        if not w.y_columns:
            problems.append("y_columns needs at least one numeric column.")
        for y in w.y_columns or []:
            problems.append(missing(y, "y_columns entry"))
    elif w.type == "pie":
        problems.append(missing(w.label_column, "label_column"))
        problems.append(missing(w.value_column, "value_column"))
    return [p for p in problems if p]


def _recover(conn, created: list[tuple[str, str]]) -> None:
    """A runtime error (e.g. a failed CAST) aborts the whole DuckDB
    transaction — start a fresh one and replay what had succeeded so
    later items still see the tables they depend on."""
    try:
        conn.execute("SELECT 1")
        return
    except duckdb.Error:
        pass
    conn.execute("ROLLBACK")
    conn.execute("BEGIN TRANSACTION")
    for sql_text, target in created:
        run_transform(conn, sql_text, target)


def validate_plan(plan: Plan) -> dict:
    report = {"transforms": [], "widgets": [], "errors": [], "warnings": []}
    with db_lock() as conn:
        existing = list_available_tables(conn)
        conn.execute("BEGIN TRANSACTION")
        created: list[tuple[str, str]] = []
        failed: set[str] = set()
        try:
            seen: set[str] = set()
            for layer, items in (("silver", plan.silver), ("gold", plan.gold)):
                for t in items:
                    item = {"layer": layer, "target_table": t.target_table, "status": "ok", "message": None, "row_count": None}
                    problem = _target_problem(t.target_table, layer, existing, seen)
                    upstream = None if problem else _failed_dependency(t.sql, failed)
                    if upstream:
                        problem = f'Reads "{upstream}", which failed above.'
                    if not problem:
                        seen.add(t.target_table)
                        try:
                            item["row_count"] = run_transform(conn, t.sql, t.target_table)
                            created.append((t.sql, t.target_table))
                        except Exception as e:
                            problem = _clean_error(e)
                            _recover(conn, created)
                    if problem:
                        failed.add(t.target_table)
                        item.update(status="error", message=_ui_message(problem))
                        report["errors"].append(f'{layer} transform "{t.name}" ({t.target_table}): {problem}')
                    elif item["row_count"] == 0:
                        item.update(status="warning", message="Produced 0 rows — filters may be too strict.")
                        report["warnings"].append(f'{layer} transform "{t.name}" ({t.target_table}) produced 0 rows.')
                    report["transforms"].append(item)

            for w in plan.dashboard.widgets:
                item = {"title": w.title, "status": "ok", "message": None, "preview": None}
                upstream = _failed_dependency(w.sql, failed)
                if upstream:
                    result = {"error": f'Reads "{upstream}", which failed above.'}
                else:
                    try:
                        result = run_query(conn, w.sql, max_rows=PREVIEW_ROWS)
                    except Exception as e:
                        result = {"error": _clean_error(e)}
                        _recover(conn, created)
                problems = [result["error"]] if "error" in result else _spec_problems(w, result)
                if problems:
                    item.update(status="error", message=_ui_message(" ".join(problems)))
                    report["errors"].append(f'widget "{w.title}": {" ".join(problems)}')
                else:
                    item["preview"] = result
                    if result["row_count"] == 0:
                        item.update(status="warning", message="Query returned no rows.")
                report["widgets"].append(item)
        finally:
            conn.execute("ROLLBACK")
    return report


# ─── Generate ───────────────────────────────────────────────────────────

def generate_plan(tables: list[str], goal: str = "", include_samples: bool = True) -> dict:
    tables = list(dict.fromkeys(t.strip() for t in tables if t and t.strip()))
    if not tables:
        raise PlanError("Select at least one bronze table.")
    if len(tables) > MAX_SOURCE_TABLES:
        raise PlanError(f"Select at most {MAX_SOURCE_TABLES} tables at a time.")

    settings = load_settings()
    provider = build_provider(settings)

    with db_lock() as conn:
        available = list_available_tables(conn)
        unknown = [t for t in tables if t not in available]
        if unknown:
            raise PlanError(f"Unknown table(s): {', '.join(unknown)}")
        profiles = profile_tables(conn, tables, include_samples)
    other_tables = sorted(available - set(tables))

    started = time.monotonic()
    messages: list = [{"role": "user", "content": _user_prompt(profiles, other_tables, goal, include_samples)}]
    attempts: list[dict] = []
    plan: Optional[Plan] = None
    report: Optional[dict] = None

    for round_no in range(1, MAX_REPAIR_ROUNDS + 2):
        text, assistant_message = provider.generate_json(SYSTEM_PROMPT, messages, PLAN_SCHEMA)
        messages.append(assistant_message)

        try:
            candidate = Plan.model_validate(parse_json_object(text)).normalized()
        except (AIProviderError, ValidationError) as e:
            detail = str(e).splitlines()[0]
            attempts.append({"round": round_no, "errors": [f"Unparseable answer: {detail}"]})
            messages.append({
                "role": "user",
                "content": f"Your answer could not be parsed ({detail}). Return the complete plan as one JSON object matching the schema.",
            })
            continue

        plan, report = candidate, validate_plan(candidate)
        attempts.append({"round": round_no, "errors": report["errors"]})
        if not report["errors"]:
            break
        if round_no <= MAX_REPAIR_ROUNDS:
            messages.append({"role": "user", "content": _repair_prompt(report["errors"])})

    if plan is None:
        raise AIProviderError("The model did not return a usable plan. Try again or switch models.")

    return {
        "plan": plan.model_dump(),
        "validation": report,
        "attempts": attempts,
        "source_tables": tables,
        "provider": settings.provider,
        "model": settings.model,
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }


# ─── Apply ──────────────────────────────────────────────────────────────

def _widget_spec(w: PlanWidget) -> dict:
    if w.type == "kpi":
        return {"value_column": w.value_column, "format": w.format or "number"}
    if w.type in ("bar", "area"):
        return {"x_column": w.x_column, "y_columns": w.y_columns or []}
    if w.type == "pie":
        return {"label_column": w.label_column, "value_column": w.value_column}
    return {"columns": None}


def auto_layout(widgets: list[PlanWidget]) -> list[dict]:
    """KPIs share the top row(s); charts flow left-to-right in a 12-col
    grid, and the last item of each row stretches to close any gap."""
    kpis = [w for w in widgets if w.type == "kpi"]
    kpi_w = 12 // min(len(kpis), 4) if kpis else 3

    rows: list[list[dict]] = []
    row: list[dict] = []
    used = 0
    for w in widgets:
        if w.type == "kpi":
            width, height = kpi_w, 2
        else:
            default = 12 if w.type == "table" else 6
            width, height = max(4, min(12, w.width or default)), 6 if w.type == "table" else 5
        if used + width > 12 or (row and (row[-1]["kpi"] != (w.type == "kpi"))):
            rows.append(row)
            row, used = [], 0
        row.append({"widget": w, "w": width, "h": height, "kpi": w.type == "kpi"})
        used += width
    if row:
        rows.append(row)

    # KPI rows first, keeping the model's order otherwise.
    rows.sort(key=lambda r: 0 if r[0]["kpi"] else 1)
    layouts, y = [], 0
    for r in rows:
        r[-1]["w"] += 12 - sum(c["w"] for c in r)
        x = 0
        for cell in r:
            layouts.append({"x": x, "y": y, "w": cell["w"], "h": cell["h"], "widget": cell["widget"]})
            x += cell["w"]
        y += max(c["h"] for c in r)
    return layouts


def apply_plan(plan: Plan) -> dict:
    plan = plan.normalized()
    now = datetime.now(timezone.utc).isoformat()
    with db_lock() as conn:
        existing = list_available_tables(conn)
        seen: set[str] = set()
        for layer, items in (("silver", plan.silver), ("gold", plan.gold)):
            for t in items:
                problem = _target_problem(t.target_table, layer, existing, seen)
                if problem:
                    raise PlanError(f'{t.name}: {problem}')
                seen.add(t.target_table)

        # All-or-nothing for the data layers.
        conn.execute("BEGIN TRANSACTION")
        current = None
        transform_ids = []
        try:
            for layer, items in (("silver", plan.silver), ("gold", plan.gold)):
                for t in items:
                    current = t
                    rows = run_transform(conn, t.sql, t.target_table)
                    tid = new_id()
                    conn.execute(
                        "INSERT INTO _transforms (id, name, sql_text, target_layer, target_table, source_tables, status, "
                        "last_run_at, last_run_status, created_at) VALUES (?, ?, ?, ?, ?, '[]', 'active', ?, 'success', ?)",
                        [tid, t.name, t.sql, layer, t.target_table, now, now],
                    )
                    conn.execute(
                        "INSERT INTO _datasets (id, name, table_name, layer, row_count, produced_by_type, produced_by_id, updated_at) "
                        "VALUES (?, ?, ?, ?, ?, 'transform', ?, ?)",
                        [new_id(), t.name, t.target_table, layer, rows, tid, now],
                    )
                    transform_ids.append(tid)
            conn.execute("COMMIT")
        except Exception as e:
            conn.execute("ROLLBACK")
            raise PlanError(f'Transform "{current.name if current else "?"}" failed: {_clean_error(e)}') from e

        # Widgets run outside a transaction, so one failing query can't
        # take the others down with it — it's just skipped.
        kept, skipped = [], []
        for w in plan.dashboard.widgets:
            try:
                result = run_query(conn, w.sql, max_rows=PREVIEW_ROWS)
            except Exception as e:
                result = {"error": _clean_error(e)}
            if "error" in result or _spec_problems(w, result):
                skipped.append(w.title)
            else:
                kept.append(w)

        dashboard_id = new_id()
        conn.execute(
            "INSERT INTO _dashboards (id, name, description, created_at) VALUES (?, ?, ?, ?)",
            [dashboard_id, plan.dashboard.name, plan.dashboard.description, now],
        )
        for cell in auto_layout(kept):
            w = cell.pop("widget")
            query_id = new_id()
            conn.execute(
                "INSERT INTO _saved_queries (id, name, sql_text, created_at) VALUES (?, ?, ?, ?)",
                [query_id, f"{plan.dashboard.name} · {w.title}", w.sql, now],
            )
            conn.execute(
                "INSERT INTO _widgets (id, dashboard_id, title, widget_type, saved_query_id, spec, layout, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [new_id(), dashboard_id, w.title, w.type, query_id, json.dumps(_widget_spec(w)), json.dumps(cell), now],
            )

    return {
        "dashboard_id": dashboard_id,
        "transform_ids": transform_ids,
        "tables": [t.target_table for t in plan.silver + plan.gold],
        "widgets_created": len(kept),
        "widgets_skipped": skipped,
    }
