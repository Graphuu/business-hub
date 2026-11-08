"""AI provider settings + AI-generated medallion layers and dashboards.

Generation calls the LLM and can take a minute or more; the endpoints
are plain sync `def`s, so they run in FastAPI's threadpool and never
hold the DuckDB lock while waiting on the model."""

import time
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ai_generator import Plan, PlanError, apply_plan, generate_plan
from ai_providers import (
    DEFAULT_ANTHROPIC_MODEL, OPENAI_COMPATIBLE_PRESETS, AIProviderError,
    AISettings, build_provider, load_settings, save_settings,
)

router = APIRouter(prefix="/api/ai", tags=["ai"])


class SettingsUpdate(BaseModel):
    provider: str
    preset: str = ""
    model: str
    base_url: str = ""
    # Omitted/empty keeps the stored key; `clear_api_key` removes it.
    api_key: Optional[str] = None
    clear_api_key: bool = False


class PlanRequest(BaseModel):
    tables: list[str]
    goal: str = ""
    include_samples: bool = True


class ApplyRequest(BaseModel):
    plan: Plan


class TestRequest(BaseModel):
    settings: Optional[SettingsUpdate] = None


def _presets() -> dict:
    return {
        "anthropic": {"label": "Anthropic (Claude)", "provider": "anthropic", "default_model": DEFAULT_ANTHROPIC_MODEL, "needs_key": True},
        **{
            key: {"label": p["label"], "provider": "openai_compatible", "base_url": p["base_url"], "needs_key": p["needs_key"],
                  "default_model": p.get("default_model", "")}
            for key, p in OPENAI_COMPATIBLE_PRESETS.items()
        },
    }


def _merge(update: SettingsUpdate, current: AISettings) -> AISettings:
    if update.provider not in ("anthropic", "openai_compatible"):
        raise HTTPException(400, "provider must be 'anthropic' or 'openai_compatible'")
    if not update.model.strip():
        raise HTTPException(400, "Choose a model.")
    if update.clear_api_key:
        api_key = ""
    elif update.api_key:
        api_key = update.api_key.strip()
    else:
        # Only reuse the stored key when it was saved for the same provider —
        # never send an Anthropic key to some other endpoint.
        same_target = current.provider == update.provider and current.preset == update.preset
        api_key = current.api_key if same_target else ""
    return AISettings(
        provider=update.provider,
        preset=update.preset or ("anthropic" if update.provider == "anthropic" else "custom"),
        model=update.model.strip(),
        base_url=update.base_url.strip(),
        api_key=api_key,
    )


@router.get("/settings")
def get_settings():
    return {"settings": load_settings().public(), "presets": _presets()}


@router.put("/settings")
def put_settings(body: SettingsUpdate):
    settings = _merge(body, load_settings())
    save_settings(settings)
    return {"settings": settings.public(), "presets": _presets()}


@router.post("/test")
def test_connection(body: TestRequest):
    """Tests either the saved settings or unsaved ones from the form."""
    settings = _merge(body.settings, load_settings()) if body.settings else load_settings()
    schema = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False}
    started = time.monotonic()
    try:
        provider = build_provider(settings)
        provider.generate_json('Reply with the JSON object {"ok": true}.', [{"role": "user", "content": "Connection test."}], schema)
    except AIProviderError as e:
        raise HTTPException(502, str(e))
    return {"ok": True, "model": settings.model, "elapsed_ms": int((time.monotonic() - started) * 1000)}


@router.post("/plan")
def plan(body: PlanRequest):
    try:
        return generate_plan(body.tables, body.goal, body.include_samples)
    except PlanError as e:
        raise HTTPException(400, str(e))
    except AIProviderError as e:
        raise HTTPException(502, str(e))


@router.post("/apply")
def apply(body: ApplyRequest):
    try:
        return apply_plan(body.plan)
    except PlanError as e:
        raise HTTPException(400, str(e))
