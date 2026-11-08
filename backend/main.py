"""Business Hub — standalone FastAPI app. Serves the API under /api/*
and the built frontend (frontend/dist) as static files at /.

Run with `python main.py` from this directory — no Docker/Node needed
at runtime, the frontend is pre-built via `npm run build`.
"""

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import seed as seed_module
import streaming
from db import db_lock
from routers import ai, dashboards, datasets, ingest, integrations, pipelines, queries, transforms


@asynccontextmanager
async def lifespan(app: FastAPI):
    resume_streaming_pipelines()
    yield
    streaming.stop_all()


app = FastAPI(title="Business Hub API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(integrations.router)
app.include_router(pipelines.router)
app.include_router(transforms.router)
app.include_router(datasets.router)
app.include_router(queries.router)
app.include_router(dashboards.router)
app.include_router(ingest.router)
app.include_router(ai.router)


def resume_streaming_pipelines():
    """A DuckDB restart brings the catalog back but not the in-process
    consumer threads — anything left `status='active'` on a streaming
    integration needs its consumer re-spawned."""
    with db_lock() as conn:
        rows = conn.execute(
            "SELECT p.id, p.source_config, p.target_table, i.id, i.type, i.config "
            "FROM _pipelines p JOIN _integrations i ON i.id = p.integration_id "
            f"WHERE p.status = 'active' AND i.type IN ({','.join('?' * len(streaming.STREAMING_TYPES))})",
            list(streaming.STREAMING_TYPES),
        ).fetchall()
    for pipeline_id, source_config_json, target_table, integ_id, itype, config_json in rows:
        integration = {"id": integ_id, "type": itype, "config": json.loads(config_json)}
        streaming.start_consumer(pipeline_id, integration, json.loads(source_config_json), target_table)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/seed/mock")
def seed_mock():
    return seed_module.seed_mock_demo()


@app.post("/api/seed/reset")
def reset_all():
    return seed_module.reset_all()


_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if _FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        candidate = _FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_FRONTEND_DIST / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8420)
