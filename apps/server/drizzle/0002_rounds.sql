ALTER TABLE "answer" ADD COLUMN "round_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "answer" ADD COLUMN "streak_bonus" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game" ADD COLUMN "plays" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Дописано вручну: спершу стовпець без NOT NULL, щоб перенести в нього збережені вікторини.
ALTER TABLE "quiz" ADD COLUMN "rounds" jsonb;--> statement-breakpoint
-- Кожна збережена вікторина стає одним класичним раундом з тими самими запитаннями й налаштуваннями
-- (як upgradeQuiz у packages/shared). Знімки в game.quiz_snapshot лишаються старими й читаються через upgradeQuiz.
UPDATE "quiz" SET
  "rounds" = jsonb_build_array(jsonb_build_object(
    'id', 'r1', 'type', 'classic', 'title', '',
    'speedBonus', "settings"->'speedBonus', 'shuffleOptions', "settings"->'shuffleOptions',
    'rules', '{"penalty":"none","partial":null,"streak":null,"multiplier":1}'::jsonb,
    'questions', "questions")),
  "settings" = jsonb_build_object('leaderboard', "settings"->'leaderboard');--> statement-breakpoint
ALTER TABLE "quiz" ALTER COLUMN "rounds" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz" DROP COLUMN "questions";
