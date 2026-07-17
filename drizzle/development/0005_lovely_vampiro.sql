CREATE TABLE "placement_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"frontier_band" text NOT NULL,
	"lextale_score" double precision,
	"onboarded_at" timestamp with time zone
);
--> statement-breakpoint
-- Backfill (hand-added; drizzle-kit only emits the DDL above). Every user who already has a card was
-- onboarded before `onboarded_at` existed — without this they are all thrown back into /onboarding by the
-- new `_onboarded` route guard and re-seeded. 'B2' is DEFAULT_FRONTIER_BAND (SEED-5), which is also what
-- the pre-migration `startSessionFn` hardcoded, so their band is unchanged.
INSERT INTO "placement_profile" ("user_id", "frontier_band", "onboarded_at")
SELECT DISTINCT "user_id", 'B2', now() FROM "cards"
ON CONFLICT ("user_id") DO NOTHING;
--> statement-breakpoint
-- Display-only, written by nothing; the band now lives in placement_profile.frontier_band (one source).
ALTER TABLE "settings" DROP COLUMN "level_band";
