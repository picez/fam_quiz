-- Події гри для повтору по кроках (план 65): таблиця game_event; лише нова таблиця, індекс і зовнішні ключі.
CREATE TABLE "game_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"question_index" integer NOT NULL,
	"kind" text NOT NULL,
	"participant_id" uuid,
	"user_id" text,
	"nickname" text NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
ALTER TABLE "game_event" ADD CONSTRAINT "game_event_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_event" ADD CONSTRAINT "game_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_event_game_idx" ON "game_event" USING btree ("game_id","at");