/**
 * «Кадр за кадром» (36): одна класика на 6 запитань «Відео за фрагментами» — кліпи, спортивний момент, мультфільм і фільм.
 * Гравці відкривають шматки 1, 2, 4, 8, 16 с від секунди старту; що коротший шматок, то більше балів. Сід `video`.
 *
 * Кожен ролик перевірено 2026-11-17: oEmbed (https://www.youtube.com/oembed?url=https://youtu.be/<id>&format=json) відповів 200
 * з назвою й автором у коментарі; тривалість — зі сторінки ролика (lengthSeconds), старт + 16 с у неї вміщається.
 * Жоден id не повторює наявні сіди (grep -r <id> apps/server/scripts — порожньо). Секунди старту обрано за будовою ролика
 * (після заставок студій і вступних слів), не переглядом кадру — ведучому варто глянути в редакторі.
 */
import { DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';

const clip = (
  n: number,
  text: string,
  id: string,
  start: number,
  muted: boolean,
  accepted: string[],
  points: number,
): Question => ({
  id: `vc-q${n}`,
  type: 'videoclip',
  text,
  imageUrl: null,
  video: null,
  timeLimit: 60,
  points,
  clip: { id, start },
  muted,
  accepted,
});

export const videoQuiz = (): Quiz => ({
  title: 'Кадр за кадром',
  description: 'Відкривайте відео шматочками по 1, 2, 4, 8 і 16 секунд і впізнавайте якомога раніше: що коротший шматок, то більше балів.',
  settings: { leaderboard: 'end', newcomers: true },
  rounds: [
    {
      id: 'vc-round',
      type: 'classic',
      title: 'Кадр за кадром',
      description: 'Шматки відкриваються по черзі, переглядати відкрите можна скільки завгодно. Відповідь — одна.',
      speedBonus: false,
      shuffleOptions: false,
      rules: DEFAULT_RULES,
      questions: [
        // «PSY - GANGNAM STYLE(강남스타일) M/V», officialpsy; 252 с. Без звуку: приспів одразу видав би назву.
        clip(1, 'Як називається пісня з цього кліпу?', '9bZkp7q19f0', 30, true, ['Gangnam Style', 'Ґанґнам стайл', 'Гангнам стайл', 'Gangnam'], 400),
        // «Zootopia Official US Trailer #2», Walt Disney Animation Studios; 165 с. Старт після заставки студії; назва — лише наприкінці трейлера.
        clip(2, 'Як називається цей анімаційний фільм?', 'jWM0ct-OLsM', 20, true, ['Зоотрополіс', 'Zootopia', 'Zootropolis', 'Зоотопія'], 600),
        // «Usain Bolt 9.58 100m New World Record Berlin [HQ]», realsbstn; 46 с. Фінал чемпіонату світу 2009 у Берліні.
        clip(3, 'Хто виграє цей забіг?', '3nbjhpcZ9_g', 10, true, ['Усейн Болт', 'Usain Bolt', 'Болт', 'Юсейн Болт', 'Bolt'], 800),
        // «Luis Fonsi - Despacito ft. Daddy Yankee», LuisFonsiVEVO; 282 с. Зі звуком; старт 40 с — після вступного вигуку «Fonsi!», на першому куплеті.
        clip(4, 'Хто виконує цю пісню? Назвіть головного співака', 'kJQP7kiw5Fk', 40, false, ['Луїс Фонсі', 'Luis Fonsi', 'Фонсі', 'Fonsi', 'Луіс Фонсі'], 1000),
        // «Interstellar - Trailer - Official Warner Bros. UK», Warner Bros. UK & Ireland; 175 с. Старт після логотипів студій.
        clip(5, 'Як називається фільм, трейлер якого ви бачите?', 'zSWdZVtXT7E', 40, true, ['Інтерстеллар', 'Interstellar', 'Інтерстелар'], 1200),
        // «Kalush Orchestra - Stefania (Official Video Eurovision 2022)», офіційний канал Kalush Orchestra; 193 с. Переможці Євробачення-2022.
        clip(6, 'Який гурт знявся в цьому кліпі?', 'Z8Z51no1TD0', 30, true, ['Kalush Orchestra', 'Kalush', 'Калуш', 'Калуш Оркестра', 'Калуш Оркестр'], 1500),
      ],
    },
  ],
});
