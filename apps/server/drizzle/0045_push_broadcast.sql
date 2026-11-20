-- Push-розсилка адміна (план 59): таблиця розсилок і перемикач «Оголошення від адміністраторів» (типово ввімкнено).
CREATE TABLE "push_broadcast" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"url" text,
	"recipients" text NOT NULL,
	"group_id" uuid,
	"group_name" text,
	"people" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"people_count" integer NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "admin_push" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "push_broadcast" ADD CONSTRAINT "push_broadcast_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_broadcast" ADD CONSTRAINT "push_broadcast_group_id_family_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_broadcast_created_idx" ON "push_broadcast" USING btree ("created_at");