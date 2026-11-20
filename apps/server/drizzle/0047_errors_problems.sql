-- Збої сервера й скарги гравців (план 64): таблиці server_error і problem_report; лише нові таблиці, індекси й зовнішні ключі.
CREATE TABLE "problem_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"from_account" boolean NOT NULL,
	"text" text NOT NULL,
	"page" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"reply" text,
	"replied_at" timestamp with time zone,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_error" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"where" text NOT NULL,
	"what" text,
	"event" text,
	"name" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"count" integer DEFAULT 1 NOT NULL,
	"day_count" integer DEFAULT 1 NOT NULL,
	"day_start" timestamp with time zone NOT NULL,
	"first_at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "problem_report" ADD CONSTRAINT "problem_report_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_report" ADD CONSTRAINT "problem_report_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_error" ADD CONSTRAINT "server_error_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_report_status_created_idx" ON "problem_report" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "problem_report_user_idx" ON "problem_report" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "server_error_open_once" ON "server_error" USING btree ("fingerprint") WHERE status = 'new';--> statement-breakpoint
CREATE INDEX "server_error_status_last_idx" ON "server_error" USING btree ("status","last_at");