# 08 — Online Inference & Failure Path

**Purpose.** Specify the online-only core loop, the "checking…" affordance, and how cloud-call
failures (timeout/5xx/429/offline) are handled so they never corrupt FSRS.

**Scope.** Responsiveness and the network failure surface. The judge call itself is `06`; the
no-rating-on-failure rule is `02` (`RAT-2`).

**PRD trace.** §7; §6 (maintenance latency note); §11 P8/P11; Risks-v4 #3/#4.

**Depends-on.** `00` (`INV-2`); `04` (the rule layer gates when "checking…" appears); `06` (the call
that can fail); `02` (`RAT-2`).

**Out-of-scope.** Detailed key/secret management at deployment (backend; PRD §7 notes it as
out-of-scope for this flow), per-user rate/quota limits (backend; Risks-v4 #4).

---

### NET-1 — Online required; no offline mode
**Trace:** PRD §7, §11 P8.
**Requirement:** The app MUST require internet for the core loop. There MUST be **no** offline mode,
queue, sync, Batch lane, "saved — we'll check on reconnect" state, or provisional checkmark. Every
judgment MUST be synchronous within the session and contingent on connectivity. There MUST be no
model warming (no local weights).

### NET-2 — "checking…" appears only after the rule layer passes
**Trace:** PRD §7.
**Requirement:** Deterministic tiers (recognition/cloze/cued) MUST feel instant (no "checking…").
Free production MUST show a brief **"checking…"** state during the round-trip, and that state MUST
appear **only once input is well-formed** (target present, non-degenerate, English — `04`).
Mechanical rejections MUST be instant and MUST NOT spend a call.

**Scenario: a bounce is instant, never "checking…"**
```
Given a free-production submission that the rule layer bounces
When it is rejected
Then the rejection is instant
And no "checking…" state is shown
And no cloud call is made
```

**Scenario: a well-formed submission shows "checking…"**
```
Given a free-production submission that passes the rule layer
When it is sent to the judge
Then a "checking…" state is shown during the round-trip
```

### NET-3 — Timeout / 5xx / transient network error
**Trace:** PRD §7, §11 P11.
**Requirement:** On timeout, 5xx, or transient network error, the system MUST retry once
(`CLOUD_RETRY_COUNT` = 1) with backoff. On persistent failure it MUST surface a neutral **"couldn't
check that one — try again"** and leave the card **due with no rating** (`INV-2`). It MUST NOT
fabricate an `Again` and MUST NOT grant a provisional pass.

**Scenario: persistent 5xx leaves the card due, no rating**
```
Given a judge call that fails with 5xx, then fails again after one backed-off retry
When the failure is handled
Then a neutral "couldn't check that one — try again" message is shown
And the card stays due
And no rating is derived and scheduler.next is NOT called
```

### NET-4 — 429 / rate limit
**Trace:** PRD §7, §11 P11.
**Requirement:** On a 429 / rate limit the system MUST show the same neutral message + a short
backoff, with **no rating**.

### NET-5 — No connectivity at submit time
**Trace:** PRD §7.
**Requirement:** With no connectivity at submit time, the system MUST block the free-production
submit with a clear "you're offline — reconnect to check this sentence" state; the card MUST stay due
with no rating. Deterministic tiers MAY still work without a model call, but the app as a whole
assumes connectivity.

**Scenario: offline blocks the judged submit without a rating**
```
Given no network connectivity
When the learner submits a free-production sentence
Then the submit is blocked with an offline message
And the card stays due
And no rating is derived
```

### NET-6 — Transport retry is not a learner signal
**Trace:** PRD §7, §3.6.
**Requirement:** An internal inference retry on a network/transport error MUST NOT be treated as a
learner signal and MUST NOT touch the rating (it is distinct from the no-retry-until-pass rule for
genuine judge fails, `RAT-4`).

### NET-7 — API key server-side only
**Trace:** PRD §7, §11 P3.
**Requirement:** The DeepSeek API key MUST live server-side in the backend (secret/environment
store) and MUST NEVER be exposed to the client. Judge calls MUST be proxied through the backend.

---

## Notes / edge cases

Maintenance reps are infrequent (long FSRS intervals), so a several-second cloud judge per rep is
acceptable; the rule layer still gives an instant bounce for malformed input (PRD §6).

## Open / to-validate (non-normative)

- Network RTT + DeepSeek V4 Flash TTFT budget for the "checking…" wait (measure; PRD §7).
- Rate limits (PRD §5.7).

## Deferred (non-normative — [v2] / enable-later)

- Per-user rate/quota limits and abuse monitoring live in the **backend**, out-of-scope for this flow
  doc, but the PRD (Risks-v4 #4) requires they exist before launch — recorded so it is not forgotten.
