-- Скасування балів (план 12a): що скасовує рядок undo — запитання (індекс у plays) чи seq коригування. Старі рядки — null.
ALTER TABLE "score_adjustment" ADD COLUMN "undoes_question" integer;--> statement-breakpoint
ALTER TABLE "score_adjustment" ADD COLUMN "undoes_seq" integer;