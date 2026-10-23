-- Запасне запитання, на яке дано відповідь (план 8b): текст в історії. Старі ігри мають null.
ALTER TABLE "answer" ADD COLUMN "spare_id" text;