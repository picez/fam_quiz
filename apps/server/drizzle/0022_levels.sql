-- Досвід і рівні (беклог 11): журнал нарахувань, мітка ретро, вбрання біля ніку.
CREATE TABLE "xp_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"game_id" uuid,
	"quiz_id" uuid,
	"achievement_id" text,
	"amount" integer NOT NULL,
	"counted" boolean DEFAULT false NOT NULL,
	"reason" text,
	"day" text NOT NULL,
	"at" timestamp with time zone,
	"retro" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "xp_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "nick_color" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "nick_frame" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "badge" text;--> statement-breakpoint
ALTER TABLE "xp_entry" ADD CONSTRAINT "xp_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "xp_entry_game_once" ON "xp_entry" USING btree ("user_id","game_id") WHERE source = 'game';--> statement-breakpoint
CREATE UNIQUE INDEX "xp_entry_achievement_once" ON "xp_entry" USING btree ("user_id","achievement_id") WHERE source = 'achievement';--> statement-breakpoint
CREATE INDEX "xp_entry_user_day_idx" ON "xp_entry" USING btree ("user_id","day");