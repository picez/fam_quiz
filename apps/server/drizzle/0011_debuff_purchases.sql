-- Купівля дебафів гравцями (план 9c): вид і ціль у коригуванні. Старі коригування мають null.
ALTER TABLE "score_adjustment" ADD COLUMN "debuff" text;--> statement-breakpoint
ALTER TABLE "score_adjustment" ADD COLUMN "target_nickname" text;