/**
 * SEED-2/5: the frequency-ordered Oxford multisense catalog (CEFR-banded + zipf-ordered). One of the three SEPARATE
 * placement mechanisms — it SELECTS the words to introduce next (the LexTALE scalar only sets *where*
 * the frontier is; per-word marks only decide skip-`Seen`). Declared by the application (ARCH-3);
 * implemented in infrastructure over the built catalog. Narrow by intent (SOLID-4): selection only.
 */
export interface WordSource {
  /**
   * The next `count` senseIds at the frontier `band`, in list-stack order, excluding words the user
   * already has cards for (SEED-7 lazy creation — never re-introduce). Returns fewer than `count`
   * (possibly zero) when the band is exhausted. MUST NOT create cards or mark words known (SEED-3).
   */
  nextFrontierWords(
    band: string,
    exclude: ReadonlySet<string>,
    count: number,
  ): Promise<string[]>;
}
