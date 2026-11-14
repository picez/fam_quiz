-- Косметика плану 34 (0036 зайнято планом 33): ефект ніку й успадкування стікерів (рішення власника «м'якше»).
ALTER TABLE "profile" ADD COLUMN "nick_effect" text;--> statement-breakpoint
-- Рівень акаунта в мить переходу на набори: усе, що старе правило серій давало на ньому, лишається відкритим.
ALTER TABLE "profile" ADD COLUMN "stickers_legacy_level" integer;--> statement-breakpoint
-- Наявні рядки — false (їх знімає settleKeptStickers на старті); нові акаунти — true (успадковувати нічого).
ALTER TABLE "profile" ADD COLUMN "stickers_settled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "stickers_settled" SET DEFAULT true;
