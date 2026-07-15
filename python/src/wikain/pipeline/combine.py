"""Combiner (docs/BUILD.md §6). Folds every out/batch_NNNN.json into one out/items.json.

Last-write-wins by `sense_id` (batches are read in ascending filename order), and re-runnable. The
result is what `npm run db:seed:catalog` loads into the global `lexical_items` table.
"""

import json
import re

from .constants import ARTIFACTS, Artifacts
from .types import LexicalItem


def combine(artifacts: Artifacts = ARTIFACTS) -> int:
    """Write items.json from the committed batches. Returns the item count."""
    out_dir = artifacts.out_dir
    if not out_dir.exists():
        raise RuntimeError(f"combine: no {out_dir}. Nothing to combine.")

    # Ascending filename order, so a later batch wins on a repeated sense_id.
    files = sorted(p for p in out_dir.iterdir() if re.fullmatch(r"batch_\d{4}\.json", p.name))

    by_id: dict[str, LexicalItem] = {}
    for f in files:
        for it in json.loads(f.read_text(encoding="utf-8")):
            by_id[it["sense_id"]] = it

    items = sorted(by_id.values(), key=lambda it: it["sense_id"])
    artifacts.items.write_text(json.dumps(items, indent=2), encoding="utf-8")
    print(f"combine: {len(files)} batch file(s) → {len(items)} items → {artifacts.items}")
    return len(items)
