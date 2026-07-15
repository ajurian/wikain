"""The engine's contract with both consumers: Stage C's asserts and the runtime's RL-2/TIER-5."""

from .engine import analyze, contains_lemma_form, forms_of
from .tokens import CONTENT_POS


def test_analyze_lowercases_surface_and_lemma() -> None:
    tokens = analyze("She ABANDONED the plan.")
    assert [t.normal for t in tokens] == ["she", "abandoned", "the", "plan", "."]
    assert tokens[1].lemma == "abandon"


def test_analyze_tags_universal_pos() -> None:
    tokens = analyze("The doctor quickly examined her.")
    by_normal = {t.normal: t.pos for t in tokens}
    assert by_normal["doctor"] == "NOUN"
    assert by_normal["examined"] == "VERB"
    assert by_normal["quickly"] == "ADV"


def test_punctuation_is_not_a_word() -> None:
    tokens = analyze("Yes, really!")
    assert [t.normal for t in tokens if not t.is_word] == [",", "!"]


def test_stopwords_are_flagged() -> None:
    tokens = {t.normal: t.is_stopword for t in analyze("the specialist and a plan")}
    assert tokens["the"] is True
    assert tokens["and"] is True
    assert tokens["specialist"] is False


def test_content_pos_excludes_function_words() -> None:
    tokens = analyze("The specialist examined the rare condition.")
    content = {t.lemma for t in tokens if t.is_word and not t.is_stopword and t.pos in CONTENT_POS}
    assert content == {"specialist", "examine", "rare", "condition"}


def test_forms_of_carries_both_surface_and_lemma() -> None:
    """TIER-5: an inflected answer must match the bare lemma, so both forms are offered."""
    assert "abandon" in forms_of(analyze("They abandoned it."))
    assert "abandoned" in forms_of(analyze("They abandoned it."))


def test_contains_lemma_form_matches_an_inflection() -> None:
    """Stage C's model_sentence presence assert (RL-2 at review time)."""
    assert contains_lemma_form("The team abandoned the climb.", "abandon")


def test_contains_lemma_form_rejects_an_absent_lemma() -> None:
    assert not contains_lemma_form("The team gave up on the climb.", "abandon")


def test_british_spelling_is_not_americanized() -> None:
    """wink normalized `aesthetic`→`esthetic`, making such lemmas impossible to satisfy in Stage C.

    spaCy does not, so the "set model_sentence: null + _flags" workaround that bug forced is gone.
    """
    assert contains_lemma_form("The building has real aesthetic value.", "aesthetic")
    assert contains_lemma_form("She studies archaeology.", "archaeology")
