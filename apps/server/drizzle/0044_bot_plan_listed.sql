-- Плани бота (план 62): чи показувати відкриту кімнату в списку лобі.
ALTER TABLE "bot_plan" ADD COLUMN "listed" boolean DEFAULT true NOT NULL;