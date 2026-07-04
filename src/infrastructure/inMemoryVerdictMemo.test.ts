/**
 * The in-memory memo runs the shared port contract (spec/05 MEMO-1..6) — the same suite the Drizzle
 * adapter runs, proving both are substitutable (SOLID-3).
 */
import { describeVerdictMemoContract } from "./verdictMemoContract.js";
import { InMemoryVerdictMemo } from "./inMemoryVerdictMemo.js";

describeVerdictMemoContract("InMemoryVerdictMemo", async () => new InMemoryVerdictMemo());
