"""Stage A assembly (docs/BUILD.md §3). Ported from build/stageA.test.ts, plus the new-source rules."""

import re

import pytest

from .stage_a import HaltError, assemble


def row(
    word: str,
    pos: str,
    cefr: str,
    sense_id: str = "x.n.01",
    sense_hint: str = "a gloss",
    zipf: str = "5.0",
    rank: str = "100",
) -> dict[str, str]:
    return {
        "word": word,
        "pos": pos,
        "cefr": cefr,
        "sense_id": sense_id,
        "sense_hint": sense_hint,
        "sense_zipf": zipf,
        "global_zipf_rank": rank,
    }


def test_carried_fields_pass_through_verbatim() -> None:
    """§3.2/§8: carried facts come from the CSV and are never invented."""
    source = [row("Specialist", "noun", "B2", "specialist.n.01", "an expert", "4.1", "42")]
    [item] = assemble(source).manifests["B2"]

    assert item["word"] == "Specialist"
    assert item["lemma"] == "specialist"
    assert item["part_of_speech"] == "noun"
    assert item["cefr"] == "B2"
    assert item["zipf"] == 4.1
    assert item["zipf_rank"] == 42
    assert item["synset"] == "specialist.n.01"
    assert item["sense_hint"] == "an expert"


def test_carried_hash_is_a_sha256_hex_digest() -> None:
    """§0: the hash is what lets ingest prove Stage B did not mutate a carried value."""
    [item] = assemble([row("plan", "noun", "A2")]).manifests["A2"]
    assert re.fullmatch(r"[0-9a-f]{64}", item["_carried_hash"])


def test_source_columns_are_mapped_to_the_carried_names() -> None:
    """The source renamed both numerics; the carried contract (zipf/zipf_rank) must not change."""
    [item] = assemble([row("want", "verb", "A2", zipf="6.5402", rank="1")]).manifests["A2"]
    assert item["zipf"] == 6.5402
    assert item["zipf_rank"] == 1


def test_senses_of_one_lemma_pos_get_frequency_ordered_ordinals() -> None:
    """§3.2: `_01` is the most frequent sense of that (lemma,pos)."""
    items = assemble(
        [
            row("base", "noun", "B1", "base.n.02", "a lower part", rank="900"),
            row("base", "noun", "B1", "base.n.01", "a support", rank="300"),
        ]
    ).manifests["B1"]
    by_synset = {it["synset"]: it["sense_id"] for it in items}
    assert by_synset["base.n.01"] == "base_noun_01"
    assert by_synset["base.n.02"] == "base_noun_02"


def test_one_synset_shared_by_two_headwords_is_not_collapsed() -> None:
    """The source `sense_id` is a synset key and is NOT unique — `want` and `desire` share one."""
    items = assemble(
        [
            row("want", "verb", "A2", "desire.v.01", "feel a desire for", rank="1"),
            row("desire", "verb", "B2", "desire.v.01", "feel a desire for", rank="700"),
        ]
    )
    assert items.manifests["A2"][0]["sense_id"] == "want_verb_01"
    assert items.manifests["B2"][0]["sense_id"] == "desire_verb_01"
    assert items.collisions == []


def test_levels_are_grouped_and_sorted_by_rank() -> None:
    result = assemble(
        [
            row("late", "adj", "A2", "late.a.01", rank="500"),
            row("early", "adj", "A2", "early.a.01", rank="200"),
            row("rare", "adj", "C1", "rare.a.01", rank="900"),
        ]
    )
    assert [it["word"] for it in result.manifests["A2"]] == ["early", "late"]
    assert [it["word"] for it in result.manifests["C1"]] == ["rare"]


def test_out_of_scope_pos_is_quarantined() -> None:
    """§3.4: modals cannot host a self-reference production task — they sit below the frontier."""
    result = assemble([row("ought", "modalv", "B1", "ought.v.01")])
    assert result.manifests["B1"] == []
    assert result.quarantine[0]["reason"] == "out-of-scope-pos"
    assert result.quarantine[0]["raw_pos"] == "modalv"


def test_no_sense_found_sentinel_is_quarantined() -> None:
    """The source's NO_SENSE_FOUND rows carry a bogus synset + gloss.

    The gloss is exactly what the prompt shows the LLM as "the sense to author", so carrying one
    through would generate content keyed to nothing. Quarantine, don't guess (§3.1).
    """
    result = assemble(
        [row("councilor", "noun", "C1", "NO_SENSE_FOUND", "NO_HINT_FOUND")]
    )
    assert result.manifests["C1"] == []
    assert result.quarantine[0]["reason"] == "no-sense-found"


def test_same_sense_at_two_cefr_levels_keeps_the_lower() -> None:
    """§3.5: a merge artifact in the source. The lower CEFR wins and the collision is reported."""
    result = assemble(
        [
            row("race", "noun", "B1", "race.n.01", rank="400"),
            row("race", "noun", "A2", "race.n.01", rank="400"),
        ]
    )
    assert len(result.manifests["A2"]) == 1
    assert result.manifests["B1"] == []
    assert result.collisions[0].key == "race/noun/race.n.01"
    assert result.collisions[0].kept == "A2"
    assert result.collisions[0].dropped == "B1"


def test_unknown_pos_halts() -> None:
    with pytest.raises(HaltError, match=r"unknown POS"):
        assemble([row("whatever", "gerund", "B1")])


def test_invalid_cefr_halts() -> None:
    with pytest.raises(HaltError, match=r"invalid/empty CEFR"):
        assemble([row("plan", "noun", "")])


def test_non_numeric_frequency_halts() -> None:
    with pytest.raises(HaltError, match=r"non-numeric"):
        assemble([row("plan", "noun", "A2", zipf="N/A")])


def test_in_scope_a1_halts() -> None:
    """A1 is type-tolerated but the source must not carry it into a manifest (§8 #2)."""
    with pytest.raises(HaltError, match=r"out-of-range CEFR"):
        assemble([row("the", "noun", "A1")])
