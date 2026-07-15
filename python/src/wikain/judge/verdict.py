"""The judge's success and failure types (spec/06 JDG-4, spec/08 NET-3/4/5).

This is the wire contract with the TS runtime: `src/domain/review/verdict.ts` declares the same shape,
and the four `UnavailableReason`s map 1:1 onto `JudgeUnavailableReason` in
`src/application/ports/judge.ts`. Both gates (`used_in_target_sense`, `grammatical`) are load-bearing —
a verdict is NEVER fabricated when they are missing (INV-2, JDG-3).
"""

from typing import Any, Literal, TypedDict

RegisterFit = Literal["ok", "informal", "formal", "off"]
ReplacementReason = Literal["grammar", "collocation", "register", "sense"]

REGISTER_FITS: frozenset[str] = frozenset({"ok", "informal", "formal", "off"})
REPLACEMENT_REASONS: frozenset[str] = frozenset({"grammar", "collocation", "register", "sense"})

#: Why the judge could not return a verdict. All map to the same persistence outcome on the runtime
#: side — no rating, no scheduler call, card stays due (INV-2 / RAT-2) — but carry distinct reasons so
#: the UI can show the right neutral message.
UnavailableReason = Literal[
    "transient",  # NET-3: timeout / 5xx / transient network error past the one retry
    "rate_limited",  # NET-4: 429
    "offline",  # NET-5: no connectivity at submit time
    "invalid_response",  # JDG-6/JDG-3: a 2xx body that is not a schema-valid verdict
]


class Replacement(TypedDict):
    find: str
    replace: str
    reason: ReplacementReason


class JudgeVerdict(TypedDict):
    used_in_target_sense: bool  # GATE
    detected_sense: str
    intended_sense: str
    grammatical: bool  # GATE
    collocation_natural: bool  # advisory
    register_fit: RegisterFit  # advisory
    replacements: list[Replacement]
    corrected_sentence: str
    enrichment_suggestion: str | None
    one_line_feedback: str


class JudgeUnavailableError(Exception):
    """No verdict could be obtained. NOT a rule-layer bounce — that is malformed learner input.

    This is a transport (or schema) failure on well-formed input, and the runtime must leave the card
    due with no rating rather than fabricate an `Again` (INV-2, RAT-2).
    """

    def __init__(self, reason: UnavailableReason, message: str | None = None) -> None:
        super().__init__(message or f"judge unavailable: {reason}")
        self.reason: UnavailableReason = reason


def _as_str(value: Any) -> str:
    return value if isinstance(value, str) else ""


def parse_replacements(value: Any) -> list[Replacement]:
    """Keep only well-formed edits; a malformed one is dropped, never guessed at (EDIT-*)."""
    if not isinstance(value, list):
        return []
    out: list[Replacement] = []
    for r in value:
        if not isinstance(r, dict):
            continue
        find, replace, reason = r.get("find"), r.get("replace"), r.get("reason")
        if not isinstance(find, str) or not find:
            continue
        if not isinstance(replace, str) or reason not in REPLACEMENT_REASONS:
            continue
        out.append({"find": find, "replace": replace, "reason": reason})
    return out


def parse_verdict(raw: Any) -> JudgeVerdict:
    """Map the model's JSON → a JudgeVerdict (JDG-4).

    The two gate booleans are validated **strictly**: a missing or non-boolean gate raises
    `invalid_response` rather than being defaulted. Defaulting a gate would invent a pass or a fail out
    of nothing, and the whole scheduler hangs off it. The advisory fields are presentation-only
    (JDG-5), so a missing one is safely defaulted instead of failing the whole verdict.
    """
    if not isinstance(raw, dict):
        raise JudgeUnavailableError("invalid_response", "verdict was not an object")

    used = raw.get("used_in_target_sense")
    grammatical = raw.get("grammatical")
    if not isinstance(used, bool) or not isinstance(grammatical, bool):
        raise JudgeUnavailableError("invalid_response", "verdict is missing a boolean gate field")

    raw_register = raw.get("register_fit")
    register: RegisterFit = raw_register if raw_register in REGISTER_FITS else "ok"
    collocation = raw.get("collocation_natural")
    enrichment = raw.get("enrichment_suggestion")

    return {
        "used_in_target_sense": used,
        "grammatical": grammatical,
        "detected_sense": _as_str(raw.get("detected_sense")),
        "intended_sense": _as_str(raw.get("intended_sense")),
        "collocation_natural": collocation if isinstance(collocation, bool) else True,
        "register_fit": register,
        "replacements": parse_replacements(raw.get("replacements")),
        "corrected_sentence": _as_str(raw.get("corrected_sentence")),
        "enrichment_suggestion": enrichment if isinstance(enrichment, str) else None,
        "one_line_feedback": _as_str(raw.get("one_line_feedback")),
    }
