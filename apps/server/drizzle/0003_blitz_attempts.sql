-- Порядок змінено вручну: стовпець спершу має з'явитися, а потім увійти в первинний ключ.
-- Наявні відповіді отримують attempt = 0.
ALTER TABLE "answer" ADD COLUMN "attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "answer" ALTER COLUMN "payload" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "answer" DROP CONSTRAINT "answer_participant_id_question_index_pk";--> statement-breakpoint
ALTER TABLE "answer" ADD CONSTRAINT "answer_participant_id_question_index_attempt_pk" PRIMARY KEY("participant_id","question_index","attempt");
