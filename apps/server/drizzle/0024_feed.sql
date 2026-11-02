CREATE TABLE "feed_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"game_id" uuid,
	"data" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "feed_event_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "user_like" ALTER COLUMN "game_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "feed_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "feed_level" integer;--> statement-breakpoint
ALTER TABLE "user_like" ADD COLUMN "event_key" text;--> statement-breakpoint
ALTER TABLE "feed_event" ADD CONSTRAINT "feed_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_event_user_at_idx" ON "feed_event" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "feed_event_user_created_idx" ON "feed_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "feed_event_at_idx" ON "feed_event" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_like_event_once" ON "user_like" USING btree ("user_id","event_key") WHERE kind = 'event';--> statement-breakpoint
-- Дописана історія бейджа не запалює: наявні профілі вже «переглянули» стрічку.
UPDATE "profile" SET "feed_seen_at" = now();
