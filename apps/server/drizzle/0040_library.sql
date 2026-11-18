-- Бібліотека вікторин і скарги (план 47): знімки відкритих вікторин, копії, скарги на вікторини й профілі; ігри за вікториною — з індексом (лічильник «зіграли»).
CREATE TABLE "library_copy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid,
	"user_id" text NOT NULL,
	"quiz_id" uuid,
	"author_line" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"language" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"question_count" integer NOT NULL,
	"round_types" text[] NOT NULL,
	"origin_line" text,
	"listed" boolean NOT NULL,
	"moderation" text DEFAULT 'ok' NOT NULL,
	"appealed_at" timestamp with time zone,
	"appeal_open" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "library_entry_quiz_id_unique" UNIQUE("quiz_id")
);
--> statement-breakpoint
CREATE TABLE "user_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"entry_id" uuid,
	"target_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "library_copy" ADD CONSTRAINT "library_copy_entry_id_library_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."library_entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_copy" ADD CONSTRAINT "library_copy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_copy" ADD CONSTRAINT "library_copy_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_report" ADD CONSTRAINT "user_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_report" ADD CONSTRAINT "user_report_entry_id_library_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."library_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_report" ADD CONSTRAINT "user_report_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_copy_entry_idx" ON "library_copy" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "library_copy_quiz_idx" ON "library_copy" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "library_entry_listed_idx" ON "library_entry" USING btree ("listed","moderation","opened_at");--> statement-breakpoint
CREATE INDEX "library_entry_owner_idx" ON "library_entry" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_report_quiz_once" ON "user_report" USING btree ("reporter_id","entry_id") WHERE status = 'open' and target_kind = 'quiz';--> statement-breakpoint
CREATE UNIQUE INDEX "user_report_profile_once" ON "user_report" USING btree ("reporter_id","target_user_id") WHERE status = 'open' and target_kind = 'profile';--> statement-breakpoint
CREATE INDEX "user_report_open_idx" ON "user_report" USING btree ("status","target_kind","created_at");--> statement-breakpoint
CREATE INDEX "game_quiz_idx" ON "game" USING btree ("quiz_id");