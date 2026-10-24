import { z } from 'zod';
import { BUFF_KINDS, DEBUFF_KINDS, READY_BUFFS, type BuffKind, type DebuffKind } from './game';
import { UNSTORABLE, isStorable } from './text';

export const LIMITS = {
  questionText: 300,
  optionText: 120,
  answerText: 200,
  minTime: 5,
  maxTime: 120,
  defaultTime: 30,
  maxPoints: 2000,
  defaultPoints: 1000,
  minOptions: 2,
  maxOptions: 6,
  minOrderItems: 3,
  maxOrderItems: 6,
  minPairs: 3,
  maxPairs: 6,
  maxAccepted: 10,
  /** Запитань в одному раунді. */
  maxQuestions: 100,
  maxQuizQuestions: 200,
  maxRounds: 10,
  roundTitle: 60,
  roundDescription: 200,
  minCategories: 3,
  maxCategories: 8,
  minCategoryQuestions: 3,
  maxCategoryQuestions: 10,
  categoryTitle: 40,
  orderLabel: 40,
  maxPlayers: 50,
  /** Ціна дебафу для гравців (9c), балів. */
  minDebuffPrice: 50,
  maxDebuffPrice: 5000,
  defaultDebuffPrice: 200,
  nicknameMin: 2,
  nicknameMax: 20,
  /** Найпізніша секунда початку відео (12 год). */
  maxVideoStart: 43_200,
  minChainWords: 3,
  maxChainWords: 10,
  chainWord: 30,
  minHintSeconds: 1,
  maxHintSeconds: 30,
  defaultHintSeconds: 5,
  minSortCategories: 2,
  maxSortCategories: 4,
  /** Назва категорії сортування: коротко, бо зона на краю телефона. */
  sortCategory: 30,
  minSortWords: 4,
  maxSortWords: 20,
  sortWord: 40,
  /** «Підвисання» після помилки в сортуванні, секунди. */
  minLockSeconds: 1,
  maxLockSeconds: 10,
  defaultLockSeconds: 3,
  /** Типові бали за слово в сортуванні. */
  defaultSortPoints: 100,
  /** Найбільша сума одного коригування балів ведучим (за модулем). */
  maxAdjust: 10_000,
  /** Дуелі: категорій у пулі, запитань у категорії, запитань за дуель. */
  maxDuelCategories: 8,
  maxDuelCategoryQuestions: 20,
  maxDuelQuestions: 7,
  defaultDuelQuestions: 3,
  defaultDuelTime: 30,
  maxDuelStake: 5000,
  defaultDuelStake: 300,
  /** Спроб одного дуелянта на одне запитання. */
  maxDuelTries: 30,
  /** Підказка до запитання (редактор) і від ведучого в грі, символів. */
  hintText: 200,
  /** Запасних запитань для бафу «Заміна запитання». */
  maxSpares: 20,
  /** Запасних в одній категорії поля (9d). */
  maxCategorySpares: 5,
  /** Одиниця повзунка («км», «рік»), символів. */
  sliderUnit: 12,
  /** Найбільше кроків повзунка: (max − min) / step. */
  maxSliderSteps: 10_000,
  /** Тривалість фрагмента аудіо, секунди. */
  minAudioSeconds: 1,
  maxAudioSeconds: 120,
  defaultAudioSeconds: 15,
  /** «Хто я?»: підказок, символів у підказці, інтервал між підказками (с). */
  minClues: 3,
  maxClues: 6,
  clueText: 150,
  minClueSeconds: 3,
  maxClueSeconds: 30,
  defaultClueSeconds: 8,
  /** Остання підказка відкривається щонайменше за стільки секунд до кінця часу. */
  clueTailSeconds: 5,
  /** Точка: радіуси у відсотках довшої сторони основи; пропорція основи (ширина / висота). */
  pinMaxFullRadius: 50,
  pinMaxZeroRadius: 100,
  defaultPinFull: 3,
  defaultPinZero: 15,
  pinMinAspect: 0.25,
  pinMaxAspect: 4,
  /** Стіна зв'язків: символів у плитці й назві групи, ліміт помилок, типовий час (с). */
  wallTile: 20,
  wallGroupName: 40,
  minWallMistakes: 1,
  maxWallMistakes: 5,
  defaultWallMistakes: 3,
  defaultWallTime: 90,
  /** «Хмара слів»: слів від гравця, символів у слові, слів на сцені. */
  maxCloudWords: 3,
  cloudWord: 24,
  cloudShown: 40,
} as const;

/** Вбудовані мапи для точки (10c); SVG у apps/web/public/maps. */
export const PIN_MAPS = ['world', 'europe', 'ukraine'] as const;
export type PinMap = (typeof PIN_MAPS)[number];
/** Пропорції вбудованих мап = viewBox їхніх SVG (2000×1000, 1600×1200, 1600×1100). */
export const PIN_MAP_ASPECT: Record<PinMap, number> = { world: 2, europe: 4 / 3, ukraine: 16 / 11 };

/** Розміри стіни: 3×3 або 4×4 (груп = плиток у групі). */
export const WALL_SIZES = [3, 4] as const;

const share01 = z.number().finite().min(0).max(1);

/** Обмеження для зображень у запитаннях. */
export const IMAGE_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  types: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

/** Адреса завантаженого зображення: лише власне сховище цього сайту. */
export const IMAGE_URL = /^\/uploads\/[a-z0-9]{16,64}\.(jpg|png|webp)$/;

/** Обмеження аудіофайлів (10b). */
export const AUDIO_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  /** Типи, які приймає маршрут (браузери називають m4a по-різному). */
  types: ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'],
} as const;

/** Адреса завантаженого аудіо: лише власне сховище. */
export const AUDIO_URL = /^\/uploads\/[a-z0-9]{16,64}\.(mp3|ogg|m4a)$/;

/** Ідентифікатор відео YouTube. */
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export const videoSchema = z.object({
  id: z.string().regex(YOUTUBE_ID),
  /** Секунда, з якої починається відтворення. */
  start: z.number().int().min(0).max(LIMITS.maxVideoStart),
});

export type Video = z.infer<typeof videoSchema>;

const audioStart = z.number().int().min(0).max(LIMITS.maxVideoStart);
const audioDuration = z.number().int().min(LIMITS.minAudioSeconds).max(LIMITS.maxAudioSeconds);

/** Аудіо до запитання (10b): файл зі сховища або YouTube «лише звук»; фрагмент — початок і тривалість, секунди. */
export const audioSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('file'), url: z.string().regex(AUDIO_URL), start: audioStart, duration: audioDuration }),
  z.object({ source: z.literal('youtube'), id: z.string().regex(YOUTUBE_ID), start: audioStart, duration: audioDuration }),
]);

export type QuestionAudio = z.infer<typeof audioSchema>;

/** Режими картинки, що проявляється (10b); немає режиму — звичайна. */
export const REVEAL_MODES = ['pixels', 'blur'] as const;
export type RevealMode = (typeof REVEAL_MODES)[number];

/** Частка ціни в мить повного проявлення. */
export const REVEAL_MIN_SHARE = 0.3;

/** Частка ціни, з якої відповідь на тип із балами за близькість (повзунок) вважається правильною (14a). */
export const PROXIMITY_CORRECT_SHARE = 0.5;

const choice = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  text: z.string().trim().min(1).max(LIMITS.optionText).refine(isStorable, UNSTORABLE),
});

const base = {
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  text: z.string().trim().min(1).max(LIMITS.questionText).refine(isStorable, UNSTORABLE),
  imageUrl: z.string().regex(IMAGE_URL).nullable(),
  /** Відео з YouTube; є відео — немає таймера запитання. Старі вікторини: null. */
  video: videoSchema.nullable().default(null),
  timeLimit: z.number().int().min(LIMITS.minTime).max(LIMITS.maxTime),
  points: z.number().int().min(0).max(LIMITS.maxPoints),
  /** Підказка для бафу «Підказка ведучого»; немає — ведучий підкаже сам. Старі запитання без неї. */
  hint: z.string().trim().min(1).max(LIMITS.hintText).refine(isStorable, UNSTORABLE).optional(),
  /** Аудіо до запитання (10b); старі запитання без поля. Разом із відео не буває. */
  audio: audioSchema.optional(),
  /** Режим картинки (10b): немає — звичайна. */
  reveal: z.enum(REVEAL_MODES).optional(),
};

/** Слово ланцюжка: літери, між ними по одному пробілу, дефісу чи апострофу. */
export const CHAIN_WORD = /^\p{L}+(?:[ '’ʼ-]\p{L}+)*$/u;

/** Варіант single/multi: текст, картинка або обидва; пари й порядок картинок не мають. */
const option = z
  .object({
    id: z.string().min(1).refine(isStorable, UNSTORABLE),
    text: z.string().trim().max(LIMITS.optionText).refine(isStorable, UNSTORABLE),
    /** Картинка варіанта; старі варіанти без неї. */
    imageUrl: z.string().regex(IMAGE_URL).optional(),
  })
  .refine((o) => o.text !== '' || o.imageUrl !== undefined, { message: 'empty_option' });

const options = z.array(option).min(LIMITS.minOptions).max(LIMITS.maxOptions);

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length;

/** Типи запитань у порядку редактора; звіряється з questionSchema у тесті. */
export const QUESTION_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'sort', 'slider', 'clues', 'pin', 'wall', 'poll', 'wordcloud'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Прийнятні написання відповіді («текст», «Хто я?»). */
const spellings = z
  .array(z.string().trim().min(1).max(LIMITS.answerText).refine(isStorable, UNSTORABLE))
  .min(1)
  .max(LIMITS.maxAccepted);

export const questionSchema = z
  .discriminatedUnion('type', [
    z.object({ ...base, type: z.literal('single'), options, correctId: z.string() }),
    z.object({ ...base, type: z.literal('multi'), options, correctIds: z.array(z.string()).min(1) }),
    z.object({ ...base, type: z.literal('boolean'), correct: z.boolean() }),
    z.object({
      ...base,
      type: z.literal('text'),
      accepted: spellings,
    }),
    z.object({
      ...base,
      type: z.literal('numeric'),
      correct: z.number().finite(),
      tolerance: z.number().finite().min(0),
    }),
    z.object({
      ...base,
      type: z.literal('order'),
      // Елементи зберігаються в правильному порядку.
      items: z.array(choice).min(LIMITS.minOrderItems).max(LIMITS.maxOrderItems),
      /** Що зверху списку, наприклад «Найбільший»; старі запитання без підпису. */
      topLabel: z.string().trim().max(LIMITS.orderLabel).refine(isStorable, UNSTORABLE).optional(),
      /** Що знизу списку, наприклад «Найменший». */
      bottomLabel: z.string().trim().max(LIMITS.orderLabel).refine(isStorable, UNSTORABLE).optional(),
    }),
    z.object({
      ...base,
      type: z.literal('match'),
      // Пари зберігаються правильними.
      pairs: z.array(z.object({ left: choice, right: choice })).min(LIMITS.minPairs).max(LIMITS.maxPairs),
    }),
    z.object({
      ...base,
      type: z.literal('chain'),
      /** words[0] видно всім; решта приховані. */
      words: z
        .array(z.string().trim().normalize('NFC').min(2).max(LIMITS.chainWord).regex(CHAIN_WORD).refine(isStorable, UNSTORABLE))
        .min(LIMITS.minChainWords)
        .max(LIMITS.maxChainWords),
      /** Скільки секунд додає гравцеві підказка. */
      hintSeconds: z.number().int().min(LIMITS.minHintSeconds).max(LIMITS.maxHintSeconds),
    }),
    z.object({
      ...base,
      // points — бали за кожне правильно відсортоване слово.
      type: z.literal('sort'),
      categories: z
        .array(
          z.object({
            id: z.string().min(1).refine(isStorable, UNSTORABLE),
            text: z.string().trim().min(1).max(LIMITS.sortCategory).refine(isStorable, UNSTORABLE),
          }),
        )
        .min(LIMITS.minSortCategories)
        .max(LIMITS.maxSortCategories),
      words: z
        .array(
          z.object({
            id: z.string().min(1).refine(isStorable, UNSTORABLE),
            text: z.string().trim().min(1).max(LIMITS.sortWord).refine(isStorable, UNSTORABLE),
            categoryId: z.string(),
          }),
        )
        .min(LIMITS.minSortWords)
        .max(LIMITS.maxSortWords),
      /** Секунди «підвисання» після помилки. */
      lockSeconds: z.number().int().min(LIMITS.minLockSeconds).max(LIMITS.maxLockSeconds),
    }),
    z.object({
      ...base,
      type: z.literal('slider'),
      min: z.number().finite(),
      max: z.number().finite(),
      step: z.number().finite().positive(),
      correct: z.number().finite(),
      tolerance: z.number().finite().min(0),
      /** Далі ніж ±zeroBeyond від правильного — 0 балів; немає — лише повні або 0. */
      zeroBeyond: z.number().finite().positive().optional(),
      /** Одиниця («км», «рік»); порожня не зберігається. */
      unit: z.string().trim().min(1).max(LIMITS.sliderUnit).refine(isStorable, UNSTORABLE).optional(),
    }),
    z.object({
      ...base,
      type: z.literal('clues'),
      /** Від найважчої до найлегшої; відкриваються по одній. */
      clues: z
        .array(z.string().trim().min(1).max(LIMITS.clueText).refine(isStorable, UNSTORABLE))
        .min(LIMITS.minClues)
        .max(LIMITS.maxClues),
      accepted: spellings,
      /** Секунд між підказками (класика й клітинка з телефона; на усній клітинці відкриває ведучий). */
      interval: z.number().int().min(LIMITS.minClueSeconds).max(LIMITS.maxClueSeconds),
    }),
    z.object({
      ...base,
      type: z.literal('pin'),
      /** Вбудована мапа; null — основа є власна картинка imageUrl. */
      map: z.enum(PIN_MAPS).nullable(),
      /** Ширина / висота основи. */
      aspect: z.number().finite().min(LIMITS.pinMinAspect).max(LIMITS.pinMaxAspect),
      /** Правильна точка: частки ширини й висоти основи. */
      target: z.object({ x: share01, y: share01 }),
      /** Радіус повних балів і радіус нуля, % довшої сторони. */
      fullRadius: z.number().finite().min(0).max(LIMITS.pinMaxFullRadius),
      zeroRadius: z.number().finite().positive().max(LIMITS.pinMaxZeroRadius),
    }),
    z.object({
      ...base,
      type: z.literal('wall'),
      /** Групи: 4×4 або 3×3; гравці бачать назву зв'язку лише на розкритті. */
      groups: z
        .array(
          z.object({
            id: z.string().min(1).refine(isStorable, UNSTORABLE),
            name: z.string().trim().min(1).max(LIMITS.wallGroupName).refine(isStorable, UNSTORABLE),
            tiles: z
              .array(
                z.object({
                  id: z.string().min(1).refine(isStorable, UNSTORABLE),
                  text: z.string().trim().min(1).max(LIMITS.wallTile).refine(isStorable, UNSTORABLE),
                }),
              )
              .min(3)
              .max(4),
          }),
        )
        .min(3)
        .max(4),
      /** Скільки помилок до замикання стіни для гравця. */
      mistakes: z.number().int().min(LIMITS.minWallMistakes).max(LIMITS.maxWallMistakes),
    }),
    z.object({ ...base, type: z.literal('poll'), options }),
    z.object({
      ...base,
      type: z.literal('wordcloud'),
      /** Скільки слів може написати гравець. */
      words: z.number().int().min(1).max(LIMITS.maxCloudWords),
    }),
  ])
  .superRefine((q, ctx) => {
    const ids =
      q.type === 'single' || q.type === 'multi' || q.type === 'poll'
        ? q.options.map((o) => o.id)
        : q.type === 'order'
          ? q.items.map((i) => i.id)
          : q.type === 'match'
            ? q.pairs.flatMap((p) => [p.left.id, p.right.id])
            : q.type === 'sort'
              ? [...q.categories.map((c) => c.id), ...q.words.map((w) => w.id)]
              : q.type === 'wall'
                ? [...q.groups.map((g) => g.id), ...q.groups.flatMap((g) => g.tiles.map((t) => t.id))]
                : [];
    if (hasDuplicates(ids)) ctx.addIssue({ code: 'custom', message: 'duplicate_ids' });
    if (q.type === 'chain' && q.video !== null) ctx.addIssue({ code: 'custom', message: 'chain_video' });
    if (q.type === 'sort') {
      if (q.video !== null) ctx.addIssue({ code: 'custom', message: 'sort_video' });
      const categoryIds = q.categories.map((c) => c.id);
      if (!q.words.every((w) => categoryIds.includes(w.categoryId))) ctx.addIssue({ code: 'custom', message: 'unknown_category' });
      if (!categoryIds.every((id) => q.words.some((w) => w.categoryId === id))) {
        ctx.addIssue({ code: 'custom', message: 'sort_empty_category' });
      }
      if (hasDuplicates(q.words.map((w) => w.text.trim().toLocaleLowerCase('uk')))) {
        ctx.addIssue({ code: 'custom', message: 'sort_duplicate_words' });
      }
      if (q.points * q.words.length > LIMITS.maxPoints) ctx.addIssue({ code: 'custom', message: 'sort_points' });
    }
    if (q.type === 'slider') {
      const steps = (q.max - q.min) / q.step;
      if (q.min >= q.max || steps > LIMITS.maxSliderSteps || Math.abs(steps - Math.round(steps)) > 1e-9) {
        ctx.addIssue({ code: 'custom', message: 'slider_range' });
      }
      if (q.correct < q.min || q.correct > q.max) ctx.addIssue({ code: 'custom', message: 'slider_correct' });
      if (q.zeroBeyond !== undefined && q.zeroBeyond <= q.tolerance) ctx.addIssue({ code: 'custom', message: 'slider_zero' });
    }
    if (q.type === 'clues') {
      if ((q.clues.length - 1) * q.interval + LIMITS.clueTailSeconds > q.timeLimit) ctx.addIssue({ code: 'custom', message: 'clues_time' });
      if (q.video !== null) ctx.addIssue({ code: 'custom', message: 'clues_video' });
    }
    if (q.type === 'pin') {
      if ((q.map === null) === (q.imageUrl === null)) ctx.addIssue({ code: 'custom', message: 'pin_base' });
      if (q.map !== null && Math.abs(q.aspect - PIN_MAP_ASPECT[q.map]) > 1e-6) ctx.addIssue({ code: 'custom', message: 'pin_aspect' });
      if (q.zeroRadius <= q.fullRadius) ctx.addIssue({ code: 'custom', message: 'pin_radius' });
      if (q.video !== null) ctx.addIssue({ code: 'custom', message: 'pin_video' });
    }
    if (q.type === 'wall') {
      if (q.groups.some((g) => g.tiles.length !== q.groups.length)) ctx.addIssue({ code: 'custom', message: 'wall_shape' });
      if (hasDuplicates(q.groups.flatMap((g) => g.tiles.map((t) => t.text.trim().toLocaleLowerCase('uk'))))) {
        ctx.addIssue({ code: 'custom', message: 'wall_duplicate_tiles' });
      }
      if (q.video !== null) ctx.addIssue({ code: 'custom', message: 'wall_video' });
    }
    if ((q.type === 'poll' || q.type === 'wordcloud') && q.points !== 0) ctx.addIssue({ code: 'custom', message: 'vote_points' });
    if (q.audio !== undefined && q.video !== null) ctx.addIssue({ code: 'custom', message: 'audio_video' });
    if (q.reveal !== undefined) {
      if (q.imageUrl === null) ctx.addIssue({ code: 'custom', message: 'reveal_image' });
      if (q.video !== null) ctx.addIssue({ code: 'custom', message: 'reveal_video' });
      if (!(REVEAL_TYPES as readonly string[]).includes(q.type)) ctx.addIssue({ code: 'custom', message: 'reveal_type' });
    }
    if (q.type === 'single' && !ids.includes(q.correctId)) {
      ctx.addIssue({ code: 'custom', message: 'unknown_correct_id' });
    }
    if (q.type === 'multi' && (hasDuplicates(q.correctIds) || !q.correctIds.every((id) => ids.includes(id)))) {
      ctx.addIssue({ code: 'custom', message: 'unknown_correct_id' });
    }
  });

export type Question = z.infer<typeof questionSchema>;

/** Типи з автоматичною перевіркою й простою відповіддю: друга спроба, голосування залу, запасні запитання. */
export const SIMPLE_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric', 'slider'] as const satisfies readonly Question['type'][];

/** Типи, де діє картинка, що проявляється (10b). */
export const REVEAL_TYPES = ['single', 'text', 'numeric'] as const satisfies readonly Question['type'][];

/** Скільки підказок відкрито через elapsedMs від старту таймера: 1 + ⌊elapsed / interval⌋, не більше n (від’ємне — 1). */
export function cluesAt(question: { clues: readonly string[]; interval: number }, elapsedMs: number): number {
  const total = question.clues.length;
  if (Number.isNaN(elapsedMs) || elapsedMs <= 0) return 1;
  if (!Number.isFinite(elapsedMs)) return total;
  return Math.min(total, 1 + Math.floor(elapsedMs / (question.interval * 1000)));
}

/** Частка ціни за відповідь після opened-ї з total підказок: (total − opened + 1) / total; opened притискається до 1…total, NaN — як 1. */
export function clueShare(total: number, opened: number): number {
  const k = Number.isNaN(opened) ? 1 : Math.min(total, Math.max(1, opened));
  return (total - k + 1) / total;
}

/** Відстань від правильної точки у % довшої сторони основи (пропорція враховується). */
export function pinDistance(question: { aspect: number; target: { x: number; y: number } }, x: number, y: number): number {
  const w = question.aspect >= 1 ? 1 : question.aspect;
  const h = question.aspect >= 1 ? 1 / question.aspect : 1;
  return 100 * Math.hypot((x - question.target.x) * w, (y - question.target.y) * h);
}

/** Частка ціни за точку: коло повних — 1, до кола нуля — лінійно, далі й поза 0…1 — 0. */
export function pinShare(question: Extract<Question, { type: 'pin' }>, x: number, y: number): number {
  const EPS = 1e-9;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return 0;
  const d = pinDistance(question, x, y);
  if (d <= question.fullRadius + EPS) return 1;
  if (d < question.zeroRadius - EPS) return (question.zeroRadius - d) / (question.zeroRadius - question.fullRadius);
  return 0;
}

/** Частка ціни за значення повзунка: допуск — 1, до межі нуля — лінійно, далі й поза шкалою — 0. */
export function sliderShare(question: Extract<Question, { type: 'slider' }>, value: number): number {
  const EPS = 1e-9;
  if (!Number.isFinite(value) || value < question.min - EPS || value > question.max + EPS) return 0;
  const d = Math.abs(value - question.correct);
  if (d <= question.tolerance + EPS) return 1;
  const zero = question.zeroBeyond;
  if (zero !== undefined && d < zero - EPS) return (zero - d) / (zero - question.tolerance);
  return 0;
}

type Timed = Pick<Question, 'timeLimit'> & { audio?: QuestionAudio };

/** На скільки довший фрагмент відкладає таймер, мс: duration, якщо він довший за timeLimit; інакше 0. */
export function audioLeadMs(question: Timed): number {
  const duration = question.audio?.duration;
  return duration !== undefined && duration > question.timeLimit ? duration * 1000 : 0;
}

/** Повний час відповіді, мс: timeLimit × 1000 + audioLeadMs. */
export function answerWindowMs(question: Timed): number {
  return question.timeLimit * 1000 + audioLeadMs(question);
}

/** Частка ціни за час відповіді на картинці, що проявляється: від 1 до REVEAL_MIN_SHARE. */
export function revealShare(timeMs: number, windowMs: number): number {
  if (windowMs <= 0) return REVEAL_MIN_SHARE;
  const t = Math.min(1, Math.max(0, timeMs / windowMs));
  return 1 - (1 - REVEAL_MIN_SHARE) * t;
}

/** Типи без балів (10d): не йдуть у таблицю, серії, точність і досягнення. */
export const UNSCORED_TYPES = ['poll', 'wordcloud'] as const satisfies readonly Question['type'][];

export function isUnscored(question: { type: Question['type'] }): boolean {
  return (UNSCORED_TYPES as readonly string[]).includes(question.type);
}

/** Груп, що дають бали: остання група стіни складається сама й балів не дає. */
export function wallScored(found: number, groups: number): number {
  return Math.min(Math.max(found, 0), groups - 1);
}

/** Частка ціни стіни: wallScored / groups. */
export function wallShare(found: number, groups: number): number {
  return groups <= 0 ? 0 : wallScored(found, groups) / groups;
}

/** Ключ слова «хмари»: NFC, обрізано, пробіли зведено, апострофи ’ʼ‘` → ', toLocaleLowerCase('uk'). */
export function cloudKey(word: string): string {
  return word.normalize('NFC').trim().replace(/\s+/gu, ' ').replace(/[’ʼ‘`]/gu, "'").toLocaleLowerCase('uk');
}

/** Слова гравця: обрізані, пробіли зведено, без порожніх і повторів за cloudKey, не більше max. */
export function cloudWords(words: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    const text = word.normalize('NFC').trim().replace(/\s+/gu, ' ');
    const key = cloudKey(text);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Бали за близькість відповіді чи кількість знайденого (повзунок, точка, стіна): частка вбудована, не залежить від правила «частково»,
 * правильна — частка ≥ 0,5 (14a). Картинка, що проявляється, сюди не входить: її спадання — плата за час, не правильність.
 */
export function proximityPartial(question: Question): boolean {
  return question.type === 'slider' || question.type === 'pin' || question.type === 'wall';
}

/** Ціна запитання: для сортування — найбільша сума (слова × бали за слово), інакше points. */
export function questionPrice(question: Question): number {
  if (question.type === 'poll' || question.type === 'wordcloud') return 0;
  return question.type === 'sort' ? question.points * question.words.length : question.points;
}

export const roundRulesSchema = z.object({
  penalty: z.enum(['none', 'minus']),
  /** Частка балів за «частково», у відсотках; null — кнопки «частково» немає. */
  partial: z.number().int().min(10).max(90).nullable(),
  streak: z
    .object({
      length: z.number().int().min(2).max(10),
      bonus: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('percent'), value: z.number().int().min(1).max(200) }),
        z.object({ kind: z.literal('fixed'), value: z.number().int().min(1).max(LIMITS.maxPoints) }),
      ]),
    })
    .nullable(),
  multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export type RoundRules = z.infer<typeof roundRulesSchema>;

export const DEFAULT_RULES: RoundRules = { penalty: 'none', partial: null, streak: null, multiplier: 1 };

export const classicRoundSchema = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  type: z.literal('classic'),
  title: z.string().trim().max(LIMITS.roundTitle).refine(isStorable, UNSTORABLE),
  /** Опис раунду від автора для заставки; старі вікторини без нього. */
  description: z.string().trim().max(LIMITS.roundDescription).refine(isStorable, UNSTORABLE).optional(),
  speedBonus: z.boolean(),
  shuffleOptions: z.boolean(),
  rules: roundRulesSchema,
  questions: z.array(questionSchema).min(1).max(LIMITS.maxQuestions),
});

export type ClassicRound = z.infer<typeof classicRoundSchema>;

/** Типове вікно відповіді в бліці, секунди. */
export const DEFAULT_ANSWER_WINDOW = 15;

/** Бліц: гравці натискають «Відповісти» й відповідають по черзі; бали отримує перший правильний. */
export const blitzRoundSchema = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  type: z.literal('blitz'),
  title: z.string().trim().max(LIMITS.roundTitle).refine(isStorable, UNSTORABLE),
  /** Опис раунду від автора для заставки; старі вікторини без нього. */
  description: z.string().trim().max(LIMITS.roundDescription).refine(isStorable, UNSTORABLE).optional(),
  shuffleOptions: z.boolean(),
  /** Секунди на відповідь після натискання; null — до кінця таймера запитання. */
  answerWindow: z.number().int().min(5).max(120).nullable(),
  /** Спроб на запитання; null — без обмежень. */
  attempts: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  check: z.enum(['auto', 'manual']),
  // Часткових балів у бліці немає.
  rules: roundRulesSchema.extend({ partial: z.null() }),
  questions: z.array(questionSchema).min(1).max(LIMITS.maxQuestions),
});

export type BlitzRound = z.infer<typeof blitzRoundSchema>;

export const CELL_MARKS = ['none', 'x2', 'x3'] as const;
export type CellMark = (typeof CELL_MARKS)[number];

/** Клітинка — одне запитання; її ціна — question.points, її id — question.id. */
export const CELL_KINDS = ['normal', 'blitz'] as const;
export type CellKind = (typeof CELL_KINDS)[number];
export const ANSWER_MODES = ['phone', 'voice'] as const;
export type AnswerMode = (typeof ANSWER_MODES)[number];
export const CELL_PENALTIES = ['none', 'all'] as const;
export type CellPenalty = (typeof CELL_PENALTIES)[number];

export const boardCellSchema = z.object({
  mark: z.enum(CELL_MARKS),
  kind: z.enum(CELL_KINDS).default('normal'),
  /** Немає — спосіб раунду (старі вікторини). */
  answerMode: z.enum(ANSWER_MODES).optional(),
  /** Лише для kind 'blitz'. */
  penalty: z.enum(CELL_PENALTIES).default('none'),
  question: questionSchema,
});

export const boardCategorySchema = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  title: z.string().trim().min(1).max(LIMITS.categoryTitle).refine(isStorable, UNSTORABLE),
  cells: z.array(boardCellSchema).min(LIMITS.minCategoryQuestions).max(LIMITS.maxCategoryQuestions),
  /** Запасні цієї категорії для «Заміни запитання» (9d); старі категорії без поля. */
  spares: z.array(questionSchema).min(1).max(LIMITS.maxCategorySpares).optional(),
});

/** Ігрове поле: категорії клітинок-запитань, гравці по черзі вибирають клітинку. */
export const boardRoundSchema = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  type: z.literal('board'),
  title: z.string().trim().max(LIMITS.roundTitle).refine(isStorable, UNSTORABLE),
  /** Опис раунду від автора для заставки; старі вікторини без нього. */
  description: z.string().trim().max(LIMITS.roundDescription).refine(isStorable, UNSTORABLE).optional(),
  shuffleOptions: z.boolean(),
  categories: z.array(boardCategorySchema).min(LIMITS.minCategories).max(LIMITS.maxCategories),
  /** Типовий спосіб для нових клітинок і для клітинок без власного. */
  answerMode: z.enum(ANSWER_MODES),
  /** Для клітинок з телефона; усну клітинку оцінює ведучий завжди. */
  check: z.enum(['auto', 'manual']),
  rules: roundRulesSchema,
});

export type BoardCell = z.infer<typeof boardCellSchema>;
export type BoardCategory = z.infer<typeof boardCategorySchema>;
export type BoardRound = z.infer<typeof boardRoundSchema>;

/** Спосіб відповіді клітинки: власний або, якщо його немає, раунду. */
export function cellAnswerMode(round: BoardRound, cell: BoardCell): AnswerMode {
  return cell.answerMode ?? round.answerMode;
}

/** Тип ставок фіналу: класичні (±ставка) або спільний банк. */
export const WAGER_MODES = ['classic', 'bank'] as const;
export type WagerMode = (typeof WAGER_MODES)[number];

/** Фінал: тема (title), таємні ставки й одне запитання для всіх. */
export const finalRoundSchema = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  type: z.literal('final'),
  title: z.string().trim().max(LIMITS.roundTitle).refine(isStorable, UNSTORABLE),
  /** Опис раунду від автора для заставки; старі вікторини без нього. */
  description: z.string().trim().max(LIMITS.roundDescription).refine(isStorable, UNSTORABLE).optional(),
  shuffleOptions: z.boolean(),
  check: z.enum(['auto', 'manual']),
  /** Тип ставок; старі вікторини без нього — класичні. */
  wagerMode: z.enum(WAGER_MODES).default('classic'),
  /** Рівно одне запитання. */
  questions: z.array(questionSchema).length(1),
});

export type FinalRound = z.infer<typeof finalRoundSchema>;

/** Типи раундів у порядку редактора; звіряється з roundSchema у тесті. */
export const ROUND_TYPES = ['classic', 'blitz', 'board', 'final'] as const;
export type RoundType = (typeof ROUND_TYPES)[number];

export const roundSchema = z.discriminatedUnion('type', [
  classicRoundSchema,
  blitzRoundSchema,
  boardRoundSchema,
  finalRoundSchema,
]);

export type Round = z.infer<typeof roundSchema>;

/** Типи-перевірки: списки ROUND_TYPES і QUESTION_TYPES мають збігатися зі схемами (помилка типів, якщо ні). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const ROUND_TYPES_MATCH_SCHEMA: Same<RoundType, Round['type']> = true;
export const QUESTION_TYPES_MATCH_SCHEMA: Same<QuestionType, Question['type']> = true;

/** Правила балів раунду; у фіналі правил немає — DEFAULT_RULES (без серій, штрафу, частково, множник 1). */
export function rulesOf(round: Round): RoundRules {
  return round.type === 'final' ? DEFAULT_RULES : round.rules;
}

/** Запитання дуелі: текстова відповідь, як у типі text; без картинки й відео. */
export const duelQuestionSchema = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  text: z.string().trim().min(1).max(LIMITS.questionText).refine(isStorable, UNSTORABLE),
  accepted: z
    .array(z.string().trim().min(1).max(LIMITS.answerText).refine(isStorable, UNSTORABLE))
    .min(1)
    .max(LIMITS.maxAccepted),
});

export const duelCategorySchema = z.object({
  id: z.string().min(1).refine(isStorable, UNSTORABLE),
  title: z.string().trim().min(1).max(LIMITS.categoryTitle).refine(isStorable, UNSTORABLE),
  questions: z.array(duelQuestionSchema).min(1).max(LIMITS.maxDuelCategoryQuestions),
});

/** Дуелі вікторини; немає поля — дуелей немає. */
export const duelsSchema = z.object({
  categories: z.array(duelCategorySchema).min(1).max(LIMITS.maxDuelCategories),
  questionsPerDuel: z.number().int().min(1).max(LIMITS.maxDuelQuestions),
  /** Секунд на одне запитання дуелі. */
  timeLimit: z.number().int().min(LIMITS.minTime).max(LIMITS.maxTime),
  /** Скільки програвший віддає переможцю; 0 — без втрат. */
  stake: z.number().int().min(0).max(LIMITS.maxDuelStake),
});

export type DuelQuestion = z.infer<typeof duelQuestionSchema>;
export type DuelCategory = z.infer<typeof duelCategorySchema>;
export type Duels = z.infer<typeof duelsSchema>;

export const quizSettingsSchema = z.object({
  leaderboard: z.enum(['each', 'end']),
  /** Дозволені дебафи; немає поля — усі шість (старі вікторини). */
  debuffs: z.array(z.enum(DEBUFF_KINDS)).max(DEBUFF_KINDS.length).optional(),
  /** Дозволені бафи; немає поля — жодного. */
  buffs: z.array(z.enum(BUFF_KINDS)).max(BUFF_KINDS.length).optional(),
  /** Пояснення для новачків (8d): «Як грати», пам'ятка раунду, підказка нового типу; немає поля — вимкнено. */
  newcomers: z.boolean().optional(),
  /** Ціни дебафів для гравців; немає ключа — LIMITS.defaultDebuffPrice. */
  debuffPrices: z
    .partialRecord(z.enum(DEBUFF_KINDS), z.number().int().min(LIMITS.minDebuffPrice).max(LIMITS.maxDebuffPrice))
    .optional(),
  /** Чи можуть гравці купувати дебафи (9c); немає поля — можуть, якщо дебафи дозволені. */
  debuffShop: z.boolean().optional(),
});

export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const DEFAULT_SETTINGS: QuizSettings = {
  leaderboard: 'each',
};

export const quizSchema = z
  .object({
    title: z.string().trim().min(1).max(120).refine(isStorable, UNSTORABLE),
    description: z.string().max(500).refine(isStorable, UNSTORABLE),
    settings: quizSettingsSchema,
    rounds: z.array(roundSchema).min(1).max(LIMITS.maxRounds),
    /** Дуелі між гравцями; старі вікторини без поля — без дуелей. */
    duels: duelsSchema.optional(),
    /** Запасні запитання для бафу «Заміна запитання»; старі вікторини без поля. */
    spares: z.array(questionSchema).min(1).max(LIMITS.maxSpares).optional(),
  })
  .superRefine((quiz, ctx) => {
    const questions = quiz.rounds.flatMap(roundQuestions);
    if (questions.length > LIMITS.maxQuizQuestions) ctx.addIssue({ code: 'custom', message: 'too_many_questions' });
    if (hasDuplicates(questions.map((q) => q.id))) ctx.addIssue({ code: 'custom', message: 'duplicate_question_ids' });
    if (hasDuplicates(quiz.rounds.map((r) => r.id))) ctx.addIssue({ code: 'custom', message: 'duplicate_round_ids' });
    for (const round of quiz.rounds) {
      if ((round.type === 'blitz' || round.type === 'board') && roundQuestions(round).some((q) => q.type === 'chain')) {
        ctx.addIssue({ code: 'custom', message: 'chain_round' });
      }
      if (round.type === 'board') {
        for (const message of boardRoundIssues(round)) ctx.addIssue({ code: 'custom', message });
        // Сортування на полі — лише звичайна клітинка з телефона.
        const sortCell = boardCells(round).some(
          ({ cell }) => cell.question.type === 'sort' && (cell.kind !== 'normal' || cellAnswerMode(round, cell) !== 'phone'),
        );
        if (sortCell) ctx.addIssue({ code: 'custom', message: 'sort_cell' });
      }
      // Картинка, що проявляється: лише класика й звичайна клітинка поля з телефона.
      const revealPlace =
        round.type === 'board'
          ? boardCells(round).some(
              ({ cell }) => cell.question.reveal !== undefined && (cell.kind !== 'normal' || cellAnswerMode(round, cell) !== 'phone'),
            )
          : round.type !== 'classic' && roundQuestions(round).some((q) => q.reveal !== undefined);
      if (revealPlace) ctx.addIssue({ code: 'custom', message: 'reveal_place' });
      // «Хто я?»: класика й звичайна чи усна клітинка поля; не в бліці, фіналі й на бліц-клітинці.
      const cluesPlace =
        round.type === 'board'
          ? boardCells(round).some(({ cell }) => cell.question.type === 'clues' && cell.kind !== 'normal')
          : round.type !== 'classic' && roundQuestions(round).some((q) => q.type === 'clues');
      if (cluesPlace) ctx.addIssue({ code: 'custom', message: 'clues_place' });
      // Точка: класика й звичайна клітинка з телефона.
      const pinPlace =
        round.type === 'board'
          ? boardCells(round).some(({ cell }) => cell.question.type === 'pin' && (cell.kind !== 'normal' || cellAnswerMode(round, cell) !== 'phone'))
          : round.type !== 'classic' && roundQuestions(round).some((q) => q.type === 'pin');
      if (pinPlace) ctx.addIssue({ code: 'custom', message: 'pin_place' });
      // Стіна: класика й звичайна клітинка з телефона.
      const wallPlace =
        round.type === 'board'
          ? boardCells(round).some(({ cell }) => cell.question.type === 'wall' && (cell.kind !== 'normal' || cellAnswerMode(round, cell) !== 'phone'))
          : round.type !== 'classic' && roundQuestions(round).some((q) => q.type === 'wall');
      if (wallPlace) ctx.addIssue({ code: 'custom', message: 'wall_place' });
      // Опитування й «хмара слів»: лише класика.
      const votePlace = round.type !== 'classic' && roundQuestions(round).some((q) => q.type === 'poll' || q.type === 'wordcloud');
      if (votePlace) ctx.addIssue({ code: 'custom', message: 'vote_place' });
    }
    const { debuffs, buffs } = quiz.settings;
    if ((debuffs && hasDuplicates(debuffs)) || (buffs && hasDuplicates(buffs))) {
      ctx.addIssue({ code: 'custom', message: 'duplicate_powers' });
    }
    if (buffs?.some((kind) => !READY_BUFFS.includes(kind))) ctx.addIssue({ code: 'custom', message: 'buff_unavailable' });
    const pools = [...(quiz.spares ?? []), ...categorySparesOf(quiz)];
    if (pools.length > 0) {
      const types: readonly string[] = SIMPLE_TYPES;
      if (pools.some((s) => !types.includes(s.type))) ctx.addIssue({ code: 'custom', message: 'spare_type' });
      if (pools.some((s) => s.video !== null || s.audio !== undefined || s.reveal !== undefined)) ctx.addIssue({ code: 'custom', message: 'spare_video' });
      if (hasDuplicates([...questions.map((x) => x.id), ...pools.map((s) => s.id)].filter(Boolean))) {
        ctx.addIssue({ code: 'custom', message: 'duplicate_spare_ids' });
      }
    }
    if (buffs?.includes('swap') && pools.length === 0) ctx.addIssue({ code: 'custom', message: 'spares_empty' });
    if (quiz.duels) {
      const { categories, questionsPerDuel } = quiz.duels;
      if (categories.some((c) => c.questions.length < questionsPerDuel)) {
        ctx.addIssue({ code: 'custom', message: 'duel_category_short' });
      }
      const ids = categories.flatMap((c) => [c.id, ...c.questions.map((q) => q.id)]);
      if (hasDuplicates(ids)) ctx.addIssue({ code: 'custom', message: 'duplicate_duel_ids' });
    }
  });

export type Quiz = z.infer<typeof quizSchema>;

/** Дозволені дебафи в порядку DEBUFF_KINDS. */
export function allowedDebuffs(quiz: Pick<Quiz, 'settings'>): DebuffKind[] {
  const chosen = quiz.settings.debuffs;
  return chosen ? DEBUFF_KINDS.filter((kind) => chosen.includes(kind)) : [...DEBUFF_KINDS];
}

/** Ціна дебафу у вікторині для гравців (ведучий насилає безкоштовно). */
export function debuffPrice(quiz: Pick<Quiz, 'settings'>, kind: DebuffKind): number {
  return quiz.settings.debuffPrices?.[kind] ?? LIMITS.defaultDebuffPrice;
}

/** Дозволені готові бафи в порядку BUFF_KINDS. */
export function allowedBuffs(quiz: Pick<Quiz, 'settings'>): BuffKind[] {
  const chosen = quiz.settings.buffs;
  return chosen ? BUFF_KINDS.filter((kind) => chosen.includes(kind) && READY_BUFFS.includes(kind)) : [];
}

/** Усі запитання вікторини в порядку раундів. */
export function questionsOf(quiz: Quiz): Question[] {
  return quiz.rounds.flatMap(roundQuestions);
}

/** Усі запитання раунду: у полі — по категоріях, у порядку клітинок. */
export function roundQuestions(round: Round): Question[] {
  return round.type === 'board' ? boardCells(round).map(({ cell }) => cell.question) : round.questions;
}

/** ⌈запитань не-фінальних раундів / 3⌉; null — дуелей немає (немає duels або таких запитань 0). */
export function duelThreshold(quiz: Quiz): number | null {
  if (quiz.duels === undefined) return null;
  const count = quiz.rounds.reduce((sum, round) => (round.type === 'final' ? sum : sum + roundQuestions(round).length), 0);
  return count === 0 ? null : Math.ceil(count / 3);
}

/** Індекс першого фінального раунду; без фіналу — останнього раунду. */
export function duelCutoff(quiz: Quiz): number {
  const final = quiz.rounds.findIndex((round) => round.type === 'final');
  return final === -1 ? quiz.rounds.length - 1 : final;
}

/**
 * Скільки запитань має бути в раундах до межі, якщо їх замало й дуель ніколи не стане можливою;
 * null — запитань досить або дуелей немає.
 */
export function duelShortfall(quiz: Quiz): number | null {
  if (quiz.duels === undefined) return null;
  const needed = duelThreshold(quiz) ?? 1;
  const before = quiz.rounds.slice(0, duelCutoff(quiz)).reduce((sum, round) => sum + roundQuestions(round).length, 0);
  return before >= needed ? null : needed;
}

export interface CellRef {
  categoryIndex: number;
  index: number;
  category: BoardCategory;
  cell: BoardCell;
}

/** Клітинки поля по категоріях, у порядку клітинок. */
export function boardCells(round: BoardRound): CellRef[] {
  return round.categories.flatMap((category, categoryIndex) =>
    category.cells.map((cell, index) => ({ categoryIndex, index, category, cell })),
  );
}

/** Клітинка за id; id клітинки — це id її запитання. */
export function findCell(round: BoardRound, cellId: string): CellRef | undefined {
  return boardCells(round).find(({ cell }) => cell.question.id === cellId);
}

/** Запасні всіх категорій усіх полів у порядку раундів і категорій. */
export function categorySparesOf(quiz: Pick<Quiz, 'rounds'>): Question[] {
  return quiz.rounds.flatMap((r) => (r.type === 'board' ? r.categories.flatMap((c) => c.spares ?? []) : []));
}

/** Усі запасні вікторини (загальні, потім категорій) — для пошуку запасного за id у грі й історії. */
export function allSpares(quiz: Pick<Quiz, 'rounds' | 'spares'>): Question[] {
  return [...(quiz.spares ?? []), ...categorySparesOf(quiz)];
}

/**
 * Звідки заміна на полі бере запасне: 'category' — хоч одна категорія має власні запасні (9d),
 * тоді кожна клітинка бере лише зі своєї категорії; 'quiz' — жодна не має (вікторини до 9d), загальний пул.
 */
export function boardSpareSource(quiz: Pick<Quiz, 'rounds'>): 'category' | 'quiz' {
  return categorySparesOf(quiz).length > 0 ? 'category' : 'quiz';
}

/** Перевірки поля, які схема форми не бачить. */
export function boardRoundIssues(round: BoardRound): string[] {
  const issues: string[] = [];
  if (hasDuplicates(round.categories.map((c) => c.id))) issues.push('duplicate_ids');
  if (boardCells(round).length > LIMITS.maxQuestions) issues.push('too_many_questions');
  return issues;
}
