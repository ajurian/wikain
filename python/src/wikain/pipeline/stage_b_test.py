"""Stage B feed/ingest (docs/BUILD.md §5, §6). `feed` and `ingest` had NO tests in the TS pipeline.

The §0 rule — Stage B must never write, overwrite, or infer a carried field — is what these pin.
"""

from typing import Any, cast

from .stage_b import merge_level
from .stage_c import validate_item
from .types import ManifestItem

CARRIED: dict[str, Any] = {
    "word": "specialist",
    "lemma": "specialist",
    "part_of_speech": "noun",
    "sense_id": "specialist_noun_01",
    "cefr": "B2",
    "zipf": 4.1,
    "zipf_rank": 42,
    "synset": "specialist.n.01",
    "sense_hint": "an expert",
    "_carried_hash": "deadbeef",
}

GENERATED: dict[str, Any] = {
    "sense_id": "specialist_noun_01",
    "intended_sense": "A person with expert knowledge in one narrow branch of a profession.",
    "recognition_meaning": "an expert in one particular branch of a subject",
    "distractors": ["apprentice", "volunteer", "candidate"],
    "clozed_sentence": "The doctor referred her to a _ for treatment.",
    "productive_meaning": "someone who focuses deeply on a single narrow area",
    "model_sentence": "Diagnosing the condition usually requires a specialist.",
    "self_reference_prompt": "When have you needed help from someone who focuses on one field?",
    "cloze_fit_set": [
        {"lemma": "specialist", "class": "target", "why": "the target itself"},
        {"lemma": "surgeon", "class": "different_sense_fit", "why": "asserts surgical care instead"},
    ],
    "bounce_gloss": "a person devoted to one narrow branch of a field",
}

PENDING = [{"sense_id": "specialist_noun_01"}]


def by_id() -> dict[str, ManifestItem]:
    return {"specialist_noun_01": cast(ManifestItem, dict(CARRIED))}


def test_carried_fields_come_from_the_manifest_not_the_generator() -> None:
    """§0: the generator is never the authority for a fact."""
    result = merge_level(PENDING, by_id(), {"items": [dict(GENERATED)]})
    [item] = result.merged
    assert result.fails == []
    assert item["cefr"] == "B2"
    assert item["zipf"] == 4.1
    assert item["word"] == "specialist"


def test_provenance_is_stamped_on_every_merged_item() -> None:
    [item] = merge_level(PENDING, by_id(), {"items": [dict(GENERATED)]}).merged
    assert item["gen_model"] == "manual-frontier-llm"
    assert item["gen_spec_version"] == "gen-spec v3"


def test_a_generator_echoing_a_carried_field_is_a_hard_fail() -> None:
    """§0: this is the check that stops a hallucinated CEFR or zipf from entering the catalog."""
    result = merge_level(PENDING, by_id(), {"items": [{**GENERATED, "cefr": "A2"}]})
    assert result.merged == []
    assert "generated output has stray keys: cefr" in result.fails[0]["errors"][0]


def test_a_missing_generated_item_fails_that_sense_id() -> None:
    result = merge_level(PENDING, by_id(), {"items": []})
    assert result.fails[0]["errors"] == ["no generated output for this sense_id"]


def test_an_unknown_sense_id_fails() -> None:
    result = merge_level([{"sense_id": "ghost_noun_01"}], by_id(), {"items": []})
    assert result.fails[0]["errors"] == ["sense_id not in manifest"]


def test_stage_c_failures_surface_on_the_level() -> None:
    """A level with any hard fail commits nothing — that is what `ingest` keys off."""
    bad = {**GENERATED, "model_sentence": "Diagnosing the condition takes an expert."}
    result = merge_level(PENDING, by_id(), {"items": [bad]})
    assert result.fails[0]["errors"] == ["model_sentence does not contain a form of the lemma"]


def test_an_absent_generated_field_becomes_null_never_invented() -> None:
    partial = {k: v for k, v in GENERATED.items() if k != "model_sentence"}
    partial["_flags"] = ["no natural bare-lemma context"]
    [item] = merge_level(PENDING, by_id(), {"items": [partial]}).merged
    assert item["model_sentence"] is None
    assert item["_flags"] == ["no natural bare-lemma context"]
    assert validate_item(item).fails == []
