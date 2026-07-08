CREATE TABLE "lexical_items" (
	"sense_id" text PRIMARY KEY NOT NULL,
	"word" text NOT NULL,
	"lemma" text NOT NULL,
	"part_of_speech" text NOT NULL,
	"cefr" text,
	"zipf" double precision NOT NULL,
	"zipf_rank" integer NOT NULL,
	"intended_sense" text,
	"recognition_meaning" text,
	"distractors" jsonb,
	"clozed_sentence" text,
	"productive_meaning" text,
	"model_sentence" text,
	"self_reference_prompt" text,
	"gen_model" text NOT NULL,
	"gen_spec_version" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lexical_items_cefr_rank_idx" ON "lexical_items" USING btree ("cefr","zipf_rank");