-- Гра без ведучого (план 11h): позначка автопілота. Старі ігри — false.
ALTER TABLE "game" ADD COLUMN "autopilot" boolean DEFAULT false NOT NULL;