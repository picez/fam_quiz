-- Коригування рахунку поза відповідями (план 7d): бали від ведучого, пізніше — дуелі. Старі ігри їх не мають.
CREATE TABLE "score_adjustment" (
	"participant_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"round_index" integer NOT NULL,
	"after_question" integer NOT NULL,
	"points" integer NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "score_adjustment_participant_id_seq_pk" PRIMARY KEY("participant_id","seq")
);
--> statement-breakpoint
ALTER TABLE "score_adjustment" ADD CONSTRAINT "score_adjustment_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;