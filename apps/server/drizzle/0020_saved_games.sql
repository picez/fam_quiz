-- Збережені ігри (беклог 8): контрольна точка гри; data null — знімка немає, продовження шляхом 12r.
CREATE TABLE "saved_game" (
	"game_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb,
	"state_version" integer,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_game" ADD CONSTRAINT "saved_game_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;