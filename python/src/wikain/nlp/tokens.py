"""The token shape both consumers of the engine agree on.

Field-for-field the TypeScript `NlpToken` (`src/domain/review/ruleLayer.ts`), which the domain
owns: the rule layer (RL-2/3/4) and cued/cloze grading (TIER-5) are pure functions over these.
The runtime receives them as JSON from the service; the content pipeline gets them in-process.
Same shape, so the two can never disagree about what a sentence contains.
"""

from dataclasses import dataclass

# Universal POS tags that count as content words. Mirrors the domain's CONTENT_POS
# (src/domain/review/ruleLayer.ts) and Stage C's shared-stem check.
CONTENT_POS: frozenset[str] = frozenset({"NOUN", "VERB", "ADJ", "ADV", "PROPN"})


@dataclass(frozen=True, slots=True)
class NlpToken:
    """One analyzed token. All string fields are lowercased."""

    normal: str
    lemma: str
    #: Universal POS tag (NOUN/VERB/ADJ/ADV/PROPN/DET/ADP/PRON/PUNCT/…).
    pos: str
    is_stopword: bool
    #: False for punctuation and whitespace — the rule layer counts only real words.
    is_word: bool
