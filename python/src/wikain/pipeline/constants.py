"""Single-source constants for the content pipeline. All magic values live here.

`docs/BUILD.md` section references are inline. Never re-hardcode one of these elsewhere.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal

# python/src/wikain/pipeline/constants.py → repo root is five parents up.
REPO_ROOT: Final[Path] = Path(__file__).resolve().parents[4]
DATA_DIR: Final[Path] = REPO_ROOT / "data"
DOCS_DIR: Final[Path] = REPO_ROOT / "docs"

# The artifact directory is unchanged from the TypeScript pipeline: `src/infrastructure/db/
# seedCatalog.ts` reads `build/out/items.json`, and the path is already git-ignored.
OUT_DIR: Final[Path] = REPO_ROOT / "build" / "out"

#: §5 authoritative field-authoring rules — the single source of truth for generation.
GENERATION_RULES_PATH: Final[Path] = DOCS_DIR / "GENERATION_RULES.md"

#: spec/13 FIT-3: the two-gate classification rubric, inlined VERBATIM into the build prompt (and the
#: future heal prompt) so the two can never drift (AMMENDMENT §A4.4).
CLOZE_FIT_RUBRIC_PATH: Final[Path] = DOCS_DIR / "CLOZE_FIT_RUBRIC.md"

#: Versions the rubric text above. An edit to the rubric MUST bump this; it invalidates and re-runs
#: classification (the §5.3 `rubric_version` mechanism, applied to the fit set).
FIT_RUBRIC_VERSION: Final[str] = "2026-07-14"

#: spec/13 FIT-5: the fit_set_version ingest stamps on a fresh classification. Heal-merges increment.
INITIAL_FIT_SET_VERSION: Final[int] = 1

#: spec/13 FIT-2: more non-target fit-set entries than this → Stage C FLAG (not fail) — the §A6.3
#: constraint-pressure signal that the cloze frame is not constrained enough.
FIT_SET_FLAG_THRESHOLD: Final[int] = 6

#: Input file (§2). Header: `word,pos,cefr,sense_id,sense_hint,sense_zipf,global_zipf_rank`.
#: **Multisense** — a `(word,pos)` gets one row per WordNet sense (`sense_id` = a synset key such as
#: `desire.v.01`; `sense_hint` = its gloss). Glosses embed commas, so the file is quote-wrapped and
#: must be read with a real RFC-4180 reader. Every row carries a real CEFR (A2–C1).
MULTISENSE_CSV: Final[Path] = DATA_DIR / "oxford_multisense_catalog.csv"

#: Source column → carried field. The source renamed both numerics (`zipf`→`sense_zipf`,
#: `zipf_rank`→`global_zipf_rank`); we map them back at the read boundary so the carried contract —
#: and with it `src/domain/lexicalItem.ts` and the `lexical_items` table — is untouched.
ZIPF_COLUMN: Final[str] = "sense_zipf"
ZIPF_RANK_COLUMN: Final[str] = "global_zipf_rank"

CefrLevel = Literal["A2", "B1", "B2", "C1"]

#: The CEFR levels the source carries. Stage A emits one manifest per level; feed/generate/ingest fan
#: out over these so each frontier-LLM prompt is level-homogeneous (§4 band-homogeneous distractors).
CEFR_LEVELS: Final[tuple[CefrLevel, ...]] = ("A2", "B1", "B2", "C1")

#: Levels the runtime type tolerates (§8 #2) — wider than what the source carries.
VALID_CEFR: Final[frozenset[str]] = frozenset({"A1", "A2", "B1", "B2", "C1"})

#: Ordering for the low-CEFR-wins tiebreak when one sense appears at two levels (§3.5).
CEFR_ORDER: Final[dict[str, int]] = {"A1": 0, "A2": 1, "B1": 2, "B2": 3, "C1": 4}

@dataclass(frozen=True, slots=True)
class Artifacts:
    """Every path the pipeline reads or writes, rooted at one directory.

    Injected rather than hard-coded so a test can drive the real `feed`/`ingest`/`combine` against a
    temp directory instead of the developer's actual generation state — those three were the pipeline's
    entire untested surface, and they are the ones that mutate `_done.json`.
    """

    out_dir: Path

    @property
    def quarantine(self) -> Path:
        return self.out_dir / "_quarantine.json"

    @property
    def done(self) -> Path:
        return self.out_dir / "_done.json"

    @property
    def review(self) -> Path:
        return self.out_dir / "_review.json"

    @property
    def items(self) -> Path:
        return self.out_dir / "items.json"

    def manifest(self, cefr: str) -> Path:
        return self.out_dir / f"_manifest_{cefr}.json"

    def pending_batch(self, cefr: str) -> Path:
        return self.out_dir / f"_pending_batch_{cefr}.json"

    def generated_batch(self, cefr: str) -> Path:
        return self.out_dir / f"_generated_batch_{cefr}.json"

    def prompt(self, cefr: str) -> Path:
        """The markdown prompt the user pastes into a frontier-LLM free chat (generate.py)."""
        return self.out_dir / f"_prompt_{cefr}.md"

    def batch(self, index: int) -> Path:
        return self.out_dir / f"batch_{index:04d}.json"


#: The real artifact set. Every entry point defaults to it; tests pass their own.
ARTIFACTS: Final[Artifacts] = Artifacts(OUT_DIR)


#: §6 batch size — 25 per CEFR level, so one `feed` stages 100 items.
BATCH_SIZE: Final[int] = 25

#: Provenance stamps (§4). Generation is hand-authored via frontier-LLM free chats (varying models),
#: so the model stamp is a generic marker rather than a specific API model.
GEN_MODEL: Final[str] = "manual-frontier-llm"
GEN_SPEC_VERSION: Final[str] = "gen-spec v3"

#: §3.1 POS normalization map — explicit and exhaustive over every POS string in the source. Anything
#: absent here HALTs (§3.1 / §2.2 [VALIDATE]): never silently bucket as `other`, never guess. The
#: closed-class exotics map to `other` explicitly and are quarantined by the §3.4 scope filter anyway.
POS_MAP: Final[dict[str, str]] = {
    # content + common closed-class (identity)
    "noun": "noun",
    "verb": "verb",
    "adj": "adj",
    "adv": "adv",
    "prep": "prep",
    "pron": "pron",
    "det": "det",
    "conj": "conj",
    "prefix": "prefix",
    # spelled-out / concatenated → controlled tag
    "number": "num",
    "indefinitearticle": "article",
    "definitearticle": "article",
    # closed-class exotics with no dedicated controlled tag → explicit `other` (all quarantined)
    "exclam": "other",
    "modalv": "other",
    "auxiliaryv": "other",
    "ndet": "other",
    "infinitivemarker": "other",
    "detadj": "other",
}

#: §3.4 in-scope content POS.
CONTENT_POS: Final[frozenset[str]] = frozenset({"noun", "verb", "adj", "adv"})

#: Sentinels the source writes when WordNet had no sense for a `(word,pos)`. Carrying one through
#: would show the generator a bogus synset + gloss as "the sense to author" — so we quarantine
#: instead (§3.1 halt-don't-guess).
NO_SENSE_SENTINEL: Final[str] = "NO_SENSE_FOUND"
NO_HINT_SENTINEL: Final[str] = "NO_HINT_FOUND"


class QReason:
    """Quarantine reason strings (stable, for auditability)."""

    OUT_OF_SCOPE_POS: Final[str] = "out-of-scope-pos"
    NO_SENSE_FOUND: Final[str] = "no-sense-found"
