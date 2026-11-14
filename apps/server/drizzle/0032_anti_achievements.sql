-- Досягнення II (план 12j): перемикач «ховати антидосягнення» і повторне доповнення історії новими досягненнями.
ALTER TABLE "profile" ADD COLUMN "hide_anti" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "profile" SET "achievements_synced_at" = NULL;
