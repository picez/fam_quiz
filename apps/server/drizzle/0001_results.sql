CREATE TABLE "answer" (
	"participant_id" uuid NOT NULL,
	"question_index" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"time_ms" integer NOT NULL,
	"accepted" boolean NOT NULL,
	"points" integer NOT NULL,
	"overridden" boolean NOT NULL,
	CONSTRAINT "answer_participant_id_question_index_pk" PRIMARY KEY("participant_id","question_index")
);
--> statement-breakpoint
CREATE TABLE "game" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quiz_id" uuid,
	"host_id" text NOT NULL,
	"code" text NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"quiz_snapshot" jsonb NOT NULL,
	"questions_played" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "participant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"user_id" text,
	"score" integer NOT NULL,
	"total_time_ms" integer NOT NULL,
	"rank" integer
);
--> statement-breakpoint
ALTER TABLE "answer" ADD CONSTRAINT "answer_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_host_idx" ON "game" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "participant_game_idx" ON "participant" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "participant_user_idx" ON "participant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_owner_idx" ON "quiz" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");