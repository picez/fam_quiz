-- Апеляція гравця (план 12f): закриті апеляції з лічильником «так / ні» і рішенням, для історії й ачівок.
CREATE TABLE "appeal" (
	"game_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"participant_id" uuid NOT NULL,
	"question_index" integer NOT NULL,
	"reason" text NOT NULL,
	"yes" integer NOT NULL,
	"no" integer NOT NULL,
	"outcome" text NOT NULL,
	"adjustment_seq" integer,
	CONSTRAINT "appeal_game_id_seq_pk" PRIMARY KEY("game_id","seq")
);
--> statement-breakpoint
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;