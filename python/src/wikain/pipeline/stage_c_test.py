"""Stage C auto-asserts (docs/BUILD.md §7.1). These had no test coverage in the TS pipeline."""

from typing import Any, cast

from .stage_c import validate_all, validate_item
from .types import LexicalItem

GOOD: dict[str, Any] = {
    "word": "specialist",
    "lemma": "specialist",
    "part_of_speech": "noun",
    "sense_id": "specialist_noun_01",
    "cefr": "B2",
    "zipf": 4.1,
    "zipf_rank": 42,
    "intended_sense": "A person with expert knowledge in one narrow branch of a profession.",
    "recognition_meaning": "an expert in one particular branch of a subject",
    "distractors": ["apprentice", "volunteer", "candidate"],
    "clozed_sentence": "The doctor referred her to a _ for treatment.",
    "productive_meaning": "someone who focuses deeply on a single narrow area",
    "model_sentence": "Diagnosing the condition usually requires a specialist.",
    "self_reference_prompt": "When have you needed help from someone who focuses on one field?",
    "cloze_fit_set": [
        {"lemma": "specialist", "class": "target"},
        {"lemma": "consultant", "class": "same_sense_near_miss"},
        {"lemma": "surgeon", "class": "different_sense_fit"},
    ],
    "bounce_gloss": "a person devoted to one narrow branch of a field",
    "gen_model": "manual-frontier-llm",
    "gen_spec_version": "gen-spec v3",
    "fit_set_version": 1,
}


def item(**overrides: Any) -> LexicalItem:
    return cast(LexicalItem, {**GOOD, **overrides})


def test_a_well_formed_item_passes_clean() -> None:
    result = validate_item(item())
    assert result.fails == []
    assert result.flags == []


def test_model_sentence_must_contain_a_form_of_the_lemma() -> None:
    """The build-time twin of RL-2 / TIER-5 — this is why one NLP engine is non-negotiable."""
    result = validate_item(item(model_sentence="Diagnosing the condition takes an expert."))
    assert "model_sentence does not contain a form of the lemma" in result.fails


def test_an_inflected_form_satisfies_the_presence_assert() -> None:
    result = validate_item(
        item(lemma="abandon", word="abandon", model_sentence="The crew abandoned the ship.")
    )
    assert "model_sentence does not contain a form of the lemma" not in result.fails


def test_model_sentence_rejects_first_person() -> None:
    result = validate_item(item(model_sentence="I called a specialist yesterday."))
    assert "model_sentence contains I/my/me/myself" in result.fails


def test_self_reference_prompt_must_not_leak_the_lemma() -> None:
    result = validate_item(item(self_reference_prompt="When did you last see a specialist?"))
    assert "self_reference_prompt leaks a form of the lemma" in result.fails


def test_self_reference_prompt_must_be_a_question_or_imperative() -> None:
    result = validate_item(item(self_reference_prompt="You once needed narrow expert help."))
    assert "self_reference_prompt is not a question or imperative" in result.fails


def test_self_reference_prompt_may_be_an_imperative() -> None:
    result = validate_item(item(self_reference_prompt="Describe a time you needed narrow help."))
    assert "self_reference_prompt is not a question or imperative" not in result.fails


def test_self_reference_prompt_is_length_capped() -> None:
    long_prompt = "Describe in detail a moment " + ("that mattered " * 12) + "to you?"
    result = validate_item(item(self_reference_prompt=long_prompt))
    assert any("length" in f for f in result.fails)


def test_cloze_needs_exactly_one_blank() -> None:
    result = validate_item(item(clozed_sentence="The _ referred her to a _ today."))
    assert 'clozed_sentence has 2 "_" (expected 1)' in result.fails


def test_cloze_fill_must_not_produce_a_double_space() -> None:
    result = validate_item(item(clozed_sentence="The doctor referred her to a  _  today."))
    assert "cloze fill produces a double space" in result.fails


def test_cloze_fill_must_not_leave_a_space_before_punctuation() -> None:
    result = validate_item(item(clozed_sentence="She finally became a _ ."))
    assert "cloze fill produces space-before-punctuation" in result.fails


def test_distractors_must_be_three_distinct_and_not_the_target() -> None:
    assert "distractors length 2 != 3" in validate_item(item(distractors=["a", "b"])).fails
    assert "distractors not all distinct" in validate_item(item(distractors=["a", "a", "b"])).fails
    assert (
        "a distractor equals the target word"
        in validate_item(item(distractors=["specialist", "a", "b"])).fails
    )


def test_identical_meanings_fail() -> None:
    result = validate_item(item(recognition_meaning="an expert", productive_meaning="an expert"))
    assert "recognition_meaning equals productive_meaning" in result.fails


def test_a_shared_content_stem_flags_but_does_not_fail() -> None:
    """§7.2: a human eyeballs this; it is not an auto-reject."""
    result = validate_item(
        item(
            recognition_meaning="an expert in one branch of a subject",
            productive_meaning="a narrow expert who studies one thing",
        )
    )
    assert result.fails == []
    assert any("share content stem" in f for f in result.flags)


def test_an_empty_field_fails_unless_the_generator_flagged_it() -> None:
    """§7.3: flag-don't-fix. A null is honest only when its reason is recorded."""
    assert "model_sentence is empty with no _flags" in validate_item(item(model_sentence=None)).fails
    flagged = validate_item(item(model_sentence=None, _flags=["no natural bare-lemma context"]))
    assert flagged.fails == []


def test_a_duplicate_sense_id_fails_the_catalog() -> None:
    results = validate_all([item(), item()])
    assert all("duplicate sense_id in catalog" in r.fails for r in results)


# ---- cloze_fit_set (spec/13 FIT-1 / FIT-2) ----


def fit(lemma: str, cls: str) -> dict[str, str]:
    return {"lemma": lemma, "class": cls}


def test_fit_set_needs_exactly_one_target_entry() -> None:
    """FIT-1: the target lane must exist and be unique."""
    none = validate_item(item(cloze_fit_set=[fit("consultant", "same_sense_near_miss")]))
    assert any("exactly one" in f for f in none.fails)
    two = validate_item(
        item(cloze_fit_set=[fit("specialist", "target"), fit("expert", "target")])
    )
    assert any("exactly one" in f for f in two.fails)


def test_fit_set_target_lemma_must_match_the_item_lemma() -> None:
    result = validate_item(item(cloze_fit_set=[fit("expert", "target")]))
    assert any("target entry lemma" in f for f in result.fails)


def test_fit_set_classes_are_a_controlled_vocabulary() -> None:
    result = validate_item(
        item(cloze_fit_set=[fit("specialist", "target"), fit("expert", "synonym")])
    )
    assert any("class" in f and "synonym" in f for f in result.fails)


def test_fit_set_lemmas_must_be_distinct() -> None:
    result = validate_item(
        item(
            cloze_fit_set=[
                fit("specialist", "target"),
                fit("expert", "same_sense_near_miss"),
                fit("Expert", "different_sense_fit"),
            ]
        )
    )
    assert any("distinct" in f for f in result.fails)


def test_a_near_miss_that_is_also_a_distractor_fails() -> None:
    """FIT-1: the MCQ taught "not this word for this meaning" — a near-miss lane contradicts it."""
    result = validate_item(
        item(cloze_fit_set=[fit("specialist", "target"), fit("apprentice", "same_sense_near_miss")])
    )
    assert any("distractor" in f for f in result.fails)


def test_a_different_sense_fit_may_coincide_with_a_distractor() -> None:
    """"Means something different here" is CONSISTENT with the MCQ's lesson — allowed."""
    result = validate_item(
        item(cloze_fit_set=[fit("specialist", "target"), fit("apprentice", "different_sense_fit")])
    )
    assert result.fails == []


def test_an_oversized_fit_set_flags_but_does_not_fail() -> None:
    """FIT-2: the constraint-pressure signal — the cloze frame admits too many words."""
    entries = [fit("specialist", "target")] + [
        fit(f"word{i}", "different_sense_fit") for i in range(7)
    ]
    result = validate_item(item(cloze_fit_set=entries))
    assert result.fails == []
    assert any("fit set" in f for f in result.flags)


# ---- bounce_gloss (spec/13 FIT-4) ----


def test_bounce_gloss_must_not_leak_the_lemma() -> None:
    """FIT-4: the gloss is shown while the learner must still produce the word."""
    result = validate_item(item(bounce_gloss="the specialist you consult for one field"))
    assert any("bounce_gloss leaks" in f for f in result.fails)


def test_bounce_gloss_must_differ_from_both_glosses() -> None:
    as_recognition = validate_item(
        item(bounce_gloss="an expert in one particular branch of a subject")
    )
    assert any("bounce_gloss" in f and "recognition_meaning" in f for f in as_recognition.fails)
    as_productive = validate_item(
        item(bounce_gloss="someone who focuses deeply on a single narrow area")
    )
    assert any("bounce_gloss" in f and "productive_meaning" in f for f in as_productive.fails)
