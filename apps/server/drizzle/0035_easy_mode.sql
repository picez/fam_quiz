-- Легкий режим (план 31): великий шрифт і спокійний екран, збережені в профілі.
ALTER TABLE "profile" ADD COLUMN "easy_mode" boolean DEFAULT false NOT NULL;