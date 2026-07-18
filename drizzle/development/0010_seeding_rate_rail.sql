-- SEED-10/11 (Amendment v4.2): the seeding ledger stores an absolute instant, not a day key.
-- Drop-and-recreate rather than ALTER: `last_seed_at` is NOT NULL with no default, and the ledger is
-- throwaway pacing data (losing a row only makes that user re-seed once) — so this is safe on a dev DB
-- that already holds day-key rows, where an in-place ADD COLUMN NOT NULL would fail.
DROP TABLE "seed_ledger";--> statement-breakpoint
CREATE TABLE "seed_ledger" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_seed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seed_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"count" integer,
	"had_backlog" boolean,
	"failing_clause" text
);
--> statement-breakpoint
CREATE INDEX "seed_events_user_idx" ON "seed_events" USING btree ("user_id");
