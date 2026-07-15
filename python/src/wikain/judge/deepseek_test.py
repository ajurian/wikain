"""The judge transport (spec/06 JDG-*, spec/08 NET-3/4/5/6). No network: the httpx transport is faked."""

import json
from typing import Any

import httpx
import pytest

from .config import DeepSeekConfig
from .deepseek import DeepSeekJudge
from .verdict import JudgeUnavailableError

PASSING = {
    "used_in_target_sense": True,
    "grammatical": True,
    "detected_sense": "to give up completely",
    "intended_sense": "to give up completely",
    "collocation_natural": True,
    "register_fit": "ok",
    "replacements": [],
    "corrected_sentence": "She abandoned the plan.",
    "enrichment_suggestion": None,
    "one_line_feedback": "Nicely done.",
}


def completion(verdict: dict[str, Any]) -> dict[str, Any]:
    """The OpenAI-compatible envelope DeepSeek returns."""
    return {"choices": [{"message": {"content": json.dumps(verdict)}}]}


def judge_with(handler: Any, *, backoff_s: float = 0.0) -> DeepSeekJudge:
    config = DeepSeekConfig(api_key="test-key", backoff_s=backoff_s)
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return DeepSeekJudge(config, client)


async def call(judge: DeepSeekJudge) -> Any:
    return await judge.judge(
        sentence="She abandoned the plan.",
        lemma="abandon",
        intended_sense="to give up completely",
        model_sentence="The crew abandoned the ship.",
    )


@pytest.mark.asyncio
async def test_a_valid_verdict_is_returned() -> None:
    judge = judge_with(lambda _req: httpx.Response(200, json=completion(PASSING)))
    verdict = await call(judge)
    assert verdict["used_in_target_sense"] is True
    assert verdict["grammatical"] is True


@pytest.mark.asyncio
async def test_the_rubric_prefix_is_sent_ahead_of_the_user_turn() -> None:
    """JDG-11: the cacheable prefix (system + few-shots) must precede the per-request turn."""
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, json=completion(PASSING))

    await call(judge_with(handler))
    roles = [m["role"] for m in seen["messages"]]
    assert roles[0] == "system"
    assert roles[-1] == "user"
    assert seen["temperature"] == 0  # JDG-10: the gate must be stable
    assert seen["response_format"] == {"type": "json_object"}  # JDG-6: never GBNF
    assert "abandon" in seen["messages"][-1]["content"]


@pytest.mark.asyncio
async def test_a_5xx_is_retried_once_then_surfaces_as_transient() -> None:
    """NET-3: retry once with backoff; on persistent failure the card stays due with NO rating."""
    calls = 0

    def handler(_req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503)

    with pytest.raises(JudgeUnavailableError) as err:
        await call(judge_with(handler))
    assert err.value.reason == "transient"
    assert calls == 2  # the original + exactly one retry (CLOUD_RETRY_COUNT = 1)


@pytest.mark.asyncio
async def test_a_retry_that_succeeds_is_invisible_to_the_caller() -> None:
    """NET-6: a transport retry is not a learner signal — only the final verdict surfaces."""
    calls = 0

    def handler(_req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(500)
        return httpx.Response(200, json=completion(PASSING))

    verdict = await call(judge_with(handler))
    assert verdict["used_in_target_sense"] is True
    assert calls == 2


@pytest.mark.asyncio
async def test_a_429_is_rate_limited() -> None:
    """NET-4."""
    with pytest.raises(JudgeUnavailableError) as err:
        await call(judge_with(lambda _req: httpx.Response(429)))
    assert err.value.reason == "rate_limited"


@pytest.mark.asyncio
async def test_a_timeout_is_transient() -> None:
    """NET-3."""

    def handler(_req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("too slow")

    with pytest.raises(JudgeUnavailableError) as err:
        await call(judge_with(handler))
    assert err.value.reason == "transient"


@pytest.mark.asyncio
async def test_no_connectivity_is_offline() -> None:
    """NET-5."""

    def handler(_req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route to host")

    with pytest.raises(JudgeUnavailableError) as err:
        await call(judge_with(handler))
    assert err.value.reason == "offline"


@pytest.mark.asyncio
async def test_a_missing_gate_is_invalid_response_never_a_fabricated_verdict() -> None:
    """JDG-6/INV-2: a 2xx body without a boolean gate is refused, not defaulted into a pass or fail."""
    broken = {k: v for k, v in PASSING.items() if k != "grammatical"}
    with pytest.raises(JudgeUnavailableError) as err:
        await call(judge_with(lambda _req: httpx.Response(200, json=completion(broken))))
    assert err.value.reason == "invalid_response"


@pytest.mark.asyncio
async def test_an_invalid_response_is_not_retried() -> None:
    """A malformed body will not fix itself — retrying would just spend a second paid call."""
    calls = 0

    def handler(_req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"choices": []})

    with pytest.raises(JudgeUnavailableError):
        await call(judge_with(handler))
    assert calls == 1


@pytest.mark.asyncio
async def test_a_4xx_config_error_fails_loud_rather_than_looking_transient() -> None:
    """A bad key must not masquerade as "try again" — the learner would hit it forever."""
    with pytest.raises(RuntimeError, match="check DeepSeek config/key"):
        await call(judge_with(lambda _req: httpx.Response(401)))
