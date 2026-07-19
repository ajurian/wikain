"""Stage B — Prompt builder (docs/BUILD.md §5). NO API.

Turns each per-CEFR pending batch into a single markdown prompt the user pastes into a frontier-LLM
free chat; the user then hand-authors the returned JSON into `_generated_batch_<cefr>.json`.

The prompt inlines `docs/GENERATION_RULES.md` verbatim — that file is the single source of truth for
what every field must contain, and it is user-authored. This module only frames it.
"""

import json
from typing import Any, cast

from .constants import (
    ARTIFACTS,
    CEFR_LEVELS,
    CLOZE_FIT_RUBRIC_PATH,
    GENERATION_RULES_PATH,
    Artifacts,
)
from .stage_b import read_json
from .types import GENERATED_KEYS

#: The code-enforced Stage C mechanics, restated in prose so the model clears them on the first try.
#: GENERATION_RULES.md governs *content*; these are the asserts that hard-fail a batch (stage_c.py).
HARD_CONSTRAINTS = """<constraints>
a batch is rejected if any is violated:
- model_sentence: embed the bare lemma surface form verbatim; NO first-person tokens (I, I'm, im, my, me, myself).
- self_reference_prompt: contains NO token whose lemma equals the target lemma; ends with "?" (or starts with a verb); < 140 chars.
- clozed_sentence: exactly one "_"; reads cleanly and grammatically when the bare lemma is substituted (no double space, no space before punctuation). Author it CONSTRAINED: the target must be the uniquely natural fill — before finalizing, try 10-15 candidate fills yourself; if more than ~3 non-target words fit naturally, regenerate the sentence with a tighter collocational frame.
- distractors: exactly 3, all distinct, none equal to the target word (case-insensitive).
- recognition_meaning vs productive_meaning: never identical and share no content-word lemma (watch generic words and comparatives — "better"/"stronger" lemmatize to "good"/"strong").
- cloze_fit_set: enumerate EVERY word that plausibly fills the blank and classify each per the rubric above. Entries are {"lemma": ..., "class": ..., "why": ...}: root lemmas, all distinct, class one of target / same_sense_near_miss / different_sense_fit, and "why" a required one-line justification (it is stripped after generation). EXACTLY ONE entry has class "target" and its lemma is the item's own lemma. No same_sense_near_miss lemma may also appear in distractors (a different_sense_fit may). When uncertain between the two miss classes, choose different_sense_fit.
- bounce_gloss: a SHORT paraphrase variant of productive_meaning; contains NO token whose lemma equals the target lemma; not string-identical to recognition_meaning or productive_meaning.
- cued_valid_synonyms: a list of same-sense synonym lemmas of the target, enumerated against the INTENDED SENSE + POS + productive gloss (NOT the cloze frame — this is cued's own set). SAME-SENSE ONLY: a word a learner could produce for THIS exact meaning and be counted meaning-correct (spec/15 CUE-2/CUE-4). Root lemmas, all distinct; NEVER the target lemma itself; NEVER a word that also appears in distractors. Use [] when the sense has no good same-sense synonym — do NOT pad with loose or different-sense words.
- Return ONLY generated fields — never echo carried fields (word, lemma, cefr, part_of_speech, zipf_rank) and never emit fit_set_version (it is stamped at ingest).
- If a rule genuinely cannot be met for an item, set that field to null and add "_flags": ["reason"] — do NOT force it.
</constraints>"""


def build_prompt(payload: dict[str, Any], rules: str, fit_rubric: str) -> str:
    """Build the full prompt for one pending batch: system + "\\n\\n" + user."""
    output_contract = (
        'Return a JSON object of the form `{"items": [ ... ]}`. Each element must have "sense_id" '
        f'plus exactly these keys: {", ".join(GENERATED_KEYS)} (and optional "_flags"). Produce '
        "one element for every input item, in the same order."
    )

    system = (
        "<system_intructions>\n**You are a lexicographer**. Locale: en-US. Follow the "
        "field-authoring rules below EXACTLY — they are the single source of truth for every "
        "field's content and quality, distractors especially.\n</system_intructions>\n\n"
        "=== FIELD-AUTHORING RULES ===\n"
        "<rules>\n" + rules + "</rules>"
        # FIT-3: inlined verbatim; the (future) heal prompt reuses this exact text.
        "\n\n=== CLOZE FIT-SET CLASSIFICATION RUBRIC ===\n"
        "<fit_rubric>\n" + fit_rubric + "</fit_rubric>"
        "\n\n=== GOLD EXAMPLE (one item) ===\n"
        "<gold_example>\n```json\n" +
        json.dumps(payload["gold_example"], indent=2) +
        "\n```\n</gold_example>"
        "\n\n=== HARD CONSTRAINTS ===\n" + HARD_CONSTRAINTS + "\n\n=== OUTPUT ===\n"
        "<output_contract>\n" + output_contract + "\n</output_contract>"
    )

    user = (
        "Generate the GENERATED fields for each of these items. Each item carries a `sense_hint` — "
        "the specific sense (of a possibly multisense word) you MUST author every field for; ignore "
        "other senses of the same word.\n\n<input_dataset>\n```json\n"
        + json.dumps(payload["items"], indent=2)
        + "\n```\n</input_dataset>"
    )

    return f"{system}\n\n{user}"


def _read_required(path: Any, label: str) -> str:
    if not path.exists():
        raise RuntimeError(f"generate: empty/missing {label} at {path}.")
    text: str = path.read_text(encoding="utf-8")
    if not text.strip():
        raise RuntimeError(f"generate: empty/missing {label} at {path}.")
    return text


def generate(artifacts: Artifacts = ARTIFACTS) -> int:
    """Read each per-CEFR pending batch and write its markdown prompt. Returns prompts written."""
    rules = _read_required(GENERATION_RULES_PATH, "generation rules")
    fit_rubric = _read_required(CLOZE_FIT_RUBRIC_PATH, "cloze fit-set rubric")

    artifacts.out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for cefr in CEFR_LEVELS:
        payload = cast(dict[str, Any] | None, read_json(
            artifacts.pending_batch(cefr), None))
        if not payload or not payload.get("items"):
            print(f"generate: {cefr} — no pending items; skipping.")
            continue
        artifacts.prompt(cefr).write_text(
            build_prompt(payload, rules, fit_rubric), encoding="utf-8")
        print(
            f"generate: {cefr} — {len(payload['items'])} items → {artifacts.prompt(cefr)}")
        written += 1

    if written == 0:
        print("generate: nothing to prompt. Run `feed` first.")
    else:
        print(
            "generate: paste each _prompt_<cefr>.md into a frontier LLM, save the result to "
            "_generated_batch_<cefr>.json, then run `ingest`."
        )
    return written
