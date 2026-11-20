-- Картка гравця (план 58): заборона забраних досягнень, ручний досвід з причиною, подарунки адміна.
CREATE TABLE "achievement_block" (
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"blocked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "achievement_block_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
ALTER TABLE "prize_award" ADD COLUMN "gift" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prize_award" ADD COLUMN "gift_note" text;--> statement-breakpoint
ALTER TABLE "xp_entry" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "achievement_block" ADD CONSTRAINT "achievement_block_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;