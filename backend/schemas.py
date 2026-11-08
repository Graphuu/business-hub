"""Pydantic request/response models. DuckDB rows are mapped to/from
these by hand in each router — there's no ORM here, catalog tables are
plain SQL."""

from typing import Any, Optional

from pydantic import BaseModel, Field


class IntegrationCreate(BaseModel):
    name: str
    type: str  # 'sqlite' | 'postgresql' | 'api'
    config: dict[str, Any] = Field(default_factory=dict)


class IntegrationOut(BaseModel):
    id: str
    name: str
    type: str
    config: dict[str, Any]
    created_at: str


class PipelineCreate(BaseModel):
    name: str
    integration_id: str
    source_config: dict[str, Any]
    target_table: str


class PipelineOut(BaseModel):
    id: str
    name: str
    integration_id: str
    source_config: dict[str, Any]
    target_table: str
    status: str
    last_run_at: Optional[str] = None
    last_run_status: Optional[str] = None
    last_error: Optional[str] = None
    created_at: str


class TransformCreate(BaseModel):
    name: str
    sql_text: str
    target_layer: str  # 'silver' | 'gold'
    target_table: str


class TransformOut(BaseModel):
    id: str
    name: str
    sql_text: str
    target_layer: str
    target_table: str
    status: str
    last_run_at: Optional[str] = None
    last_run_status: Optional[str] = None
    last_error: Optional[str] = None
    created_at: str


class DatasetOut(BaseModel):
    id: str
    name: str
    table_name: str
    layer: str
    row_count: Optional[int] = None
    produced_by_type: Optional[str] = None
    produced_by_id: Optional[str] = None
    updated_at: str


class QueryRequest(BaseModel):
    sql: str


class QueryResult(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    row_count: int


class SavedQueryCreate(BaseModel):
    name: str
    sql_text: str


class SavedQueryOut(BaseModel):
    id: str
    name: str
    sql_text: str
    created_at: str


class DashboardCreate(BaseModel):
    name: str
    description: Optional[str] = None


class DashboardOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: str


class WidgetCreate(BaseModel):
    title: str
    widget_type: str
    saved_query_id: str
    spec: dict[str, Any] = Field(default_factory=dict)
    layout: dict[str, Any] = Field(default_factory=dict)


class WidgetOut(BaseModel):
    id: str
    dashboard_id: str
    title: str
    widget_type: str
    saved_query_id: str
    spec: dict[str, Any]
    layout: dict[str, Any]
    created_at: str


class LayoutUpdateItem(BaseModel):
    id: str
    x: int
    y: int
    w: int
    h: int


class LayoutUpdateRequest(BaseModel):
    items: list[LayoutUpdateItem]
