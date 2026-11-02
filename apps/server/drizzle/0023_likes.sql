-- Лайки (беклог #22): хто кому за що, один лайк людини на об'єкт; приховані рядки видаленого запитання чи вікторини лишаються.
CREATE TABLE "user_like" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_user_id" text NOT NULL,
	"quiz_id" uuid,
	"question_id" text,
	"game_id" uuid NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_like" ADD CONSTRAINT "user_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_like" ADD CONSTRAINT "user_like_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_like_question_once" ON "user_like" USING btree ("user_id","quiz_id","question_id") WHERE kind = 'question';--> statement-breakpoint
CREATE UNIQUE INDEX "user_like_quiz_once" ON "user_like" USING btree ("user_id","quiz_id") WHERE kind = 'quiz';--> statement-breakpoint
CREATE UNIQUE INDEX "user_like_host_once" ON "user_like" USING btree ("user_id","game_id") WHERE kind = 'host';--> statement-breakpoint
CREATE UNIQUE INDEX "user_like_player_once" ON "user_like" USING btree ("user_id","game_id","target_user_id") WHERE kind = 'player';--> statement-breakpoint
CREATE INDEX "user_like_target_idx" ON "user_like" USING btree ("target_user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "user_like_user_idx" ON "user_like" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_like_quiz_idx" ON "user_like" USING btree ("quiz_id");