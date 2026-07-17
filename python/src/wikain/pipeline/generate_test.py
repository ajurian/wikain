"""The prompt builder (docs/BUILD.md §5). Ported from build/generate.test.ts."""

from typing import Any

from .generate import build_prompt
from .types import GENERATED_KEYS

PAYLOAD: dict[str, Any] = {
    "gold_example": {"carried": {"word": "specialist"}, "generated": {"intended_sense": "an expert"}},
    "items": [
        {
            "sense_id": "abandon_verb_01",
            "word": "abandon",
            "lemma": "abandon",
            "part_of_speech": "verb",
            "cefr": "B2",
            "zipf_rank": 1200,
            "synset": "abandon.v.01",
            "sense_hint": "forsake, leave behind",
        }
    ],
}

RULES = "# Field-authoring rules\n\nWrite the recognition gloss first.\n"
RUBRIC = "# Cloze Fit-Set Classification Rubric\n\nGate 1 — proposition test.\n"


def test_the_authoring_rules_are_inlined_verbatim() -> None:
    """GENERATION_RULES.md is the single source of truth for field content — the prompt carries it."""
    assert RULES in build_prompt(PAYLOAD, RULES, RUBRIC)


def test_the_fit_rubric_is_inlined_verbatim() -> None:
    """FIT-3: the build prompt and the (future) heal prompt share the rubric byte-for-byte."""
    assert RUBRIC in build_prompt(PAYLOAD, RULES, RUBRIC)


def test_the_gold_example_is_inlined() -> None:
    assert '"word": "specialist"' in build_prompt(PAYLOAD, RULES, RUBRIC)


def test_the_batch_items_are_inlined_with_their_sense_hint() -> None:
    """The hint pins WHICH sense of a multisense word the LLM must author for."""
    prompt = build_prompt(PAYLOAD, RULES, RUBRIC)
    assert '"sense_id": "abandon_verb_01"' in prompt
    assert '"sense_hint": "forsake, leave behind"' in prompt


def test_the_output_contract_names_every_generated_key() -> None:
    prompt = build_prompt(PAYLOAD, RULES, RUBRIC)
    assert ", ".join(GENERATED_KEYS) in prompt


def test_the_hard_constraints_restate_the_stage_c_asserts() -> None:
    """The model must clear the code-enforced gate on the first try, so the gate is spelled out."""
    prompt = build_prompt(PAYLOAD, RULES, RUBRIC)
    assert "exactly 3, all distinct" in prompt
    assert "NO first-person tokens" in prompt


def test_the_hard_constraints_cover_the_fit_set() -> None:
    """FIT-1/FIT-4 mechanics: one target entry, per-entry why, bounce_gloss leak rule."""
    prompt = build_prompt(PAYLOAD, RULES, RUBRIC)
    assert "cloze_fit_set" in prompt
    assert '"why"' in prompt
    assert "bounce_gloss" in prompt


def test_the_system_and_user_sections_are_joined() -> None:
    prompt = build_prompt(PAYLOAD, RULES, RUBRIC)
    assert "</output_contract>\n\nGenerate the GENERATED fields for each of these items." in prompt
