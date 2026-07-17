CREATE TABLE "cloze_heal_queue" (
	"sense_id" text NOT NULL,
	"typed_lemma" text NOT NULL,
	"clozed_sentence" text NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "cloze_heal_queue_sense_id_typed_lemma_pk" PRIMARY KEY("sense_id","typed_lemma")
);
--> statement-breakpoint
ALTER TABLE "lexical_items" ADD COLUMN "cloze_fit_set" jsonb;--> statement-breakpoint
ALTER TABLE "lexical_items" ADD COLUMN "bounce_gloss" text;--> statement-breakpoint
ALTER TABLE "lexical_items" ADD COLUMN "fit_set_version" integer;--> statement-breakpoint
ALTER TABLE "review_logs" ADD COLUMN "soft_bounce_count" integer;--> statement-breakpoint
ALTER TABLE "review_logs" ADD COLUMN "soft_bounce_lanes" jsonb;