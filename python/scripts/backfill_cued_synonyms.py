"""One-time bootstrap: seed `cued_valid_synonyms` from `cloze_fit_set` (spec/15 CUE-2 [FLAG]).

Amendment v4.3 (spec/15) adds a `cued_valid_synonyms` field for the cued synonym soft-bounce lane.
The proper source is a gloss-enumerated set generated at build time (CUE-3); the generation prompt now
asks for it, but the ALREADY-committed batches (batch_0000..) predate that. This script backfills those
items in `build/out/items.json` by deriving each item's `cued_valid_synonyms` from the
`same_sense_near_miss` entries of its `cloze_fit_set`.

Soundness: a `same_sense_near_miss` entry IS, by the FIT-3 rubric, a genuine same-sense synonym of the
target — so the derived set has NO false positives (CUE-4 same-sense-only holds), and because Stage C
already forbids a `same_sense_near_miss` from also being a distractor or the target, the derived set
satisfies the CUE-4 Stage-C checks by construction. It is potentially INCOMPLETE (the cloze frame did
not need every synonym) and, until re-generated, COUPLED to the cloze frame (against CUE-9) — an
accepted v1 stopgap, superseded at the next full generation pass (the CUE-2 [FLAG]).

Idempotent: re-running recomputes from `cloze_fit_set`, so it is safe after a fresh `combine`. Run it
AFTER `combine` and BEFORE `validate` / `db:seed:catalog` (a later `combine` rebuilds items.json from
the batches, which still lack the field — re-run this script then).

    uv run python scripts/backfill_cued_synonyms.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from wikain.pipeline.constants import ARTIFACTS


def derive_cued_synonyms(cloze_fit_set: Any) -> list[str]:
    """Distinct `same_sense_near_miss` lemmas of a `cloze_fit_set` (order-preserving). [] if none."""
    if not isinstance(cloze_fit_set, list):
        return []
    out: list[str] = []
    for entry in cloze_fit_set:
        if not isinstance(entry, dict) or entry.get("class") != "same_sense_near_miss":
            continue
        lemma = entry.get("lemma")
        if isinstance(lemma, str) and lemma and lemma not in out:
            out.append(lemma)
    return out


def main() -> None:
    items_path: Path = ARTIFACTS.items
    items: list[dict[str, Any]] = json.loads(items_path.read_text(encoding="utf-8"))

    with_syn = 0
    for item in items:
        syns = derive_cued_synonyms(item.get("cloze_fit_set"))
        item["cued_valid_synonyms"] = syns
        if syns:
            with_syn += 1

    items_path.write_text(json.dumps(items, indent=2) + "\n", encoding="utf-8")
    print(
        f"backfill_cued_synonyms: {len(items)} items -> {with_syn} carry >=1 synonym, "
        f"{len(items) - with_syn} carry [] -> {items_path}"
    )


if __name__ == "__main__":
    main()
