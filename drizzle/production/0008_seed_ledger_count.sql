CREATE TABLE "review_batches" (
	"batch_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"batch_number" integer NOT NULL,
	"planned_tier_counts" jsonb NOT NULL,
	"planned_units" integer NOT NULL,
	"planned_cards" integer NOT NULL,
	"built_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"outcome" text,
	"completed_count" integer,
	"abandoned_at_position" integer,
	"abandoned_at_tier" text,
	"wall_clock_ms" integer,
	"continue_chosen" boolean
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
CREATE TABLE "seed_ledger" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_seed_at" timestamp with time zone NOT NULL,
	"seeded_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"batch_number" integer NOT NULL,
	"entries" jsonb NOT NULL,
	"progress_index" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_interaction_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_logs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "theme" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
CREATE INDEX "review_batches_user_idx" ON "review_batches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seed_events_user_idx" ON "seed_events" USING btree ("user_id");