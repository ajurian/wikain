"""DM-2: the producer half of the lexical-item contract.

The TS twin is `src/domain/lexicalItem.test.ts`. Both assert against `docs/lexical-item.contract.json`,
so a field added to the pipeline without being added to the runtime (or vice versa) fails a test
instead of silently half-shipping a catalog the consumer cannot read.
"""

import json
from typing import get_type_hints

from .constants import DOCS_DIR
from .types import GENERATED_KEYS, CarriedFields, LexicalItem

CONTRACT = json.loads((DOCS_DIR / "lexical-item.contract.json").read_text(encoding="utf-8"))


def test_the_item_produced_carries_exactly_the_contracted_fields() -> None:
    produced = set(get_type_hints(LexicalItem))
    contracted = {
        *CONTRACT["carried"],
        *CONTRACT["generated"],
        *CONTRACT["provenance"],
        *CONTRACT["producerOnly"]["fields"],
    }
    assert produced == contracted


def test_the_carried_fields_are_exactly_the_contracted_carried_fields() -> None:
    """§0: the carried/generated split IS the contract. A field on the wrong side is a real defect."""
    assert set(get_type_hints(CarriedFields)) == set(CONTRACT["carried"])


def test_generated_keys_match_the_contract() -> None:
    """GENERATED_KEYS drives both the prompt's output contract and ingest's stray-key rejection."""
    assert list(GENERATED_KEYS) == CONTRACT["generated"]
