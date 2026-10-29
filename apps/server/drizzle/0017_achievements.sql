-- Ачівки I (план 12i): дата й гра отриманої ачівки, позначка доповненої історії, дебаф, підказка й відповідач у рядку відповіді.
CREATE TABLE "user_achievement" (
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"earned_at" timestamp with time zone,
	"game_id" uuid,
	CONSTRAINT "user_achievement_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
ALTER TABLE "answer" ADD COLUMN "debuff" text;--> statement-breakpoint
ALTER TABLE "answer" ADD COLUMN "clue" integer;--> statement-breakpoint
ALTER TABLE "answer" ADD COLUMN "answered_by" uuid;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "achievements_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE set null ON UPDATE no action;