-- Групи II (план 12l): які записи групи використано в яких вікторинах.
CREATE TABLE "group_item_use" (
	"item_id" uuid NOT NULL,
	"quiz_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "group_item_use_item_id_quiz_id_pk" PRIMARY KEY("item_id","quiz_id")
);
--> statement-breakpoint
ALTER TABLE "group_item_use" ADD CONSTRAINT "group_item_use_item_id_group_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."group_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_item_use" ADD CONSTRAINT "group_item_use_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_item_use_quiz_idx" ON "group_item_use" USING btree ("quiz_id");