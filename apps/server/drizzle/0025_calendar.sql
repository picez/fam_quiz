CREATE TABLE "calendar_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" text NOT NULL,
	"title" text NOT NULL,
	"quiz_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"game_id" uuid,
	"game_code" text,
	"edited_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_request" (
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "calendar_request_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "calendar_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_request" ADD CONSTRAINT "calendar_request_event_id_calendar_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_request" ADD CONSTRAINT "calendar_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_event_host_starts_idx" ON "calendar_event" USING btree ("host_id","starts_at");--> statement-breakpoint
CREATE INDEX "calendar_event_starts_idx" ON "calendar_event" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "calendar_request_user_idx" ON "calendar_request" USING btree ("user_id");