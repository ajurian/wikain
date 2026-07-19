"""Stage C — Validation (docs/BUILD.md §7.1). Deterministic auto-asserts over generated items.

`validate_item` is reused by Stage B's `ingest`; `validate_all` adds the catalog-wide asserts and is
runnable standalone over a JSON array of items. A `fail` means the item must not ship; a `flag` means
a human must eyeball it (§7.2 / §7.3) but it is not an auto-reject.

These asserts run on `wikain.nlp` — **the same engine the runtime grades with**. That is the whole
point: the lemma-presence assert below is the build-time twin of RL-2 / TIER-5, so an item that
passes here cannot be bounced as "word absent" at review (INV-2).
"""

import re
from dataclasses import dataclass, field
from typing import get_args

from ..nlp.engine import analyze, contains_lemma_form
from ..nlp.tokens import CONTENT_POS
from .constants import FIT_SET_FLAG_THRESHOLD, VALID_CEFR
from .types import ClozeFitClass, LexicalItem

#: spec/13 FIT-1: the controlled fit-set class vocabulary, derived from the one type.
VALID_FIT_CLASSES: frozenset[str] = frozenset(get_args(ClozeFitClass))

#: First-person tokens a `model_sentence` must never contain (§5 — the model sentence is not the
#: learner's own; the self-reference prompt is where "you" enters).
FIRST_PERSON: frozenset[str] = frozenset({"i", "i'm", "im", "my", "me", "myself"})

MAX_PROMPT_CHARS = 140
DISTRACTOR_COUNT = 3


@dataclass(slots=True)
class ValidationResult:
    sense_id: str
    fails: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


def content_lemmas(text: str) -> set[str]:
    """Content-word lemmas of `text` (lowercased), minus stop words and punctuation."""
    return {
        t.lemma
        for t in analyze(text)
        if t.is_word and not t.is_stopword and t.pos in CONTENT_POS
    }


def has_first_person(text: str) -> bool:
    return any(t.normal in FIRST_PERSON for t in analyze(text))


def first_token_is_verb(text: str) -> bool:
    tokens = analyze(text)
    return bool(tokens) and tokens[0].pos == "VERB"


def validate_item(item: LexicalItem) -> ValidationResult:
    """Every §7.1 auto-assert for one item, with its fail/flag severity."""
    result = ValidationResult(sense_id=item.get("sense_id", ""))
    fails, flags = result.fails, result.flags
    flagged = item.get("_flags") or []
    lemma = item["lemma"].lower()

    def present(name: str) -> bool:
        """A null generated field is only allowed when the generator recorded a reason (§7.3)."""
        value = item.get(name)
        empty = value is None or (isinstance(value, str) and value.strip() == "")
        if empty:
            if not flagged:
                fails.append(f"{name} is empty with no _flags")
            return False
        return True

    # ---- carried-field sanity (the carried/generated diff itself happens in ingest) ----
    for name in ("lemma", "word", "part_of_speech", "sense_id"):
        value = item.get(name)
        if not (isinstance(value, str) and value.strip()):
            fails.append(f"{name} empty")
    cefr = item.get("cefr")
    if not (cefr is None or cefr in VALID_CEFR):
        fails.append(f"cefr not in {{A1..C1, null}}: {cefr}")

    # ---- distractors: exactly 3, distinct, none equal to the target ----
    if present("distractors"):
        distractors = item["distractors"] or []
        normalized = [d.lower().strip() for d in distractors]
        if len(normalized) != DISTRACTOR_COUNT:
            fails.append(f"distractors length {len(normalized)} != {DISTRACTOR_COUNT}")
        if len(set(normalized)) != len(normalized):
            fails.append("distractors not all distinct")
        if item["word"].lower() in normalized:
            fails.append("a distractor equals the target word")

    # ---- clozed_sentence: exactly one "_", reads cleanly once the bare lemma is substituted ----
    if present("clozed_sentence"):
        cloze = item["clozed_sentence"] or ""
        underscores = cloze.count("_")
        if underscores != 1:
            fails.append(f'clozed_sentence has {underscores} "_" (expected 1)')
        else:
            filled = cloze.replace("_", item["lemma"], 1)
            if re.search(r"\s{2,}", filled):
                fails.append("cloze fill produces a double space")
            if re.search(r"\s[.,;:!?]", filled):
                fails.append("cloze fill produces space-before-punctuation")

    # ---- model_sentence: no first person; contains a form of the lemma ----
    if present("model_sentence"):
        sentence = item["model_sentence"] or ""
        if has_first_person(sentence):
            fails.append("model_sentence contains I/my/me/myself")
        if not contains_lemma_form(sentence, lemma):
            fails.append("model_sentence does not contain a form of the lemma")

    # ---- self_reference_prompt: no lemma leak; question or imperative; short ----
    if present("self_reference_prompt"):
        prompt = item["self_reference_prompt"] or ""
        if contains_lemma_form(prompt, lemma):
            fails.append("self_reference_prompt leaks a form of the lemma")
        if not (prompt.strip().endswith("?") or first_token_is_verb(prompt)):
            fails.append("self_reference_prompt is not a question or imperative")
        if len(prompt) > MAX_PROMPT_CHARS:
            fails.append(f"self_reference_prompt length {len(prompt)} > {MAX_PROMPT_CHARS}")

    # ---- the two glosses must be distinct; a shared content stem is a flag, not a fail ----
    if present("recognition_meaning") and present("productive_meaning"):
        recognition = item["recognition_meaning"] or ""
        productive = item["productive_meaning"] or ""
        if recognition.strip().lower() == productive.strip().lower():
            fails.append("recognition_meaning equals productive_meaning")
        shared = sorted(content_lemmas(recognition) & content_lemmas(productive))
        if shared:
            flags.append(f"meanings share content stem(s): {', '.join(shared)}")

    # ---- cloze_fit_set: one target, controlled classes, distinct lemmas, no near-miss/distractor
    # ---- collision (spec/13 FIT-1); oversize → flag, the FIT-2 constraint-pressure signal ----
    if present("cloze_fit_set"):
        entries = item["cloze_fit_set"] or []
        lemmas = [str(e.get("lemma", "")).lower().strip() for e in entries]
        classes = [str(e.get("class", "")) for e in entries]

        for cls in classes:
            if cls not in VALID_FIT_CLASSES:
                fails.append(f'cloze_fit_set class not in the controlled vocabulary: "{cls}"')
        targets = [lm for lm, cls in zip(lemmas, classes, strict=True) if cls == "target"]
        if len(targets) != 1:
            fails.append(f"cloze_fit_set needs exactly one target entry (found {len(targets)})")
        elif targets[0] != lemma:
            fails.append(f'cloze_fit_set target entry lemma "{targets[0]}" != item lemma "{lemma}"')
        if len(set(lemmas)) != len(lemmas):
            fails.append("cloze_fit_set lemmas not all distinct")

        # A near-miss that the MCQ taught as WRONG for this meaning contradicts the pedagogy; a
        # different_sense_fit may coincide ("means something different here" agrees with the MCQ).
        distractor_set = {d.lower().strip() for d in (item.get("distractors") or [])}
        for lm, cls in zip(lemmas, classes, strict=True):
            if cls == "same_sense_near_miss" and lm in distractor_set:
                fails.append(f'same_sense_near_miss "{lm}" is also a distractor')

        non_target = len(entries) - len(targets)
        if non_target > FIT_SET_FLAG_THRESHOLD:
            flags.append(
                f"fit set has {non_target} non-target entries (> {FIT_SET_FLAG_THRESHOLD}) — "
                "the cloze frame may be under-constrained"
            )

    # ---- bounce_gloss: shown while the learner must still produce the word (spec/13 FIT-4) ----
    if present("bounce_gloss"):
        gloss = item["bounce_gloss"] or ""
        if contains_lemma_form(gloss, lemma):
            fails.append("bounce_gloss leaks a form of the lemma")
        normalized_gloss = gloss.strip().lower()
        for other in ("recognition_meaning", "productive_meaning"):
            value = item.get(other)
            if isinstance(value, str) and normalized_gloss == value.strip().lower():
                fails.append(f"bounce_gloss is identical to {other}")

    # ---- cued_valid_synonyms: the cued soft-bounce set (spec/15 CUE-3); same-sense only, distinct,
    # ---- never the target lemma, never an MCQ distractor (CUE-2/CUE-4). `[]` is valid (no synonym) ----
    if present("cued_valid_synonyms"):
        syns = item["cued_valid_synonyms"] or []
        if not isinstance(syns, list) or not all(isinstance(s, str) for s in syns):
            fails.append("cued_valid_synonyms must be a list of string lemmas")
        else:
            normalized = [s.lower().strip() for s in syns]
            if any(s == "" for s in normalized):
                fails.append("cued_valid_synonyms contains an empty lemma")
            if len(set(normalized)) != len(normalized):
                fails.append("cued_valid_synonyms lemmas not all distinct")
            if lemma in normalized:
                fails.append("cued_valid_synonyms must not contain the target lemma (CUE-4)")
            distractor_set = {d.lower().strip() for d in (item.get("distractors") or [])}
            for s in normalized:
                if s in distractor_set:
                    fails.append(f'cued_valid_synonyms "{s}" is also a distractor (CUE-4)')

    present("intended_sense")
    return result


def validate_all(items: list[LexicalItem]) -> list[ValidationResult]:
    """Validate a whole catalog, adding the cross-item assert `validate_item` cannot see (§7.1)."""
    results = [validate_item(it) for it in items]

    counts: dict[str, int] = {}
    for it in items:
        counts[it["sense_id"]] = counts.get(it["sense_id"], 0) + 1
    for r in results:
        if counts.get(r.sense_id, 0) > 1:
            r.fails.append("duplicate sense_id in catalog")
    return results
