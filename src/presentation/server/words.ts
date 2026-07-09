import { createServerFn } from "@tanstack/react-start";
import { readWordsList, type ReadWordsListResult } from "~/application/progress/readWordsList.js";
import { readWordDetail, type WordDetail } from "~/application/progress/readWordDetail.js";
import { currentUserId } from "./currentUser.js";
import { wordsDeps } from "./composition.js";

/**
 * The learner's word list for `/words` (spec/10 CNT-2/3). A pure read: per card it reduces the persisted
 * ReviewLogs to a spaced-judged-pass count and reads live retrievability, then joins the catalog for the
 * display lemma. DB access stays server-side (NET-7/STACK-3); only the serializable rows cross to the client.
 */
export const wordsListFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReadWordsListResult> =>
    readWordsList({ userId: await currentUserId() }, wordsDeps()),
);

/**
 * Per-word detail for `/words/$wordId` (spec/10 CNT-1/2/3 + the SM-3..SM-7 history replay). Returns
 * `null` when the user has no card for the sense (a reachable but empty URL). A param'd read, so it
 * mirrors `resolvePromptFn`: GET + a `senseId` validator.
 */
export const wordDetailFn = createServerFn({ method: "GET" })
  .validator((senseId: unknown): string => {
    if (typeof senseId !== "string" || senseId.length === 0) {
      throw new Error("wordDetailFn: senseId (non-empty string) required");
    }
    return senseId;
  })
  .handler(async ({ data }): Promise<WordDetail | null> =>
    readWordDetail({ userId: await currentUserId(), senseId: data }, wordsDeps()),
  );
