"""Stage A — Assembly (docs/BUILD.md §3). Deterministic, NO LLM.

Converts the multisense source CSV into an assembled manifest (carried fields only) + a quarantine
side-file, then prints the Stage A exit-gate summary. The source is multisense — one row per WordNet
sense — so a `(lemma,pos)` yields one item per distinct synset, keyed `{lemma}_{pos}_{NN}` by an
ordinal over its senses (most frequent = `_01`).

Nothing here generates content, and nothing here invents a carried fact (§0, §8). Every anomaly
either HALTs or is quarantined with a reason — it is never guessed past.
"""

import csv
import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from typing import cast

from .constants import (
    ARTIFACTS,
    CEFR_LEVELS,
    CEFR_ORDER,
    CONTENT_POS,
    MULTISENSE_CSV,
    NO_HINT_SENTINEL,
    NO_SENSE_SENTINEL,
    POS_MAP,
    VALID_CEFR,
    ZIPF_COLUMN,
    ZIPF_RANK_COLUMN,
    Artifacts,
    QReason,
)
from .types import Cefr, ControlledPos, ManifestItem, QuarantineEntry


class HaltError(RuntimeError):
    """A source-data defect the pipeline refuses to guess past (§2.2 [VALIDATE])."""


@dataclass(frozen=True, slots=True)
class Collision:
    """One sense that appeared at two CEFR levels; the lower level won."""

    key: str
    kept: str
    dropped: str


@dataclass(frozen=True, slots=True)
class AssembleResult:
    #: In-scope items per CEFR level, each list sorted by zipf_rank ascending (most frequent first).
    manifests: dict[str, list[ManifestItem]]
    quarantine: list[QuarantineEntry]
    collisions: list[Collision]


@dataclass(frozen=True, slots=True)
class _Staged:
    """A deduped sense, before its `(lemma,pos)` ordinal sense_id and hash are assigned."""

    word: str
    lemma: str
    part_of_speech: ControlledPos
    synset: str
    sense_hint: str
    cefr: str
    zipf: float
    zipf_rank: int


def normalize_pos(raw_pos: str, context: str) -> ControlledPos:
    """§3.1 — normalize a raw POS string; HALT on anything the explicit map does not cover."""
    mapped = POS_MAP.get(raw_pos)
    if mapped is None:
        raise HaltError(
            f'[HALT] §3.1 unknown POS string "{raw_pos}" ({context}). The normalization map does '
            f"not cover it. Per §3.1/§2.2 [VALIDATE]: do NOT guess — extend POS_MAP after review."
        )
    return cast(ControlledPos, mapped)


def carried_hash(
    word: str,
    lemma: str,
    part_of_speech: str,
    sense_id: str,
    cefr: Cefr,
    zipf: float,
    zipf_rank: int,
) -> str:
    """Hash of the seven runtime carried fields, so a Stage B mutation is detectable (§0).

    The manifest-only `synset`/`sense_hint` are generation inputs, not part of the runtime item, so
    they are deliberately excluded.
    """
    canonical = json.dumps(
        [word, lemma, part_of_speech, sense_id, cefr, zipf, zipf_rank],
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _quarantine(
    word: str, lemma: str, pos: str, raw_pos: str, cefr: str, zipf: float, rank: int, reason: str
) -> QuarantineEntry:
    """Build a quarantine entry. `cefr` is already known-valid (VALID_CEFR) by the time we get here."""
    return {
        "word": word,
        "lemma": lemma,
        "part_of_speech": pos,
        "raw_pos": raw_pos,
        "cefr": cast(Cefr, cefr),
        "zipf": zipf,
        "zipf_rank": rank,
        "reason": reason,
    }


def assemble(rows: list[dict[str, str]]) -> AssembleResult:
    """Pure assembly (§3): CSV rows → per-CEFR manifests + quarantine + CEFR collisions. No I/O.

    Each distinct `(lemma,pos,synset)` sense becomes one item. HALTs on unknown POS, invalid CEFR,
    non-numeric frequency, a residual duplicate sense_id, or an in-scope item whose CEFR falls
    outside CEFR_LEVELS.
    """
    quarantine: list[QuarantineEntry] = []
    collisions: list[Collision] = []
    # Insertion-ordered, so the output is a deterministic function of source row order.
    by_key: dict[tuple[str, str, str], _Staged] = {}

    for r in rows:
        word = r["word"].strip()
        raw_pos = r["pos"]
        cefr_raw = r.get("cefr", "")
        synset = r.get("sense_id", "").strip()
        sense_hint = r.get("sense_hint", "").strip()

        pos = normalize_pos(raw_pos, f'word="{word}"')
        lemma = word.lower()

        if cefr_raw not in VALID_CEFR:
            raise HaltError(f'[HALT] word="{word}" has invalid/empty CEFR "{cefr_raw}".')
        cefr = cefr_raw

        raw_zipf = r.get(ZIPF_COLUMN, "")
        raw_rank = r.get(ZIPF_RANK_COLUMN, "")
        try:
            zipf = float(raw_zipf)
            zipf_rank = int(raw_rank)
        except ValueError as err:
            raise HaltError(
                f'[HALT] word="{word}" has non-numeric {ZIPF_COLUMN}/{ZIPF_RANK_COLUMN} '
                f'("{raw_zipf}"/"{raw_rank}").'
            ) from err

        # §3.4 scope filter: content POS only. Out-of-scope (modalv/auxiliaryv/…) → quarantine.
        if pos not in CONTENT_POS:
            quarantine.append(
                _quarantine(
                    word, lemma, pos, raw_pos, cefr, zipf, zipf_rank, QReason.OUT_OF_SCOPE_POS
                )
            )
            continue

        # The source found no WordNet sense for this (word,pos). The synset and gloss are sentinels,
        # not facts — and the gloss is exactly what the prompt shows the LLM as "the sense to author"
        # (§5). Authoring against `NO_HINT_FOUND` would produce content keyed to nothing, so the item
        # is quarantined rather than generated (§3.1 halt-don't-guess).
        if synset == NO_SENSE_SENTINEL or sense_hint == NO_HINT_SENTINEL:
            quarantine.append(
                _quarantine(
                    word, lemma, pos, raw_pos, cefr, zipf, zipf_rank, QReason.NO_SENSE_FOUND
                )
            )
            continue

        key = (lemma, pos, synset)
        existing = by_key.get(key)
        if existing is not None:
            # The SAME sense at two CEFR levels (a merge artifact in the source): keep the LOWER
            # CEFR (and that row's frequency), and record the collision for the gate summary (§3.5).
            keep_existing = CEFR_ORDER[existing.cefr] <= CEFR_ORDER[cefr]
            collisions.append(
                Collision(
                    key=f"{lemma}/{pos}/{synset}",
                    kept=existing.cefr if keep_existing else cefr,
                    dropped=cefr if keep_existing else existing.cefr,
                )
            )
            if keep_existing:
                continue

        by_key[key] = _Staged(word, lemma, pos, synset, sense_hint, cefr, zipf, zipf_rank)

    manifest = _assign_sense_ids(by_key.values())
    _assert_unique_sense_ids(manifest)
    return AssembleResult(
        manifests=_group_by_cefr(manifest), quarantine=quarantine, collisions=collisions
    )


def _assign_sense_ids(staged: Iterable[_Staged]) -> list[ManifestItem]:
    """Assign the per-(lemma,pos) sense ordinal → `sense_id` (§3.2).

    Senses of one `(lemma,pos)` are ordered by rank ascending (so `_01` is the most frequent sense),
    with the synset key as a deterministic tiebreak.
    """
    groups: dict[tuple[str, str], list[_Staged]] = {}
    for s in staged:
        groups.setdefault((s.lemma, s.part_of_speech), []).append(s)

    manifest: list[ManifestItem] = []
    for group in groups.values():
        group.sort(key=lambda s: (s.zipf_rank, s.synset))
        for i, s in enumerate(group, start=1):
            sense_id = f"{s.lemma}_{s.part_of_speech}_{i:02d}"
            manifest.append(
                {
                    "word": s.word,
                    "lemma": s.lemma,
                    "part_of_speech": s.part_of_speech,
                    "sense_id": sense_id,
                    "cefr": cast(Cefr, s.cefr),
                    "zipf": s.zipf,
                    "zipf_rank": s.zipf_rank,
                    "synset": s.synset,
                    "sense_hint": s.sense_hint,
                    "_carried_hash": carried_hash(
                        s.word,
                        s.lemma,
                        s.part_of_speech,
                        sense_id,
                        cast(Cefr, s.cefr),
                        s.zipf,
                        s.zipf_rank,
                    ),
                }
            )
    return manifest


def _assert_unique_sense_ids(manifest: list[ManifestItem]) -> None:
    """Ordinal assignment guarantees uniqueness; assert it anyway — it is the runtime's item key."""
    seen: set[str] = set()
    for it in manifest:
        if it["sense_id"] in seen:
            raise HaltError(f"[HALT] duplicate sense_id in manifest: {it['sense_id']}")
        seen.add(it["sense_id"])


def _group_by_cefr(manifest: list[ManifestItem]) -> dict[str, list[ManifestItem]]:
    manifests: dict[str, list[ManifestItem]] = {c: [] for c in CEFR_LEVELS}
    for it in manifest:
        cefr = it["cefr"]
        if cefr not in manifests:
            raise HaltError(
                f'[HALT] in-scope item {it["sense_id"]} has out-of-range CEFR "{cefr}" '
                f"(expected one of {'/'.join(CEFR_LEVELS)})."
            )
        manifests[cefr].append(it)
    # Rank ascending → rank 1 = most frequent → generated first.
    for items in manifests.values():
        items.sort(key=lambda it: it["zipf_rank"])
    return manifests


def read_source() -> list[dict[str, str]]:
    """Read the multisense CSV. The stdlib reader is RFC-4180 — the quoted glosses parse correctly."""
    with MULTISENSE_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        return [row for row in csv.DictReader(fh) if any(v.strip() for v in row.values())]


def run(artifacts: Artifacts = ARTIFACTS) -> AssembleResult:
    rows = read_source()
    result = assemble(rows)

    artifacts.out_dir.mkdir(parents=True, exist_ok=True)
    for cefr in CEFR_LEVELS:
        # Always write all four (an empty [] keeps feed/ingest from ever hitting a missing file).
        artifacts.manifest(cefr).write_text(
            json.dumps(result.manifests.get(cefr, []), indent=2), encoding="utf-8"
        )
    artifacts.quarantine.write_text(json.dumps(result.quarantine, indent=2), encoding="utf-8")

    _print_summary(len(rows), result, artifacts)
    return result


def _print_summary(row_count: int, d: AssembleResult, artifacts: Artifacts) -> None:
    manifest = [it for items in d.manifests.values() for it in items]

    def tally(values: list[str]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for v in values:
            counts[v] = counts.get(v, 0) + 1
        return dict(sorted(counts.items(), key=lambda kv: -kv[1]))

    line = "─" * 66
    print(f"\n{line}\n STAGE A — ASSEMBLY SUMMARY (gate before Stage B)\n{line}")
    print(f"\nSource rows read: {row_count}")
    print(f"Manifest (in-scope items): {len(manifest)}")
    print("  per CEFR manifest:", {c: len(d.manifests.get(c, [])) for c in CEFR_LEVELS})
    print("  by POS: ", tally([it["part_of_speech"] for it in manifest]))

    print(f"\nQuarantine: {len(d.quarantine)}")
    print("  by reason:", tally([q["reason"] for q in d.quarantine]))
    print("  by raw POS:", tally([q["raw_pos"] for q in d.quarantine]))
    for q in d.quarantine:
        print(f'  - {q["word"]}/{q["raw_pos"]} (cefr={q["cefr"]}, {q["reason"]})')

    print(f"\nCEFR collisions on (lemma,pos,synset), kept lower CEFR: {len(d.collisions)}")
    for c in d.collisions:
        print(f"  - {c.key}: kept {c.kept}, dropped {c.dropped}")

    print("\nNormalization map (raw → controlled):")
    print("  " + ", ".join(f"{k}→{v}" for k, v in POS_MAP.items()))

    print("\nSample rows:")
    for s in manifest[:4]:
        preview = dict(s)
        preview["_carried_hash"] = s["_carried_hash"][:8] + "…"
        print(f"  {json.dumps(preview)}")

    written = "\n  ".join(str(artifacts.manifest(c)) for c in CEFR_LEVELS)
    print(f"\nArtifacts written:\n  {written}\n  {artifacts.quarantine}")
    print(f"\n{line}\n GATE: review the above before running Stage B generation.\n{line}\n")
