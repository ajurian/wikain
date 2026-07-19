"""Stage B — Generation harness (docs/BUILD.md §5, §6). The deterministic shell around generation.

  feed    → per CEFR level, select the next BATCH_SIZE pending items (that level's manifest minus
            _done.json) and write _pending_batch_<cefr>.json. `generate` then turns each into a
            markdown prompt the user pastes into a frontier LLM.
  ingest  → for every level with a hand-authored _generated_batch_<cefr>.json, merge generated +
            carried, stamp provenance, run Stage C, and commit each level as its own batch_NNNN.json.
            A level that fails Stage C is recorded to _review.json and does not block the others.

Resumable: a crashed or partial run never regenerates or duplicates (anything in _done.json is
skipped). Generation itself is a manual human step — nothing here calls an LLM.
"""

import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from .constants import (
    ARTIFACTS,
    BATCH_SIZE,
    CEFR_LEVELS,
    GEN_MODEL,
    GEN_SPEC_VERSION,
    GENERATION_RULES_PATH,
    INITIAL_FIT_SET_VERSION,
    Artifacts,
)
from .stage_c import validate_item
from .types import GENERATED_KEYS, GeneratedItem, LexicalItem, ManifestItem

#: The one-shot shown to the generator (§5). Carried context on the left, the seven fields it must
#: author on the right — so the shape of the answer is unambiguous before the batch is read.
GOLD_EXAMPLE: dict[str, Any] = {
    "carried": {
        "word": "specialist",
        "part_of_speech": "noun",
        "cefr": "B2",
        "zipf_rank": 4200,
        "synset": "specialist.n.01",
        "sense_hint": "an expert who is devoted to one occupation or branch of learning",
    },
    "generated": {
        "intended_sense": (
            "A person who concentrates on and has expert knowledge or skill in one particular "
            "branch of a profession, subject, or activity."
        ),
        "recognition_meaning": "an expert in one particular branch of a subject or profession",
        "distractors": ["apprentice", "volunteer", "candidate"],
        "clozed_sentence": (
            "The doctor referred her to a _ for treatment of her heart condition."
        ),
        "productive_meaning": (
            "someone who focuses deeply on a single, narrow area rather than knowing a little "
            "about many things"
        ),
        "model_sentence": (
            "Diagnosing such a rare condition usually requires a specialist rather than a general "
            "practitioner."
        ),
        "self_reference_prompt": (
            "When have you needed help from someone who focuses on just one narrow field?"
        ),
        # spec/13 FIT-1/FIT-3: every plausible blank-filler, classified per the rubric, each with a
        # one-line `why` (required in the output; stripped by ingest before commit).
        "cloze_fit_set": [
            {"lemma": "specialist", "class": "target", "why": "the target itself"},
            {
                "lemma": "expert",
                "class": "same_sense_near_miss",
                "why": (
                    "same referral-to-an-authority situation, but a looser hypernym — loses the "
                    "one-narrow-branch component"
                ),
            },
            {
                "lemma": "consultant",
                "class": "same_sense_near_miss",
                "why": "same situation and roles; register-shifted hospital term for the same doctor",
            },
            {
                "lemma": "surgeon",
                "class": "different_sense_fit",
                "why": (
                    "fills the blank naturally but asserts a different state of affairs — surgical "
                    "treatment, not expertise in one branch"
                ),
            },
        ],
        # spec/13 FIT-4: a short paraphrase of productive_meaning; never repeats either gloss and
        # never contains a form of the target (it is shown while the learner must still produce it).
        "bounce_gloss": "a person devoted to one narrow branch of a field",
        # spec/15 CUE-3: same-sense synonym lemmas enumerated against THE GLOSS (not the cloze frame,
        # CUE-2). Same-sense only (CUE-4); never the target itself; never an MCQ distractor.
        "cued_valid_synonyms": ["expert", "consultant"],
    },
}


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def _require_generation_rules() -> None:
    """The field-authoring rules are the single source of truth for generation (§5).

    Refuse to stage a batch the generator could not author correctly against a missing rules doc.
    """
    if not GENERATION_RULES_PATH.exists() or not GENERATION_RULES_PATH.read_text(
        encoding="utf-8"
    ).strip():
        raise RuntimeError(f"feed: empty/missing generation rules at {GENERATION_RULES_PATH}.")


def feed(artifacts: Artifacts = ARTIFACTS) -> int:
    """Stage the next batch per CEFR level. Stateless: it is `manifest − _done`, recomputed."""
    _require_generation_rules()
    if not any(artifacts.manifest(c).exists() for c in CEFR_LEVELS):
        raise RuntimeError(f"feed: no manifests found in {artifacts.out_dir}. Run `stagea` first.")

    done = set(cast(list[str], read_json(artifacts.done, [])))
    artifacts.out_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    for cefr in CEFR_LEVELS:
        manifest = cast(list[ManifestItem], read_json(artifacts.manifest(cefr), []))
        pending = [m for m in manifest if m["sense_id"] not in done]
        batch = pending[:BATCH_SIZE]

        # Always (re)write the pending file — an empty `items` signals "nothing left" downstream.
        write_json(
            artifacts.pending_batch(cefr),
            {
                "gold_example": GOLD_EXAMPLE,
                "items": [
                    {
                        "sense_id": m["sense_id"],
                        "word": m["word"],
                        "lemma": m["lemma"],
                        "part_of_speech": m["part_of_speech"],
                        "cefr": m["cefr"],
                        "zipf_rank": m["zipf_rank"],
                        "synset": m["synset"],
                        "sense_hint": m["sense_hint"],
                    }
                    for m in batch
                ],
            },
        )
        print(f"feed: {cefr} — fed {len(batch)} ({len(pending) - len(batch)} remain).")
        total += len(batch)

    if total == 0:
        print("feed: nothing pending across all levels — all items generated. Run `combine`.")
    else:
        print(f"feed: {total} items across {len(CEFR_LEVELS)} levels. Run `generate`.")
    return total


def _strip_justifications(fit_set: Any) -> Any:
    """Drop the `why` scratch key from each fit-set entry (FIT-3); leave malformed shapes for Stage C."""
    if not isinstance(fit_set, list):
        return fit_set
    return [
        {k: v for k, v in entry.items() if k != "why"} if isinstance(entry, dict) else entry
        for entry in fit_set
    ]


def _next_batch_index(out_dir: Path) -> int:
    if not out_dir.exists():
        return 0
    existing = [p for p in out_dir.iterdir() if re.fullmatch(r"batch_\d{4}\.json", p.name)]
    # max+1, not a count: deleting a batch file must not make the next ingest overwrite a survivor.
    if not existing:
        return 0
    return max(int(p.stem.split("_")[1]) for p in existing) + 1


@dataclass(slots=True)
class LevelResult:
    merged: list[LexicalItem] = field(default_factory=list)
    fails: list[dict[str, Any]] = field(default_factory=list)
    flags: list[dict[str, Any]] = field(default_factory=list)


def merge_level(
    pending_items: list[dict[str, Any]],
    by_id: dict[str, ManifestItem],
    generated: dict[str, Any],
) -> LevelResult:
    """Merge one level's generated batch against the carried manifest facts, running Stage C per item.

    Carried fields ALWAYS come from the manifest, never from the generator, and a stray carried key in
    the generated object is a hard fail. This is §0 — the single most important rule in the pipeline:
    mixing carried with generated is how factual hallucination enters the data.
    """
    gen_by_id = {g["sense_id"]: g for g in generated.get("items", []) if "sense_id" in g}
    result = LevelResult()
    allowed = {"sense_id", "_flags", *GENERATED_KEYS}

    for p in pending_items:
        sense_id = p["sense_id"]
        carried = by_id.get(sense_id)
        if carried is None:
            result.fails.append({"sense_id": sense_id, "errors": ["sense_id not in manifest"]})
            continue

        g: GeneratedItem | None = gen_by_id.get(sense_id)
        if g is None:
            result.fails.append(
                {"sense_id": sense_id, "errors": ["no generated output for this sense_id"]}
            )
            continue

        stray = sorted(set(g) - allowed)
        if stray:
            result.fails.append(
                {"sense_id": sense_id, "errors": [f"generated output has stray keys: {', '.join(stray)}"]}
            )
            continue

        item = cast(
            LexicalItem,
            {
                # carried — from the manifest, verbatim
                "word": carried["word"],
                "lemma": carried["lemma"],
                "part_of_speech": carried["part_of_speech"],
                "sense_id": carried["sense_id"],
                "cefr": carried["cefr"],
                "zipf": carried["zipf"],
                "zipf_rank": carried["zipf_rank"],
                # generated — an absent field is null, never invented
                **{k: g.get(k) for k in GENERATED_KEYS},
                # FIT-3: the per-entry `why` is a scratch justification — required in the authored
                # output, discarded here so it never ships in the catalog.
                "cloze_fit_set": _strip_justifications(g.get("cloze_fit_set")),
                **({"_flags": g["_flags"]} if g.get("_flags") else {}),
                "gen_model": GEN_MODEL,
                "gen_spec_version": GEN_SPEC_VERSION,
                # FIT-5: stamped provenance — the generator never authors it (it is a stray key).
                "fit_set_version": INITIAL_FIT_SET_VERSION,
            },
        )

        v = validate_item(item)
        if v.fails:
            result.fails.append({"sense_id": sense_id, "errors": v.fails})
        if v.flags:
            result.flags.append({"sense_id": sense_id, "notes": v.flags})
        result.merged.append(item)

    return result


def ingest(artifacts: Artifacts = ARTIFACTS) -> tuple[int, int]:
    """Ingest every CEFR level that has a hand-authored generated batch. Returns (committed, failed).

    Each level commits independently: zero hard-fails → its own batch_NNNN.json + its sense_ids
    appended to _done.json; any hard-fail → nothing committed for that level, recorded to
    _review.json. A bad level never blocks the others.
    """
    # Carried authority: the union of all four manifests. Never trust the generator for a carried fact.
    by_id: dict[str, ManifestItem] = {}
    for cefr in CEFR_LEVELS:
        for m in cast(list[ManifestItem], read_json(artifacts.manifest(cefr), [])):
            by_id[m["sense_id"]] = m
    if not by_id:
        raise RuntimeError(f"ingest: no manifests in {artifacts.out_dir}. Run `stagea` first.")

    artifacts.out_dir.mkdir(parents=True, exist_ok=True)
    done = cast(list[str], read_json(artifacts.done, []))
    review = cast(list[Any], read_json(artifacts.review, []))
    committed = failed = processed = 0

    for cefr in CEFR_LEVELS:
        pending = read_json(artifacts.pending_batch(cefr), None)
        if not pending or not pending.get("items"):
            continue
        if not artifacts.generated_batch(cefr).exists():
            print(f"ingest: {cefr} — no {artifacts.generated_batch(cefr)} yet; skipping.")
            continue
        processed += 1

        generated = read_json(artifacts.generated_batch(cefr), {"items": []})
        level = merge_level(pending["items"], by_id, generated)

        # §7.1: any hard miss fails the level — do not commit it; record it for regeneration.
        if level.fails:
            review.append(
                {
                    "kind": "batch_failed",
                    "level": cefr,
                    "at": datetime.now(UTC).isoformat(),
                    "fails": level.fails,
                    "flags": level.flags,
                }
            )
            print(
                f"ingest: {cefr} — {len(level.fails)} item(s) FAILED; level not committed. "
                f"See {artifacts.review}."
            )
            for f in level.fails:
                print(f"  FAIL {f['sense_id']}: {'; '.join(f['errors'])}")
            failed += 1
            continue

        batch_path = artifacts.batch(_next_batch_index(artifacts.out_dir))
        write_json(batch_path, level.merged)
        done.extend(m["sense_id"] for m in level.merged)
        if level.flags:
            review.append(
                {
                    "kind": "flags",
                    "level": cefr,
                    "batch": str(batch_path),
                    "at": datetime.now(UTC).isoformat(),
                    "flags": level.flags,
                }
            )
        print(
            f"ingest: {cefr} — committed {len(level.merged)} items → {batch_path} "
            f"({len(level.flags)} flagged)."
        )
        committed += 1

    write_json(artifacts.done, done)
    write_json(artifacts.review, review)

    if processed == 0:
        print(
            "ingest: no generated batches found. Run `generate`, author each "
            "_generated_batch_<cefr>.json, then re-run `ingest`."
        )
    else:
        print(f"ingest: {committed} level(s) committed, {failed} failed; {len(done)} total done.")
    return committed, failed
