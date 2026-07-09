/*
 * The part-of-speech line of a dictionary entry, in the conventional italic abbreviation.
 *
 * The mapping is display-only, so it lives in presentation rather than the domain (ARCH-1) — the
 * catalog's controlled vocabulary (`docs/BUILD.md` §3.1) is what the runtime reasons about; `adv.` is
 * only what a reader expects to see. `other` is a real catalog value (modal/auxiliary verbs, exclamations)
 * with no honest abbreviation, so the entry simply omits the line rather than inventing one.
 */
import type { ControlledPos } from "~/domain/lexicalItem.js";
import { cn } from "@/lib/utils";

const ABBREVIATION: Record<ControlledPos, string> = {
  noun: "noun",
  verb: "verb",
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  pron: "pronoun",
  det: "determiner",
  num: "numeral",
  article: "article",
  conj: "conjunction",
  prefix: "prefix",
  other: "",
};

export function PosLabel({
  pos,
  className,
}: {
  pos: ControlledPos;
  className?: string;
}) {
  const abbreviation = ABBREVIATION[pos];
  if (abbreviation === "") return null;
  return (
    <span
      className={cn("font-serif text-base italic text-ink-faint", className)}
    >
      {abbreviation}
    </span>
  );
}
