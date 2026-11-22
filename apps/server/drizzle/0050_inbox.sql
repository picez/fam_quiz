-- «Вхідні» на сайті (план 70): таблиця inbox_item, момент гри problem_report.game, push_people у push_broadcast; лише нова таблиця, колонки, індекси й ключі. Наприкінці — дані: push_people = people_count для старих розсилок і наявні відповіді на скарги у «Вхідні» непрочитаними.
CREATE TABLE "inbox_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"broadcast_id" uuid,
	"problem_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "problem_report" ADD COLUMN "game" jsonb;--> statement-breakpoint
ALTER TABLE "push_broadcast" ADD COLUMN "push_people" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_broadcast_id_push_broadcast_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."push_broadcast"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_problem_id_problem_report_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problem_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_item_broadcast_once" ON "inbox_item" USING btree ("user_id","broadcast_id") WHERE broadcast_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_item_problem_once" ON "inbox_item" USING btree ("problem_id") WHERE problem_id is not null;--> statement-breakpoint
CREATE INDEX "inbox_item_user_created_idx" ON "inbox_item" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "inbox_item_unread_idx" ON "inbox_item" USING btree ("user_id") WHERE read_at is null;--> statement-breakpoint
CREATE INDEX "inbox_item_broadcast_idx" ON "inbox_item" USING btree ("broadcast_id");--> statement-breakpoint
UPDATE "push_broadcast" SET "push_people" = "people_count";--> statement-breakpoint
INSERT INTO "inbox_item" ("user_id", "kind", "problem_id", "created_at") SELECT "user_id", 'problem_reply', "id", "replied_at" FROM "problem_report" WHERE "reply" IS NOT NULL AND "user_id" IS NOT NULL AND "replied_at" IS NOT NULL;