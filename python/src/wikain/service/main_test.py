"""The service's HTTP contract with the TS runtime (the shapes `HttpNlp` and `HttpJudge` consume)."""

import json
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from ..judge.deepseek import DeepSeekJudge
from ..judge.rubric import RUBRIC_VERSION
from .main import app

TOKEN = "test-token"
AUTH = {"authorization": f"Bearer {TOKEN}"}

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

JUDGE_BODY = {
    "sentence": "She abandoned the plan.",
    "lemma": "abandon",
    "intendedSense": "to give up completely",
    "modelSentence": "The crew abandoned the ship.",
}


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("NLP_SERVICE_TOKEN", TOKEN)
    with TestClient(app) as c:
        yield c


def fake_judge(c: TestClient, handler: Any) -> None:
    """Swap only the DeepSeek transport; every other layer of the service stays real."""
    from ..judge.config import DeepSeekConfig

    app.state.deps["judge"] = DeepSeekJudge(
        DeepSeekConfig(api_key="test-key", backoff_s=0.0),
        httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )


def completion(verdict: dict[str, Any]) -> dict[str, Any]:
    return {"choices": [{"message": {"content": json.dumps(verdict)}}]}


def test_healthz_needs_no_token(client: TestClient) -> None:
    assert client.get("/healthz").status_code == 200


def test_a_missing_token_is_rejected(client: TestClient) -> None:
    """NET-7: the service holds the DeepSeek key, so it must not answer to anyone who asks."""
    assert client.post("/analyze", json={"text": "hello"}).status_code == 401
    assert client.post("/judge", json=JUDGE_BODY).status_code == 401


def test_analyze_returns_the_token_shape_the_runtime_domain_owns(client: TestClient) -> None:
    """The wire keys are the TS `NlpToken` fields (src/domain/review/ruleLayer.ts)."""
    r = client.post("/analyze", json={"text": "She abandoned it."}, headers=AUTH)
    assert r.status_code == 200
    tokens = r.json()["tokens"]
    assert set(tokens[0]) == {"normal", "lemma", "pos", "isStopword", "isWord"}

    by_normal = {t["normal"]: t for t in tokens}
    assert by_normal["abandoned"]["lemma"] == "abandon"  # TIER-5 / RL-2 rests on this
    assert by_normal["abandoned"]["pos"] == "VERB"
    assert by_normal["."]["isWord"] is False


def test_versions_reports_what_the_verdict_memo_is_keyed_on(client: TestClient) -> None:
    """MEMO-*: the runtime needs these BEFORE it judges, so it fetches them once at cold start."""
    r = client.get("/versions", headers=AUTH)
    assert r.status_code == 200
    assert r.json() == {"modelVersion": "deepseek-v4-flash", "rubricVersion": RUBRIC_VERSION}


def test_judge_returns_the_verdict(client: TestClient) -> None:
    fake_judge(client, lambda _req: httpx.Response(200, json=completion(PASSING)))
    r = client.post("/judge", json=JUDGE_BODY, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["used_in_target_sense"] is True
    assert r.json()["corrected_sentence"] == "She abandoned the plan."


def test_an_unavailable_judge_returns_a_reason_not_a_verdict(client: TestClient) -> None:
    """INV-2: a transport failure must never become a fabricated Again. 503 + the reason."""
    fake_judge(client, lambda _req: httpx.Response(429))
    r = client.post("/judge", json=JUDGE_BODY, headers=AUTH)
    assert r.status_code == 503
    assert r.json() == {"error": "judge_unavailable", "reason": "rate_limited"}


def test_a_persistent_5xx_surfaces_as_transient(client: TestClient) -> None:
    fake_judge(client, lambda _req: httpx.Response(500))
    r = client.post("/judge", json=JUDGE_BODY, headers=AUTH)
    assert r.status_code == 503
    assert r.json()["reason"] == "transient"


def test_a_malformed_judge_body_is_rejected(client: TestClient) -> None:
    r = client.post("/judge", json={"sentence": "", "lemma": ""}, headers=AUTH)
    assert r.status_code == 422
