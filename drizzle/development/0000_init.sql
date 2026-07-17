CREATE TABLE "cards" (
	"user_id" text NOT NULL,
	"sense_id" text NOT NULL,
	"mastery" text NOT NULL,
	"fsrs_due" timestamp with time zone NOT NULL,
	"fsrs_stability" double precision NOT NULL,
	"fsrs_difficulty" double precision NOT NULL,
	"fsrs_elapsed_days" double precision NOT NULL,
	"fsrs_scheduled_days" double precision NOT NULL,
	"fsrs_reps" integer NOT NULL,
	"fsrs_lapses" integer NOT NULL,
	"fsrs_state" integer NOT NULL,
	"fsrs_last_review" timestamp with time zone,
	CONSTRAINT "cards_user_id_sense_id_pk" PRIMARY KEY("user_id","sense_id")
);
--> statement-breakpoint
CREATE TABLE "review_logs" (
	"seq" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sense_id" text NOT NULL,
	"tier" text NOT NULL,
	"rating" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"scaffolded" boolean,
	"fsrs_rating" integer NOT NULL,
	"fsrs_state" integer NOT NULL,
	"fsrs_due" timestamp with time zone NOT NULL,
	"fsrs_stability" double precision NOT NULL,
	"fsrs_difficulty" double precision NOT NULL,
	"fsrs_elapsed_days" double precision NOT NULL,
	"fsrs_last_elapsed_days" double precision NOT NULL,
	"fsrs_scheduled_days" double precision NOT NULL,
	"fsrs_review" timestamp with time zone NOT NULL
);
