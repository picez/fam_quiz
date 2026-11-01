-- Призи ведучого й вітрина (беклог 10, 15): склад, вручені екземпляри, титули.
CREATE TABLE "prize" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'free' NOT NULL,
	"reserved_game" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prize_award" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"prize_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"place" integer NOT NULL,
	"content" jsonb NOT NULL,
	"quiz_title" text NOT NULL,
	"nickname" text NOT NULL,
	"awarded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_title" (
	"user_id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"game_id" uuid NOT NULL,
	"awarded_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prize" ADD CONSTRAINT "prize_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_award" ADD CONSTRAINT "prize_award_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_title" ADD CONSTRAINT "user_title_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prize_owner_idx" ON "prize" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "prize_reserved_idx" ON "prize" USING btree ("reserved_game");--> statement-breakpoint
CREATE UNIQUE INDEX "prize_award_once" ON "prize_award" USING btree ("game_id","place","user_id");--> statement-breakpoint
CREATE INDEX "prize_award_user_idx" ON "prize_award" USING btree ("user_id");