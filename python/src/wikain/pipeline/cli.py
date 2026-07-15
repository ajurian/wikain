"""The pipeline CLI — one subcommand per stage (docs/BUILD.md §6).

    stagea    Stage A: assemble the source CSV → _manifest_<cefr>.json + _quarantine.json
    feed      Stage B: stage the next 25-item batch PER CEFR level → _pending_batch_<cefr>.json
    generate  Stage B: write a markdown prompt per level → _prompt_<cefr>.md (NO API)
    ingest    Stage B: merge every _generated_batch_<cefr>.json, run Stage C, commit
    validate  Stage C: the §7.1 auto-asserts over items.json (or a given path)
    combine   concat all batch_*.json → items.json

The loop is feed → generate → *the user authors the JSON in a frontier-LLM chat* → ingest.
"""

import argparse
import io
import json
import sys
from pathlib import Path

from . import combine as combine_mod
from . import generate as generate_mod
from . import stage_a, stage_b
from .constants import ARTIFACTS
from .stage_c import validate_all
from .types import LexicalItem


def _validate(path: Path) -> int:
    if not path.exists():
        print(f"validate: no input at {path}", file=sys.stderr)
        return 1
    items: list[LexicalItem] = json.loads(path.read_text(encoding="utf-8"))
    results = validate_all(items)
    failed = [r for r in results if r.fails]
    flagged = [r for r in results if r.flags]

    print(f"Validated {len(results)} items: {len(failed)} failing, {len(flagged)} flagged.")
    for r in failed:
        print(f"  FAIL {r.sense_id}: {'; '.join(r.fails)}")
    for r in flagged:
        print(f"  flag {r.sense_id}: {'; '.join(r.flags)}")
    return 2 if failed else 0


def main(argv: list[str] | None = None) -> int:
    # The gate summary and the source glosses are UTF-8; a Windows console defaults to cp1252 and
    # would raise UnicodeEncodeError on the box-drawing rules and the → arrows.
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(prog="wikain-pipeline", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("stagea", "feed", "generate", "ingest", "combine"):
        sub.add_parser(name)
    validate_parser = sub.add_parser("validate")
    validate_parser.add_argument("path", nargs="?", type=Path, default=ARTIFACTS.items)

    args = parser.parse_args(argv)

    match args.command:
        case "stagea":
            stage_a.run()
        case "feed":
            stage_b.feed()
        case "generate":
            generate_mod.generate()
        case "ingest":
            _, failed = stage_b.ingest()
            # A failed level must break CI/scripts — its items were NOT committed.
            return 2 if failed else 0
        case "combine":
            combine_mod.combine()
        case "validate":
            return _validate(args.path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
