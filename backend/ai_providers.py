"""Provider-agnostic LLM access for the AI medallion generator.

Two adapters cover practically every provider:

- `AnthropicProvider` — Claude via the official Anthropic SDK, with
  schema-constrained JSON output (structured outputs) where the model
  supports it.
- `OpenAICompatibleProvider` — any `/chat/completions` endpoint: OpenAI,
  Ollama, LM Studio, Groq, OpenRouter, Gemini's OpenAI-compatible
  endpoint, vLLM, etc. Plain httpx, no vendor SDK.

Both expose one method, `generate_json(system, messages, schema)`, which
returns `(text, assistant_message)`. The assistant message is in the
provider's native shape so the caller can append it to `messages`
unchanged when asking for a repair round — the conversation stays
append-only, which some providers (Claude's preserved thinking) rely on.

Settings live in the `_settings` catalog table (key `ai`). The API key
is never returned to the frontend — only whether one is set.
"""

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Optional

import anthropic
import httpx

from db import db_lock

SETTINGS_KEY = "ai"

# Base URL presets for OpenAI-compatible providers. The user can always
# pick "custom" and type any URL.
OPENAI_COMPATIBLE_PRESETS = {
    "openai": {"label": "OpenAI", "base_url": "https://api.openai.com/v1", "needs_key": True},
    "ollama": {"label": "Ollama (local)", "base_url": "http://localhost:11434/v1", "needs_key": False},
    "lmstudio": {"label": "LM Studio (local)", "base_url": "http://localhost:1234/v1", "needs_key": False},
    "groq": {"label": "Groq", "base_url": "https://api.groq.com/openai/v1", "needs_key": True},
    "openrouter": {"label": "OpenRouter", "base_url": "https://openrouter.ai/api/v1", "needs_key": True},
    "gemini": {"label": "Google Gemini", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "needs_key": True},
    "deepseek": {"label": "DeepSeek", "base_url": "https://api.deepseek.com", "needs_key": True, "default_model": "deepseek-flash"},
    "custom": {"label": "Custom endpoint", "base_url": "", "needs_key": False},
}

DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5"


class AIProviderError(RuntimeError):
    """A provider call failed in a way worth showing the user verbatim."""


@dataclass
class AISettings:
    provider: str = "anthropic"  # 'anthropic' | 'openai_compatible'
    preset: str = "anthropic"
    model: str = DEFAULT_ANTHROPIC_MODEL
    base_url: str = ""
    api_key: str = ""
    extra: dict[str, Any] = field(default_factory=dict)
    configured: bool = False  # True once the user has saved settings

    def public(self) -> dict:
        key = self.api_key or self._env_key()
        return {
            "provider": self.provider,
            "preset": self.preset,
            "model": self.model,
            "base_url": self.base_url,
            "configured": self.configured,
            "api_key_set": bool(key),
            "api_key_source": "settings" if self.api_key else ("environment" if key else None),
            "api_key_hint": f"…{key[-4:]}" if key and len(key) > 8 else None,
        }

    def _env_key(self) -> str:
        if self.provider == "anthropic":
            return os.environ.get("ANTHROPIC_API_KEY", "")
        return os.environ.get("OPENAI_API_KEY", "") if self.preset == "openai" else ""


def load_settings() -> AISettings:
    with db_lock() as conn:
        row = conn.execute("SELECT value FROM _settings WHERE key = ?", [SETTINGS_KEY]).fetchone()
    if not row:
        return AISettings()
    data = json.loads(row[0])
    data["configured"] = True
    return AISettings(**{k: v for k, v in data.items() if k in AISettings.__dataclass_fields__})


def save_settings(settings: AISettings) -> None:
    settings.configured = True
    payload = json.dumps(settings.__dict__)
    with db_lock() as conn:
        conn.execute(
            "INSERT INTO _settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            [SETTINGS_KEY, payload],
        )


def build_provider(settings: AISettings):
    if not settings.model:
        raise AIProviderError("No model configured. Open AI settings and choose a model.")
    if settings.provider == "anthropic":
        return AnthropicProvider(settings.model, api_key=settings.api_key or None, base_url=settings.base_url or None)
    if settings.provider == "openai_compatible":
        base_url = settings.base_url or OPENAI_COMPATIBLE_PRESETS.get(settings.preset, {}).get("base_url", "")
        if not base_url:
            raise AIProviderError("No base URL configured for the OpenAI-compatible provider.")
        return OpenAICompatibleProvider(settings.model, base_url=base_url, api_key=settings.api_key or settings._env_key() or None)
    raise AIProviderError(f"Unknown AI provider: {settings.provider}")


# ─── Anthropic ──────────────────────────────────────────────────────────

# Feature support by model family. Anything not matched (older or
# unknown models) gets a plain request and the JSON is parsed from text.
_ADAPTIVE_THINKING_PREFIXES = (
    "claude-fable-5", "claude-mythos-5", "claude-opus-5", "claude-sonnet-5",
    "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6",
)
_STRUCTURED_OUTPUT_PREFIXES = (
    "claude-fable-5", "claude-mythos-5", "claude-opus-5", "claude-sonnet-5",
    "claude-opus-4-8", "claude-haiku-4-5",
)
# Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
_FALLBACK_MODELS = {"claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}


class AnthropicProvider:
    def __init__(self, model: str, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.model = model
        kwargs = {"timeout": 900.0}
        if api_key:
            kwargs["api_key"] = api_key
        if base_url:
            kwargs["base_url"] = base_url
        try:
            # With no explicit key the SDK resolves ANTHROPIC_API_KEY or an
            # `ant auth login` profile.
            self.client = anthropic.Anthropic(**kwargs)
        except anthropic.AnthropicError as e:
            raise AIProviderError(f"Anthropic client could not be created: {e}") from e

    def generate_json(self, system: str, messages: list, schema: dict) -> tuple[str, dict]:
        params: dict[str, Any] = {
            "model": self.model,
            "max_tokens": 64000,
            "system": system,
            "messages": messages,
        }
        output_config: dict[str, Any] = {}
        if self.model.startswith(_ADAPTIVE_THINKING_PREFIXES):
            params["thinking"] = {"type": "adaptive"}
            # Writing correct SQL against an unfamiliar schema is
            # intelligence-sensitive work — don't run at the medium default.
            output_config["effort"] = "high"
        if self.model.startswith(_STRUCTURED_OUTPUT_PREFIXES):
            output_config["format"] = {"type": "json_schema", "schema": schema}
        if output_config:
            params["output_config"] = output_config

        try:
            if self.model in _FALLBACK_MODELS:
                stream = self.client.beta.messages.stream(
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default", **params
                )
            else:
                stream = self.client.messages.stream(**params)
            with stream as s:
                message = s.get_final_message()
        except anthropic.AuthenticationError as e:
            raise AIProviderError("Anthropic rejected the API key. Check AI settings.") from e
        except anthropic.PermissionDeniedError as e:
            raise AIProviderError(f"This API key can't use {self.model}: {e.message}") from e
        except anthropic.NotFoundError as e:
            raise AIProviderError(f"Model not found: {self.model}") from e
        except anthropic.RateLimitError as e:
            raise AIProviderError("Rate limited by Anthropic — wait a moment and try again.") from e
        except anthropic.BadRequestError as e:
            raise AIProviderError(f"Anthropic rejected the request: {e.message}") from e
        except anthropic.APIStatusError as e:
            raise AIProviderError(f"Anthropic API error ({e.status_code}): {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise AIProviderError("Could not reach the Anthropic API — check your network connection.") from e
        except anthropic.AnthropicError as e:
            # e.g. no credentials found at all
            raise AIProviderError(f"Anthropic client error: {e}") from e

        if message.stop_reason == "refusal":
            raise AIProviderError("The model declined this request.")
        if message.stop_reason == "max_tokens":
            raise AIProviderError("The model's answer was cut off (output limit reached). Try selecting fewer tables.")

        text = "".join(b.text for b in message.content if b.type == "text")
        return text, {"role": "assistant", "content": _echoable_content(message.content)}


def _echoable_content(blocks: list) -> list:
    """Content to send back on the next turn. If a server-side fallback
    happened mid-output, everything before the last `fallback` marker
    except text came from the declined model and must be dropped."""
    last_fallback = max((i for i, b in enumerate(blocks) if b.type == "fallback"), default=None)
    if last_fallback is None:
        return list(blocks)
    before = [b for b in blocks[:last_fallback] if b.type == "text"]
    return before + list(blocks[last_fallback + 1:])


# ─── OpenAI-compatible ──────────────────────────────────────────────────

class OpenAICompatibleProvider:
    def __init__(self, model: str, base_url: str, api_key: Optional[str] = None):
        self.model = model
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.headers = {"Content-Type": "application/json"}
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"

    def generate_json(self, system: str, messages: list, schema: dict) -> tuple[str, dict]:
        # Providers can't be relied on to support json_schema mode, so the
        # schema goes in the prompt and JSON mode only guarantees syntax.
        system_with_schema = f"{system}\n\nRespond with a single JSON object matching this JSON Schema:\n{json.dumps(schema)}"
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system_with_schema}, *messages],
            "response_format": {"type": "json_object"},
        }
        data = self._post(body)
        choice = (data.get("choices") or [{}])[0]
        text = (choice.get("message") or {}).get("content") or ""
        if choice.get("finish_reason") == "length":
            raise AIProviderError("The model's answer was cut off (output limit reached). Try selecting fewer tables.")
        if not text.strip():
            raise AIProviderError("The model returned an empty response.")
        return text, {"role": "assistant", "content": text}

    def _post(self, body: dict) -> dict:
        try:
            with httpx.Client(timeout=httpx.Timeout(900.0, connect=10.0)) as client:
                resp = client.post(self.url, headers=self.headers, json=body)
                if resp.status_code == 400 and "response_format" in resp.text:
                    # Some servers don't implement JSON mode — retry without it.
                    body = {k: v for k, v in body.items() if k != "response_format"}
                    resp = client.post(self.url, headers=self.headers, json=body)
        except httpx.ConnectError as e:
            raise AIProviderError(f"Could not connect to {self.url}. Is the server running?") from e
        except httpx.TimeoutException as e:
            raise AIProviderError("The model took too long to answer.") from e
        except httpx.HTTPError as e:
            raise AIProviderError(f"Request to the AI provider failed: {e}") from e

        if resp.status_code in (401, 403):
            raise AIProviderError("The provider rejected the API key. Check AI settings.")
        if resp.status_code == 404:
            raise AIProviderError(f"Endpoint or model not found ({self.model} at {self.url}).")
        if resp.status_code == 429:
            raise AIProviderError("Rate limited by the provider — wait a moment and try again.")
        if resp.status_code >= 400:
            raise AIProviderError(f"Provider error ({resp.status_code}): {resp.text[:300]}")
        try:
            return resp.json()
        except ValueError as e:
            raise AIProviderError("The provider returned a non-JSON response.") from e


# ─── JSON extraction ────────────────────────────────────────────────────

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def parse_json_object(text: str) -> dict:
    """Lenient parse for providers without schema enforcement: accepts
    bare JSON, a fenced ```json block, or JSON surrounded by prose."""
    candidates = [text.strip()]
    candidates += [m.strip() for m in _FENCE_RE.findall(text)]
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start:end + 1])
    for candidate in candidates:
        try:
            value = json.loads(candidate)
        except ValueError:
            continue
        if isinstance(value, dict):
            return value
    raise AIProviderError("The model's answer was not valid JSON.")
