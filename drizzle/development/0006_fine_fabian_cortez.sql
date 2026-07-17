ALTER TABLE "review_logs" ADD COLUMN "retry_count" integer;--> statement-breakpoint
ALTER TABLE "review_logs" ADD COLUMN "typo_fixed" boolean;--> statement-breakpoint
ALTER TABLE "review_logs" ADD COLUMN "latency_ms" integer;