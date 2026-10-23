-- Баф, узятий на відповідь (план 8a): значок в історії. Старі ігри мають null.
ALTER TABLE "answer" ADD COLUMN "buff" text;