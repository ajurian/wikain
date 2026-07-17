"""The live cloud judge (spec/06 JDG-10, spec/08 NET-*): DeepSeek over HTTPS.

Everything DeepSeek-specific is confined here. The TS runtime never sees it — it sees a `JudgeVerdict`
or a `JudgeUnavailableError` reason, exactly as when this adapter lived in `src/infrastructure/judge/`.

Responsibilities kept here (not in the caller): request shaping with native JSON structured output
(JDG-6 — GBNF/grammar decoding MUST NOT be used) over a prompt-cacheable rubric prefix (JDG-11); the
single backed-off retry (NET-3) — a transport retry is not a learner signal (NET-6), so the caller only
ever sees a final verdict or a raised failure; and error classification (NET-3/4/5).

It NEVER fabricates a verdict: a 2xx body that is not schema-valid is raised as `invalid_response`
rather than guessed (INV-2, lenient-bias JDG-3).
"""

import asyncio
import json
from typing import Any

import httpx

from .config import DeepSeekConfig
from .rubric import SYSTEM_PROMPT, calibration_messages, user_turn
from .verdict import JudgeUnavailableError, JudgeVerdict, parse_verdict

#: `invalid_response` is never retried — a malformed body will not fix itself. The transport classes are.
RETRYABLE: frozenset[str] = frozenset({"transient", "offline", "rate_limited"})


class DeepSeekJudge:
    def __init__(self, config: DeepSeekConfig, client: httpx.AsyncClient | None = None) -> None:
        self._config = config
        # Injected so tests never touch the network, and so the service can share one pooled client.
        self._client = client or httpx.AsyncClient()

    async def judge(
        self,
        *,
        sentence: str,
        lemma: str,
        intended_sense: str | None,
        model_sentence: str | None,
    ) -> JudgeVerdict:
        body = self._request_body(
            sentence=sentence,
            lemma=lemma,
            intended_sense=intended_sense,
            model_sentence=model_sentence,
        )

        attempt = 0
        while True:
            try:
                return await self._attempt(body)
            except JudgeUnavailableError as err:
                if err.reason in RETRYABLE and attempt < self._config.retry_count:
                    attempt += 1
                    await asyncio.sleep(self._config.backoff_s * attempt)
                    continue
                raise

    def _request_body(
        self,
        *,
        sentence: str,
        lemma: str,
        intended_sense: str | None,
        model_sentence: str | None,
    ) -> dict[str, Any]:
        """JDG-6/JDG-10/JDG-11: JSON mode over the cacheable rubric prefix + few-shots + user turn."""
        return {
            "model": self._config.model,
            # JDG-6: JSON mode, not GBNF
            "response_format": {"type": "json_object"},
            "temperature": 0.15,  # JDG-10: the gate must be stable
            "thinking": {"type": "enabled"},
            "messages": [
                # JDG-11: byte-identical every call → prompt-cache hit on the whole prefix.
                {"role": "system", "content": SYSTEM_PROMPT},
                *calibration_messages(),
                {
                    "role": "user",
                    "content": user_turn(
                        lemma=lemma,
                        sentence=sentence,
                        intended_sense=intended_sense,
                        model_sentence=model_sentence,
                    ),
                },
            ],
        }

    async def _attempt(self, body: dict[str, Any]) -> JudgeVerdict:
        try:
            response = await self._client.post(
                f"{self._config.base_url}/chat/completions",
                headers={
                    "content-type": "application/json",
                    # NET-7: the key stays server-side. It never leaves this process.
                    "authorization": f"Bearer {self._config.api_key}",
                },
                json=body,
                timeout=self._config.timeout_s,
            )
        except httpx.TimeoutException as err:
            raise JudgeUnavailableError(
                "transient", "judge request timed out") from err  # NET-3
        except httpx.HTTPError as err:
            raise JudgeUnavailableError(
                "offline", f"judge request failed ({err})") from err  # NET-5

        status = response.status_code
        if status == 429:
            raise JudgeUnavailableError(
                "rate_limited", "judge returned 429")  # NET-4
        if status >= 500:
            raise JudgeUnavailableError(
                "transient", f"judge returned {status}")  # NET-3
        if not 200 <= status < 300:
            # Other 4xx (400/401/403/404) is a config/auth defect. A retry cannot fix a bad key, so
            # fail loud rather than swallow it as a soft "try again" the learner would keep hitting.
            raise RuntimeError(
                f"judge request rejected with {status} (check DeepSeek config/key)"
            )

        try:
            payload = response.json()
        except ValueError as err:
            raise JudgeUnavailableError(
                "invalid_response", "judge response body was not JSON"
            ) from err

        return parse_verdict(_extract_content(payload))


def _extract_content(payload: Any) -> Any:
    """Unwrap the OpenAI-compatible chat-completions envelope and parse the JSON the model returned."""
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices:
        raise JudgeUnavailableError(
            "invalid_response", "no message content in judge response")

    message = choices[0].get("message") if isinstance(
        choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str):
        raise JudgeUnavailableError(
            "invalid_response", "no message content in judge response")

    try:
        return json.loads(content)
    except ValueError as err:
        raise JudgeUnavailableError(
            "invalid_response", "verdict content was not valid JSON") from err
