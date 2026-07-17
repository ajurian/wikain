"""Shared schema for the content pipeline (docs/BUILD.md §4).

CARRIED fields are facts from the source CSV. Stage A fills them; Stage B (generation) MUST NOT touch
them (§0, §8). GENERATED fields are produced in Stage B by a frontier LLM (manual, via the markdown
prompt `generate.py` writes). These types are the lexical-item contract the v4 runtime consumes —
mirrored by `src/domain/lexicalItem.ts`, whose field names must stay in lockstep.
"""

from typing import Any, Literal, NotRequired, TypedDict

#: §3.1 controlled POS vocabulary.
ControlledPos = Literal[
    "noun", "verb", "adj", "adv", "prep", "pron", "det", "num", "article", "conj", "prefix", "other"
]

#: The source carries A2–C1. `A1`/`None` are retained for runtime-type tolerance (§8 #2).
Cefr = Literal["A1", "A2", "B1", "B2", "C1"] | None

#: spec/13 FIT-1: the three fit-set lanes. Exactly one `target` entry per item.
ClozeFitClass = Literal["target", "same_sense_near_miss", "different_sense_fit"]

#: One classified blank-filler (spec/13 FIT-1). Functional syntax because `class` is a keyword.
#: The generated output additionally carries a per-entry `why` justification — a scratch field
#: `ingest` strips before commit (FIT-3), so it is deliberately NOT part of this committed shape.
ClozeFitEntry = TypedDict("ClozeFitEntry", {"lemma": str, "class": ClozeFitClass})

#: The nine generated fields, in the order the prompt's output contract lists them.
GENERATED_KEYS: tuple[str, ...] = (
    "intended_sense",
    "recognition_meaning",
    "distractors",
    "clozed_sentence",
    "productive_meaning",
    "model_sentence",
    "self_reference_prompt",
    "cloze_fit_set",
    "bounce_gloss",
)


class CarriedFields(TypedDict):
    """Facts from the source CSV (Stage A). Never invented, never regenerated."""

    #: Display form, CSV verbatim.
    word: str
    #: §5.2.1 presence-gate key (lowercased `word`).
    lemma: str
    part_of_speech: ControlledPos
    #: `{lemma}_{pos}_{NN}` — the unique item key; `NN` is a per-(lemma,pos) sense ordinal.
    sense_id: str
    cefr: Cefr
    #: Zipf frequency (SUBTLEX-scale) — higher = more frequent. From `sense_zipf`.
    zipf: float
    #: Frequency rank — 1 = most frequent. From `global_zipf_rank`.
    zipf_rank: int


class LexicalItem(CarriedFields):
    """A fully-merged runtime item: carried + generated + provenance."""

    intended_sense: str | None
    recognition_meaning: str | None
    distractors: list[str] | None
    clozed_sentence: str | None
    productive_meaning: str | None
    model_sentence: str | None
    self_reference_prompt: str | None
    #: spec/13 FIT-1 — every plausible blank-filler, classified.
    cloze_fit_set: list[ClozeFitEntry] | None
    #: spec/13 FIT-4 — the different-sense soft-bounce meaning cue (paraphrase of productive_meaning).
    bounce_gloss: str | None
    #: Set by the generator when a rule could not be satisfied (§5.2, §7.3).
    _flags: NotRequired[list[str]]
    gen_model: str
    gen_spec_version: str
    #: spec/13 FIT-5 — stamped by ingest (=1), never authored; increments on heal-merge/rubric change.
    fit_set_version: int


class ManifestItem(CarriedFields):
    """Carried fields, plus the sense metadata generation needs and a tamper hash.

    `synset` + `sense_hint` are **manifest-only**: they establish item identity (the dedup key is
    `(lemma, pos, synset)`) and disambiguate WHICH sense the LLM must author for, but they are
    deliberately NOT part of the runtime `LexicalItem` — the LLM still authors `intended_sense`, so
    the carried/generated split stays intact.
    """

    #: Raw WordNet synset key from the source (e.g. `desire.v.01`). Not unique across headwords.
    synset: str
    sense_hint: str
    #: Stable hash of the carried fields, computed at Stage A (§0).
    _carried_hash: str


class QuarantineEntry(TypedDict):
    word: str
    lemma: str
    part_of_speech: str
    #: Original, pre-normalization POS string from the source.
    raw_pos: str
    cefr: Cefr
    zipf: float
    zipf_rank: int
    reason: str


#: A hand-authored generated batch is arbitrary JSON until `ingest` proves its shape.
GeneratedItem = dict[str, Any]
