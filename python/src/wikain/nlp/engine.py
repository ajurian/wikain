"""The one NLP engine — spaCy en_core_web_sm.

This module is the single source of NLP truth for the whole product. It is used two ways:

  * the content pipeline (`wikain.pipeline.stage_c`) imports it **directly**, in-process;
  * the TS runtime reaches it over HTTP via `wikain.service` (`POST /analyze`).

That shared import is load-bearing, not a convenience. Stage C asserts that a `model_sentence`
contains a form of the target lemma; at review time the runtime re-derives exactly that (TIER-5,
RL-2). If validation and grading ran on different engines, an item could pass the build gate and
still be bounced as "word absent" at review — a fabricated `Again` that silently corrupts the
learner's FSRS schedule (INV-2). One engine makes that class of bug unrepresentable.
"""

import functools

import spacy
from spacy.language import Language
from spacy.tokens import Token

from .tokens import NlpToken

MODEL = "en_core_web_sm"


@functools.cache
def _nlp() -> Language:
    """Load once per process. Seconds on a cold start — hence Cloud Run min-instances=1."""
    return spacy.load(MODEL)


def _to_token(token: Token) -> NlpToken:
    return NlpToken(
        normal=token.norm_.lower(),
        lemma=token.lemma_.lower(),
        pos=token.pos_,
        is_stopword=token.is_stop,
        # spaCy has no single "is a word" flag; punctuation and whitespace are what we must exclude.
        is_word=not token.is_punct and not token.is_space,
    )


def analyze(text: str) -> list[NlpToken]:
    """Tokenize, lemmatize and POS-tag `text`."""
    return [_to_token(t) for t in _nlp()(text)]


def forms_of(tokens: list[NlpToken]) -> list[str]:
    """Every surface/lemma form the tokens present, for inflection-agnostic lemma matching.

    A derivation, not a second capability: the runtime's `formsOf` is this same flatten over
    the same tokens (`src/domain/review/grading.ts`), so one `analyze` answers both questions.
    """
    forms: list[str] = []
    for t in tokens:
        forms.append(t.normal)
        forms.append(t.lemma)
    return forms


def contains_lemma_form(text: str, lemma: str) -> bool:
    """Does `text` contain a token whose surface form or lemma is `lemma`?

    Backs Stage C's `model_sentence` presence assert and its `self_reference_prompt` leak check —
    and is the same rule the runtime grades with (RL-2 / TIER-5 `isLemmaMatch`).
    """
    target = lemma.lower()
    return target in forms_of(analyze(text))
