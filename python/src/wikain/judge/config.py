"""DeepSeek transport config (spec/08 NET-7: the key lives server-side, never in a client bundle)."""

import os
from dataclasses import dataclass

#: spec/00 tunable CLOUD_RETRY_COUNT. One retry, then surface the failure — never fabricate a verdict.
CLOUD_RETRY_COUNT = 1


@dataclass(frozen=True, slots=True)
class DeepSeekConfig:
    api_key: str
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-v4-flash"
    timeout_s: float = 20.0
    retry_count: int = CLOUD_RETRY_COUNT
    backoff_s: float = 0.5


def config_from_env() -> DeepSeekConfig:
    """Fail fast at boot if the key is absent — the judge is not optional (NET-1: no offline mode)."""
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise RuntimeError(
            "DEEPSEEK_API_KEY is not set (NET-7). The judge service cannot start without it."
        )
    return DeepSeekConfig(
        api_key=api_key,
        base_url=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        model=os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
        timeout_s=float(os.environ.get("DEEPSEEK_TIMEOUT_MS", "20000")) / 1000,
        backoff_s=float(os.environ.get("DEEPSEEK_BACKOFF_MS", "500")) / 1000,
    )
