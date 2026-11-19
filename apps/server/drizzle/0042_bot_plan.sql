-- Плани ігор бота за розкладом (план 56): нагадування, автозапуск, щотижневий повтор.
CREATE TABLE "bot_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"recipients" text NOT NULL,
	"group_id" uuid,
	"people" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_start_min" integer,
	"weekly" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"reason" text,
	"room_id" text,
	"room_code" text,
	"reminded_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"previous_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_plan" ADD CONSTRAINT "bot_plan_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_plan" ADD CONSTRAINT "bot_plan_group_id_family_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_plan" ADD CONSTRAINT "bot_plan_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_plan_status_starts_idx" ON "bot_plan" USING btree ("status","starts_at");