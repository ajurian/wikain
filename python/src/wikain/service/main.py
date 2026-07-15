"""The Wikain language service — the NLP engine and the cloud judge, behind HTTP.

The TS runtime reaches both through ports it already owns (`SentenceAnalyzer`, `JudgePort`), so from
the application's point of view nothing changed: it still depends on an interface, and infrastructure
still supplies the transport (ARCH-3).

Routes:
    POST /analyze   spaCy tokens — backs RL-2/RL-3 and TIER-5 cued/cloze grading.
    POST /judge     the DeepSeek verdict (JDG-4), or a structured unavailable reason (NET-3/4/5).
    GET  /versions  model + rubric version — the runtime keys the verdict memo on these (MEMO-*), and
                    must know them BEFORE it judges, so it fetches them once at cold start.
    GET  /healthz   liveness. spaCy loads at import, so a healthy instance is a warm instance.

Auth: a shared bearer token (`NLP_SERVICE_TOKEN`). The service holds `DEEPSEEK_API_KEY`; the web app
no longer does (NET-7).
"""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..judge.config import config_from_env
from ..judge.deepseek import DeepSeekJudge
from ..judge.rubric import RUBRIC_VERSION
from ..judge.verdict import JudgeUnavailableError
from ..nlp.engine import analyze


class TokenView(BaseModel):
    """Serialized `NlpToken`. camelCase on the wire to match the TS `NlpToken` the domain owns."""

    normal: str
    lemma: str
    pos: str
    isStopword: bool  # noqa: N815 — the wire contract is the TS domain type, not a Python name.
    isWord: bool  # noqa: N815


class AnalyzeRequest(BaseModel):
    text: str


class AnalyzeResponse(BaseModel):
    tokens: list[TokenView]


class JudgeRequestBody(BaseModel):
    sentence: str = Field(min_length=1)
    lemma: str = Field(min_length=1)
    intendedSense: str | None = None  # noqa: N815
    modelSentence: str | None = None  # noqa: N815


class VersionsResponse(BaseModel):
    modelVersion: str  # noqa: N815
    rubricVersion: str  # noqa: N815


class UnavailableResponse(BaseModel):
    """The judge could not produce a verdict. The runtime maps `reason` back to JudgeUnavailableError."""

    error: Literal["judge_unavailable"] = "judge_unavailable"
    reason: str


def _state(app: FastAPI) -> dict[str, Any]:
    return app.state.deps  # type: ignore[no-any-return]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Fail fast at boot on a missing key/token rather than at the first learner submission.
    config = config_from_env()
    token = os.environ.get("NLP_SERVICE_TOKEN")
    if not token:
        raise RuntimeError("NLP_SERVICE_TOKEN is not set — the service refuses to run unauthenticated.")

    # Warm spaCy during startup so the first request does not pay the model load (NET-2 "instant").
    analyze("warm up the pipeline")

    async with httpx.AsyncClient() as client:
        app.state.deps = {
            "judge": DeepSeekJudge(config, client),
            "token": token,
            "model": config.model,
        }
        yield


app = FastAPI(title="wikain-language-service", lifespan=lifespan)


async def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    expected = _state(app)["token"]
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/versions", dependencies=[Depends(require_token)])
async def versions() -> VersionsResponse:
    return VersionsResponse(modelVersion=_state(app)["model"], rubricVersion=RUBRIC_VERSION)


@app.post("/analyze", dependencies=[Depends(require_token)])
async def analyze_route(body: AnalyzeRequest) -> AnalyzeResponse:
    return AnalyzeResponse(
        tokens=[
            TokenView(
                normal=t.normal,
                lemma=t.lemma,
                pos=t.pos,
                isStopword=t.is_stopword,
                isWord=t.is_word,
            )
            for t in analyze(body.text)
        ]
    )


@app.post("/judge", dependencies=[Depends(require_token)])
async def judge_route(body: JudgeRequestBody) -> Any:
    judge: DeepSeekJudge = _state(app)["judge"]
    try:
        return await judge.judge(
            sentence=body.sentence,
            lemma=body.lemma,
            intended_sense=body.intendedSense,
            model_sentence=body.modelSentence,
        )
    except JudgeUnavailableError as err:
        # 503 + a structured reason. NOT a fabricated verdict: the runtime must leave the card due
        # with no rating (INV-2 / RAT-2), and it needs the reason to pick the right neutral message.
        return JSONResponse(
            status_code=503,
            content=UnavailableResponse(reason=err.reason).model_dump(),
        )
