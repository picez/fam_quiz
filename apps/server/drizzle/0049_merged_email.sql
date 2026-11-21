-- Псевдоніми адрес після об'єднання акаунтів (план 66): таблиця merged_email; лише нова таблиця, індекс і зовнішній ключ.
CREATE TABLE "merged_email" (
	"email" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"merged_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merged_email" ADD CONSTRAINT "merged_email_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merged_email_user_idx" ON "merged_email" USING btree ("user_id");