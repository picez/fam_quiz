-- Дні активності й час у редакторі (план 71): лише нова таблиця, індекс і зовнішній ключ.
CREATE TABLE "activity_day" (
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"editor_sec" integer DEFAULT 0 NOT NULL,
	"editor_sessions" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "activity_day_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "activity_day" ADD CONSTRAINT "activity_day_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_day_day_idx" ON "activity_day" USING btree ("day");