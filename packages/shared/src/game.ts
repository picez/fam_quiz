/** intro — заставка раунду, round_end — підсумки раунду. */
export type Phase = 'lobby' | 'guide' | 'intro' | 'wager' | 'question' | 'locked' | 'reveal' | 'board' | 'leaderboard' | 'round_end' | 'finished' | 'duel';

/** declared — оголошена, чекає кінця поточного запитання; далі етапи самої дуелі. */
export type DuelStage = 'declared' | 'category' | 'question' | 'answer' | 'result';

export type Grade = 'correct' | 'partial' | 'wrong';

/** Звідки коригування рахунку поза відповідями: бали від ведучого, дуель або купівля дебафу (9c). */
export type AdjustmentSource = 'host' | 'duel' | 'debuff' | 'survival'
  /** Виграш драбини (10i). */
  | 'ladder'
  /** Скасування балів ведучим (12a): мінус те, що скасовано; «Повернути» — скасування скасування. */
  | 'undo'
  /** Штраф за вихід із гри (12e): мінус бали запитання; запитання — afterQuestion − 1. */
  | 'away'
  /** Рішення залу за апеляцією (12f): бали «правильно» мінус бали запису (чи зняття вже дописаного штрафу); запитання — afterQuestion − 1. */
  | 'appeal'
  /** Перенесено з попередньої гри (12r): стартові бали учасника; раунд — стартовий, afterQuestion 0; не скасовується й не є балами раунду. */
  | 'carry';

/** Дебафи від ведучого: діють на телефоні цілі в наступному запитанні, у якому вона відповідає. */
export const DEBUFF_KINDS = ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud'] as const;
export type DebuffKind = (typeof DEBUFF_KINDS)[number];

/** Бафи: гравець бере сам на своєму телефоні, по одному кожного дозволеного на гру. */
export const BUFF_KINDS = ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap'] as const;
export type BuffKind = (typeof BUFF_KINDS)[number];
/** Усі бафи працюють (частина 8b); перевірка buff_unavailable лишається для майбутніх видів. */
export const READY_BUFFS: readonly BuffKind[] = [...BUFF_KINDS];

/** armed — чекає першої відповіді; again — друга спроба відкрита; choice — перша часткова, гравець вибирає; done. */
export type RetryStage = 'armed' | 'again' | 'choice' | 'done';

/** Чому кнопку бафу зараз не натиснути. off_* — у цьому запитанні бафів немає взагалі. */
export type BuffBlock =
  | 'used' | 'taken' | 'answered' | 'time' | 'paused' | 'elsewhere' | 'not_chooser'
  | 'off_blitz' | 'off_blitz_cell' | 'off_final' | 'off_chain' | 'off_sort'
  /** Стіна: бафів немає (10d). */
  | 'off_wall'
  /** Опитування й хмара: без балів — без бафів (10d). */
  | 'off_vote'
  | 'unfit_type' | 'unfit_options' | 'unfit_timer' | 'unfit_penalty' | 'unfit_manual' | 'unfit_voice'
  | 'no_voters' | 'spares_out' | 'not_started'
  /** На полі: у категорії клітинки немає власних запасних (9d). */
  | 'no_category_spares'
  /** Картинка, що проявляється: відповідь одна (10b). */
  | 'unfit_reveal'
  /** Блеф: діють лише «Подвійні бали» і «Щит» (10f). */
  | 'unfit_bluff'
  /** «Ва-банк»: бафів немає (10g). */
  | 'off_wipeout'
  /** «Вибування»: бафів немає (10h). */
  | 'off_survival'
  /** «Мільйонер»: бафів немає, свої підказки (10i). */
  | 'off_ladder'
  /** Гра без ведучого: підказки ведучого немає, а автор не написав тексту (11g). */
  | 'unfit_host';

/** Заставки переходів (частина 8c). */
export type SplashKind = 'round' | 'final' | 'question' | 'cell' | 'duel' | 'podium' | 'trial';

/** Тривалість кожної заставки, мс; кінець заставки запитання — старт його таймера. Рушій і веб читають одне число. 8c; 11b — довші приблизно в півтора раза (крім п'єдесталу й випробування). */
export const SPLASH_MS: Record<SplashKind, number> = { round: 3500, final: 4000, question: 1800, cell: 1500, duel: 2500,
  podium: 2500,
  /** Драматична заставка випробування «Вибування» (10h). */
  trial: 2200,
};

/**
 * Мінімальний час перед кроком ведучого, мс (11b): крок (розкриття, таблиця, кінець раунду, «Як грати», пропуск ходу, після дуелі), рядок «100 до 1» / варіант блефу, заставка раунду (після її кінця), дострокове закриття (після старту).
 * decisions — екран рішень «Ва-банк» після закриття вікна (11e).
 */
export const PACE_MS = { step: 2000, row: 1000, intro: 3000, lock: 3000, decisions: 3000 } as const;

/** Скільки довше триває перегортання клітинки з ×2/×3: сюрприз після перегортання, мс. */
export const CELL_SURPRISE_MS = 800;

/** Телефон шле нахил картки сортування не частіше ніж раз на стільки мс (11d). */
export const SORT_TILT_MS = 100;
/** Сервер відкидає нахил, що прийшов раніше ніж через стільки мс після попереднього (запас на тремтіння мережі). */
export const SORT_TILT_GAP_MS = 80;

/** Чому гравцеві зараз не купити дебаф (бали — окремо, на кожному дебафі). */
export type ShopBlock = 'phase' | 'paused' | 'bought';

export type ErrorCode =
  | 'wrong_phase'
  | 'paused'
  | 'not_found'
  | 'no_players'
  /** «Мільйонер»: ведучий ще не вибрав учасника (10i). */
  | 'ladder_pick'
  | 'room_full'
  | 'nickname_invalid'
  | 'nickname_taken'
  | 'already_answered'
  /** Усі підказки «Хто я?» уже відкрито (10c). */
  | 'clues_done'
  /** Вибір плиток стіни не підходить: не та кількість, повтор, знайдена плитка або поза стіною (10d). */
  | 'wall_pick'
  /** Цей неправильний вибір уже був — помилка не рахується (10d). */
  | 'wall_repeat'
  /** Вигадка збігається з правдою (10f). */
  | 'bluff_truth'
  /** Свою вигадку вибрати не можна (10f). */
  | 'bluff_own'
  /** «Ва-банк»: гравці ще вибирають «Далі» чи «Забрати» (10g). */
  | 'deciding'
  | 'time_over'
  | 'type_mismatch'
  | 'partial_disabled'
  | 'wager_invalid'
  | 'not_in_queue'
  | 'already_queued'
  | 'no_attempts'
  | 'not_your_turn'
  | 'cell_closed'
  | 'time_limit'
  | 'wrong_word'
  | 'no_hint'
  | 'hint_late'
  | 'dice_pending'
  | 'points_invalid'
  /** Продовжити гру (12r): раунд поза вікториною чи бали не цілі або поза межами. */
  | 'resume_invalid'
  | 'debuff_busy'
  | 'points_short'
  | 'debuff_bought'
  | 'target_offline'
  | 'sort_locked'
  | 'sort_stale'
  | 'duel_used'
  | 'duel_busy'
  | 'duel_empty'
  | 'not_allowed'
  | 'buff_used'
  | 'buff_busy'
  | 'buff_unfit'
  | 'vote_closed'
  | 'vote_denied'
  /** Апеляція (12f): зал ще голосує — «Далі» й нова апеляція чекають. */
  | 'appeal_open'
  /** Апеляція (12f): ліміт на гру вичерпано. */
  | 'appeals_used'
  /** Апеляція (12f): цю відповідь чи цей раунд оскаржити не можна. */
  | 'appeal_unfit'
  /** Апеляція (12f): голосувати нікому. */
  | 'no_voters'
  /** Командна гра: менше двох непорожніх команд (10j). */
  | 'teams_few'
  /** Командна гра: дія не для цього способу формування (10j). */
  | 'team_form'
  /** Командна гра: за команду діє капітан (10j). */
  | 'not_captain'
  /** Командна гра: у дуелі відповідає дуелянт команди (10j). */
  | 'not_duelist'
  | 'not_started'
  /** Крок ведучого раніше за мінімальний час (11b). */
  | 'too_soon'
  /** Скасування балів: ці бали вже скасовано (12a). */
  | 'already_undone'
  /** Автопілот: автор прибирає вигадку лише після свого вибору (11g). */
  | 'pick_first';
