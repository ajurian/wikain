"""End-to-end: feed → (user authors) → ingest → combine, over a temp artifact dir.

These three entry points mutate `_done.json` and commit batches, and they had no coverage at all in
the TypeScript pipeline. Their unit under test is the whole harness, so they get one file.
"""

import json
from pathlib import Path
from typing import Any, cast

import pytest

from .combine import combine
from .constants import Artifacts
from .stage_a import assemble
from .stage_b import feed, ingest

SOURCE = [
    {
        "word": "specialist",
        "pos": "noun",
        "cefr": "B2",
        "sense_id": "specialist.n.01",
        "sense_hint": "an expert",
        "sense_zipf": "4.1",
        "global_zipf_rank": "42",
    }
]

GENERATED: dict[str, Any] = {
    "sense_id": "specialist_noun_01",
    "intended_sense": "A person with expert knowledge in one narrow branch of a profession.",
    "recognition_meaning": "an expert in one particular branch of a subject",
    "distractors": ["apprentice", "volunteer", "candidate"],
    "clozed_sentence": "The doctor referred her to a _ for treatment.",
    "productive_meaning": "someone who focuses deeply on a single narrow area",
    "model_sentence": "Diagnosing the condition usually requires a specialist.",
    "self_reference_prompt": "When have you needed help from someone who focuses on one field?",
    # The authored output carries per-entry `why` justifications (§A1.2) — ingest strips them.
    "cloze_fit_set": [
        {"lemma": "specialist", "class": "target", "why": "the target itself"},
        {"lemma": "consultant", "class": "same_sense_near_miss", "why": "register-shifted same role"},
        {"lemma": "surgeon", "class": "different_sense_fit", "why": "asserts surgical care instead"},
    ],
    "bounce_gloss": "a person devoted to one narrow branch of a field",
}


@pytest.fixture
def artifacts(tmp_path: Path) -> Artifacts:
    """A Stage-A-assembled artifact dir, ready to feed."""
    a = Artifacts(tmp_path)
    a.out_dir.mkdir(parents=True, exist_ok=True)
    result = assemble(SOURCE)
    for cefr, items in result.manifests.items():
        a.manifest(cefr).write_text(json.dumps(items), encoding="utf-8")
    return a


def author(a: Artifacts, cefr: str, *items: dict[str, Any]) -> None:
    """Stand in for the human step: paste the prompt into a frontier LLM, save the JSON."""
    a.generated_batch(cefr).write_text(json.dumps({"items": list(items)}), encoding="utf-8")


def test_feed_stages_the_pending_items(artifacts: Artifacts) -> None:
    assert feed(artifacts) == 1
    payload = json.loads(artifacts.pending_batch("B2").read_text(encoding="utf-8"))
    assert [i["sense_id"] for i in payload["items"]] == ["specialist_noun_01"]
    # The sense metadata rides along so the generator knows WHICH sense to author.
    assert payload["items"][0]["sense_hint"] == "an expert"


def test_a_clean_level_commits_a_batch_and_marks_it_done(artifacts: Artifacts) -> None:
    feed(artifacts)
    author(artifacts, "B2", GENERATED)

    committed, failed = ingest(artifacts)
    assert (committed, failed) == (1, 0)

    batch = json.loads(artifacts.batch(0).read_text(encoding="utf-8"))
    assert batch[0]["sense_id"] == "specialist_noun_01"
    assert batch[0]["cefr"] == "B2"  # carried, from the manifest
    assert json.loads(artifacts.done.read_text(encoding="utf-8")) == ["specialist_noun_01"]


def test_ingest_strips_fit_set_justifications_and_stamps_the_version(artifacts: Artifacts) -> None:
    """FIT-3: `why` is a scratch field, discarded after generation; FIT-5: the version is stamped
    by ingest (=1), never authored."""
    feed(artifacts)
    author(artifacts, "B2", GENERATED)
    ingest(artifacts)

    batch = json.loads(artifacts.batch(0).read_text(encoding="utf-8"))
    committed = batch[0]
    assert committed["fit_set_version"] == 1
    assert committed["cloze_fit_set"] == [
        {"lemma": "specialist", "class": "target"},
        {"lemma": "consultant", "class": "same_sense_near_miss"},
        {"lemma": "surgeon", "class": "different_sense_fit"},
    ]


def test_an_authored_fit_set_version_is_a_stray_key(artifacts: Artifacts) -> None:
    """FIT-5: provenance is stamped, never trusted from the generator."""
    feed(artifacts)
    author(artifacts, "B2", {**GENERATED, "fit_set_version": 7})

    committed, failed = ingest(artifacts)
    assert (committed, failed) == (0, 1)
    review = json.loads(artifacts.review.read_text(encoding="utf-8"))
    assert any("stray keys" in e for e in review[0]["fails"][0]["errors"])


def test_a_failing_level_commits_nothing_and_lands_in_review(artifacts: Artifacts) -> None:
    """§7.1: a hard fail blocks the level. Its items stay pending, so `feed` re-offers them."""
    feed(artifacts)
    author(artifacts, "B2", {**GENERATED, "model_sentence": "An expert handled the diagnosis."})

    committed, failed = ingest(artifacts)
    assert (committed, failed) == (0, 1)
    assert not artifacts.batch(0).exists()
    assert json.loads(artifacts.done.read_text(encoding="utf-8")) == []

    review = json.loads(artifacts.review.read_text(encoding="utf-8"))
    assert review[0]["kind"] == "batch_failed"
    assert review[0]["fails"][0]["errors"] == [
        "model_sentence does not contain a form of the lemma"
    ]


def test_done_items_are_not_fed_again(artifacts: Artifacts) -> None:
    """Resumability: the loop is `manifest − _done`, so a re-run never duplicates work."""
    feed(artifacts)
    author(artifacts, "B2", GENERATED)
    ingest(artifacts)

    assert feed(artifacts) == 0
    payload = json.loads(artifacts.pending_batch("B2").read_text(encoding="utf-8"))
    assert payload["items"] == []


def test_combine_folds_the_batches_into_items_json(artifacts: Artifacts) -> None:
    feed(artifacts)
    author(artifacts, "B2", GENERATED)
    ingest(artifacts)

    assert combine(artifacts) == 1
    items = cast(list[dict[str, Any]], json.loads(artifacts.items.read_text(encoding="utf-8")))
    assert items[0]["sense_id"] == "specialist_noun_01"
    # The runtime contract: carried + generated + provenance, all present.
    assert items[0]["zipf_rank"] == 42
    assert items[0]["model_sentence"] == GENERATED["model_sentence"]
    assert items[0]["gen_model"] == "manual-frontier-llm"


def test_a_second_ingest_does_not_overwrite_the_first_batch(artifacts: Artifacts) -> None:
    """batch_NNNN is max+1, not a file count — deleting a batch must not clobber a survivor."""
    feed(artifacts)
    author(artifacts, "B2", GENERATED)
    ingest(artifacts)

    # A fresh manifest entry, fed and ingested as a second batch.
    artifacts.manifest("A2").write_text(
        json.dumps(
            [
                {
                    "word": "plan",
                    "lemma": "plan",
                    "part_of_speech": "noun",
                    "sense_id": "plan_noun_01",
                    "cefr": "A2",
                    "zipf": 5.0,
                    "zipf_rank": 10,
                    "synset": "plan.n.01",
                    "sense_hint": "a scheme",
                    "_carried_hash": "abc",
                }
            ]
        ),
        encoding="utf-8",
    )
    feed(artifacts)
    author(
        artifacts,
        "A2",
        {
            **GENERATED,
            "sense_id": "plan_noun_01",
            "clozed_sentence": "She made a careful _ for the trip.",
            "model_sentence": "The team agreed on a detailed plan.",
            "distractors": ["idea", "result", "chance"],
            "cloze_fit_set": [
                {"lemma": "plan", "class": "target", "why": "the target itself"},
                {"lemma": "budget", "class": "different_sense_fit", "why": "fits, but asserts money"},
            ],
        },
    )
    ingest(artifacts)

    assert artifacts.batch(0).exists()
    assert artifacts.batch(1).exists()
    assert combine(artifacts) == 2
