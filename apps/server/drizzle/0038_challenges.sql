-- Виклик другові (план 44): виклики зі знімком вікторини й одна спроба на акаунт.
CREATE TABLE "challenge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"quiz_id" uuid,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"quiz_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "challenge_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "challenge_attempt" (
	"challenge_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"game_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	CONSTRAINT "challenge_attempt_challenge_id_user_id_pk" PRIMARY KEY("challenge_id","user_id"),
	CONSTRAINT "challenge_attempt_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempt" ADD CONSTRAINT "challenge_attempt_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempt" ADD CONSTRAINT "challenge_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_owner_idx" ON "challenge" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_active_idx" ON "challenge" USING btree ("quiz_id") WHERE ended_at is null;--> statement-breakpoint
CREATE INDEX "challenge_attempt_user_idx" ON "challenge_attempt" USING btree ("user_id");