import { afterEach, describe, expect, it } from 'vitest';
import golden from './__fixtures__/uk-golden.json';
import { activateLocale, activateLocaleForTests, activeMessages, countText, errorText, t, ukMessages } from './i18n';

describe('i18n', () => {
  it('substitutes variables', () => {
    expect(t('answeredOf', { answered: 7, total: 12 })).toBe('Відповіли 7 з 12');
  });

  it('explains known error codes and falls back for unknown ones', () => {
    expect(errorText('nickname_taken')).toBe('Таке ім’я вже зайняте. Виберіть інше.');
    expect(errorText('invalid_payload:prize_empty')).toBe('Увімкни хоча б одну опцію.');
    expect(errorText('invalid_payload:other')).toBe('Некоректні дані.');
    expect(errorText('something_new')).toBe('Щось пішло не так. Спробуйте ще раз.');
  });
});

describe('countText', () => {
  it('picks the Ukrainian form of the noun for the number', () => {
    const games = (count: number) => countText('statGames', count);
    expect([1, 21, 101].map(games)).toEqual(['гра', 'гра', 'гра']);
    expect([2, 3, 4, 22, 104].map(games)).toEqual(['гри', 'гри', 'гри', 'гри', 'гри']);
    expect([0, 5, 11, 12, 14, 20, 111, 112].map(games)).toEqual(Array(8).fill('ігор'));
    expect([1, 2, 5].map((count) => countText('statWins', count))).toEqual(['перемога', 'перемоги', 'перемог']);
  });

  it('substitutes variables into the chosen form', () => {
    const they = (count: number) => countText('versusTheyHigher', count, { name: 'Віра' });
    expect([1, 3, 0, 5].map(they)).toEqual(['гра, де Віра вище', 'гри, де Віра вище', 'ігор, де Віра вище', 'ігор, де Віра вище']);
  });

  it('counts board cells that are not ready (11a)', () => {
    const notReady = (count: number) => countText('boardNotReady', count, { count });
    expect([1, 2, 5, 11, 21].map(notReady)).toEqual(['1 не готова', '2 не готові', '5 не готових', '11 не готових', '21 не готова']);
  });
});

describe('sort prices', () => {
  it('per-word price and total read right for 1, 2–4, 5+ and 21', () => {
    const word = (points: number) => countText('sortPointsPerWord', points, { points });
    expect([1, 2, 5, 21, 100].map(word)).toEqual(['1 бал за слово', '2 бали за слово', '5 балів за слово', '21 бал за слово', '100 балів за слово']);
    const total = (sum: number) => countText('sortTotal', sum, { total: sum });
    expect([21, 4, 400].map(total)).toEqual(['Разом до 21 бала (не більше 2000)', 'Разом до 4 балів (не більше 2000)', 'Разом до 400 балів (не більше 2000)']);
  });
});

describe('points in words', () => {
  it('agrees the word with the number', () => {
    const said = [0, 1, 2, 5, 11, 21, 871, 1000, 1322].map((score) => t('yourResult', { score, points: countText('pointsWord', score), correct: 1, total: 2 }));
    expect(said.map((line) => line.split(',')[0])).toEqual([
      '0 балів',
      '1 бал',
      '2 бали',
      '5 балів',
      '11 балів',
      '21 бал',
      '871 бал',
      '1000 балів',
      '1322 бали',
    ]);
  });
});

describe('uk golden (22a)', () => {
  /** Ключі, які 22a свідомо прибирає з uk. Задача 4 дописує 'agoMinutes' і 'agoHours'. */
  const REMOVED: string[] = ['agoMinutes', 'agoHours', /* меню з п'яти пунктів: призи, досягнення й друзі живуть у профілі */ 'menuAchievements', 'menuPrizes', 'menuShortPrizes', 'menuShortAchievements', /* друзі переїхали з профілю на /friends */ 'openProfile', /* головна профілю з плиток (23a): «Мої вікторини» стали «Найпопулярніші вікторини», «Друзі» — плиткою */ 'myQuizzesTitle', 'friendsTitle', /* публічний профіль більше не пише «пошта прихована» (задача 9) */ 'emailHidden', /* стара смужка ачівок пішла разом із профілем (задача 11) */ 'achievementsMore', 'achievementsAll', /* заголовок старої смужки ачівок без користувачів (фінальна рецензія 23a) */ 'achievementsTitle'];
  /** Нові uk-ключі 22a — лише ці. */
  const ADDED = ['defaultNickname', 'languageLabel', 'languageSaveFailed', 'iconTypeText', 'iconBuffLetter'];
  /** 26b: серії бліц-раунду (рядок на телефоні, позначка, пам'ятка раунду). */
  const ADDED_26B = ['summarySeriesPlus', 'summarySeriesMinus', 'blitzSeriesPlus', 'blitzSeriesMinus', 'seriesMark', 'ruleSeriesPlus', 'ruleSeriesMinus', 'ruleSeriesStep', 'ruleSeriesMinusPenalty'];
  /** Після 22a: сторінка «Друзі», «Ще N» у профілі, підказка рівня, браузер без push. */
  const ADDED_LATER = ['openFriends', /* «Ще N» у профілі прибрано в 23a: 'profileQuizzesMore' */ 'levelRulesHint', 'levelRewardsTitle', 'pushUnsupported'];
  /** Нові uk-ключі 23a: підсторінки профілю (задача 6). */
  const ADDED_23A = ['profileBack', 'profileTileQuizzes', 'profileTilePrizes', 'profileTileAchievements', 'profileTileFriends', 'profileTileStats', 'profileTileLikes', 'profileTileLooks', 'profileTileSettings', 'settingsNickAvatar', 'settingsEmail', 'noAwardsYet', /* головна профілю (задача 7) */ 'profileTilesLabel', 'profilePopularTitle', 'profileSeeAll', /* вітрини (задача 8) */ 'shelfTitle', 'shelfAll', 'shelfEmpty', 'achievementShelfTitle', 'pinAdd', 'pinRemove', 'pinFullPrizes', 'pinFullAchievements', /* публічний профіль (задача 9) */ 'publicAwardsAll', 'publicAwardsHide'];
  /** 24a: стартове меню на головній і сторінка «Створити гру». */
  const ADDED_24A = ['startMenuLabel', 'startCreate', 'startJoin', 'createMoreHint', /* картинка запитання на весь екран */ 'imageZoomOpen', 'imageZoomClose', 'imageZoomChoice'];
  /** 24b: списки «Мені сподобались» і «Сподобались іншим» на /profile/likes. */
  const ADDED_24B = ['likedTabsLabel', 'likedMineTab', 'likedOthersTab', 'likedMineEmpty', 'likedOthersEmpty', 'likedError', 'likedLastAt', 'likedShowQuestions', 'likedQuizWhole', 'likedMineCount_one', 'likedMineCount_few', 'likedMineCount_many', 'likedGone_one', 'likedGone_few', 'likedGone_many', 'likedPeople_one', 'likedPeople_few', 'likedPeople_many'];
  /** 24c: список лобі, видимість і пароль гри. */
  const ADDED_24C = ['lobbyWhoSees', 'lobbyVisAll', 'lobbyVisFriends', 'lobbyVisHidden', 'lobbyPasswordLabel', 'lobbyPasswordHint', 'lobbyPasswordSave', 'lobbyPasswordRemove', 'lobbySaved', 'lobbyListTitle', 'lobbyListEmpty', 'lobbyListError', 'lobbyRunning', 'lobbyLocked', 'lobbyFriendsHere', 'lobbyPlayers', 'lobbyRounds_one', 'lobbyRounds_few', 'lobbyRounds_many', 'lobbyQuestions_one', 'lobbyQuestions_few', 'lobbyQuestions_many', 'lobbyOpened', 'lobbyJustNow', 'lobbyPasswordAsk', 'err_password_required', 'err_password_wrong', 'err_password_limited', 'err_lobby_password'];
  /** 24d: рамки фото, шрифти ніку, нові кольори. */
  const ADDED_24D = ['lookPhoto', 'lookNoPhoto', 'lookFont', 'lookNoFont', 'lookPreview', 'lookLocked', 'reward_photo', 'reward_font', 'photo_crimson', 'photo_silver', 'photo_ink', 'photo_gold', 'photo_cloud', 'photo_crows', 'photo_fire', 'photo_neon', 'photo_thorns', 'photo_eclipse', 'photo_storm', 'photo_aura', 'font_hand', 'font_round', 'font_mono', 'font_poster', 'font_brush', 'font_pixel', 'font_elegant', 'font_heavy', 'color_blood', 'color_flame', 'color_ice', 'color_venom', 'color_amethyst', 'color_moonsilver'];
  /** Сімейний грааль (2026-11-08): новий вид трофея. */
  const ADDED_GRAIL = ['trophy_grail'];
  /** 25c: повноекранний редактор призу. Задача 8 — шапка, вкладки, «Форма» без наліпок, «Приз», помилки оформлення; задачі 9–11 доповнюють. */
  const ADDED_25C = ['studioNewTitle', 'studioEditTitle', 'studioViewTitle', 'studioNotFound', 'studioToolsLabel', 'studioToolShape', 'studioToolPhotos', 'studioToolTexts', 'studioToolEffects', 'studioToolAppear', 'studioToolPrize', 'studioRotateHint', 'studioNoWebgl', 'studioReadOnly', 'studioLeaveConfirm', 'studioNoTrophy', 'studioNoTrophyHint', 'studioNeedsTrophy', 'studioEngraving', 'studioPhotoPlace', 'studioPhotoPlace_ring', 'studioPhotoPlace_medallion', 'studioPhotoPlace_gems', 'studioPhotoPlace_plaque', 'studioPhotoPlace_backdrop', 'studioPhotoAdd', 'studioPhotoCount', 'studioPhotoN', 'studioPhotoEarlier', 'studioPhotoLater', 'studioPhotoRemove', 'studioPhotoCrop', 'studioPhotoFull', 'studioBackdropHint', 'studioFrame', 'studioFrame_none', 'studioFrame_gold', 'studioFrame_round', 'studioFrame_rounded', 'studioPhotoStyle', 'studioPhotoStyle_normal', 'studioPhotoStyle_bw', 'studioPhotoStyle_sepia', 'studioCropTitle', 'studioCropZoom', 'studioCropReset', 'studioCropDone', 'studioCropHint', 'prizeViewOpen', 'err_decor_locked', 'err_decor_text_length', 'err_decor_too_many_photos', 'err_decor_plaque_twice', 'studioStickers', 'studioStickerNone', 'studioPlace_front', 'studioPlace_back', 'studioPlace_left', 'studioPlace_right', 'studioPlace_base_left', 'studioPlace_base_right', 'studioText_rim', 'studioText_band', 'studioText_plaque', 'studioText_back', 'studioTextField', 'studioTextCount', 'studioFont', 'studioFontClassic', 'studioFontSample', 'studioLook', 'studioLook_engraved', 'studioLook_embossed', 'studioLook_colored', 'studioColor', 'studioColorCustom', 'swatch_gold', 'swatch_white', 'swatch_dark', 'swatch_red', 'swatch_blue', 'swatch_mint', 'swatch_violet', 'swatch_orange', 'studioPlaqueTaken', 'studioEffect_glow', 'studioEffect_sparks', 'studioEffect_rays', 'studioEffect_fire', 'studioEffect_snow', 'studioEffect_none', 'studioGlowColor', 'studioAppear_spin', 'studioAppear_rise', 'studioAppear_drop', 'studioAppear_flash', 'studioAppearPlay', 'studioCalmNote'];
  /** 25d: «+ Додати наліпку», вікно наліпки з вільними місцями, примітки про переїзд. */
  const ADDED_25D = ['studioStickerAdd', 'studioStickerTitleAdd', 'studioStickerTitleEdit', 'studioStickerPick', 'studioStickerWhere', 'studioStickerDone', 'studioStickerCancel', 'studioStickerChange', 'studioStickerRemove', 'studioStickerNeedPick', 'studioStickerNeedPlace', 'studioStickerNoRoom', 'studioStickerMax', 'studioTakenBy', 'studioMovedTo', 'studioNoPlace', 'studioTaken_sticker', 'studioPlace_base_back'];
  /** 25e: нові форми й матеріали трофеїв (задачі 2 і 6). */
  const ADDED_25E = ['reward_shape', 'reward_material', 'trophy_lovingcup', 'trophy_vase', 'trophy_plate', 'trophy_goblet', 'trophy_starmedal', 'trophy_cross', 'trophy_octagon', 'trophy_ribbon', 'trophy_diadem', 'trophy_laurel', 'trophy_olive', 'trophy_figure', 'trophy_flame', 'trophy_wings', 'trophy_fist', 'material_rosegold', 'material_rosegold_m', 'material_rosegold_f', 'material_platinum', 'material_platinum_m', 'material_platinum_f', 'material_copper', 'material_copper_m', 'material_copper_f', 'material_obsidian', 'material_obsidian_m', 'material_obsidian_f', 'material_jade', 'material_jade_m', 'material_jade_f', 'material_pearl', 'material_pearl_m', 'material_pearl_f', 'material_ruby', 'material_ruby_m', 'material_ruby_f', 'material_sapphire', 'material_sapphire_m', 'material_sapphire_f', 'material_neon', 'material_neon_m', 'material_neon_f', 'material_marble', 'material_marble_m', 'material_marble_f', 'material_wood', 'material_wood_m', 'material_wood_f', 'err_trophy_locked', 'studioKindGroup_cups', 'studioKindGroup_medals', 'studioKindGroup_crowns', 'studioKindGroup_statuettes', 'studioMaterialGroup_metals', 'studioMaterialGroup_stones', 'studioMaterialGroup_other', 'studioPremium', 'studioPremiumHint'];
  /** 26a: заставка «БЛІЦ!» перед бліц-клітинкою поля. */
  const ADDED_26A = ['splashBlitz'];
  /** 26c: словесна драбина — назви типу, формат відповіді, рядок наживо, помилки ходу. Задачі 7–9 дописують сюди свої. */
  const ADDED_26C = ['type_wordladder', 'typeShort_wordladder', 'typeHow_wordladder', 'buffWhy_off_wordladder', 'wordLadderAnswerDone', 'wordLadderAnswerPart', 'wordLadderLiveSteps', 'err_word_one_letter', 'err_word_unknown', 'err_word_repeat', 'err_word_none', 'err_word_too_many', 'wordLadderStart', 'wordLadderStepN', 'addWordLadderStep', 'removeWordLadderStep', 'wordLadderTarget', 'wordLadderMaxSteps', 'wordLadderHint', 'wordLadderUnknown', 'problemWordLadderWord', 'problemWordLadderLength', 'problemWordLadderStep', 'problemWordLadderSteps', 'problemWordLadderMaxSteps', 'problemWordLadderPlace', 'wordLadderGoal', 'wordLadderLabel', 'wordLadderAdd', 'wordLadderBack', 'wordLadderDone', 'wordLadderOut', 'wordLadderMax_one', 'wordLadderMax_few', 'wordLadderMax_many', 'problemWordLadderEmpty', 'wordLadderWait', 'wordLadderGap', 'wordLadderOnPhone', 'wordLadderFinishedOf', 'wordLadderTitle', 'wordLadderRowSteps', 'wordLadderRowFinished', 'wordLadderHostPath'];
  /** 27a: раунд «Ставки» — назва, пояснення, помилки, редактор, обріз, історія. */
  const ADDED_27A = ['roundTypeBets', 'roundHow_bets', 'buffWhy_off_bets', 'scoreSource_bets', 'err_bet_skipped', 'err_bet_range', 'summaryBetsMinimum', 'summaryBetsMax', 'summaryBetsAll', 'betsHistoryLine', 'betStartLabel', 'betStepLabel', 'betMaxLabel', 'betMaxPlaceholder', 'betsMinimumsNote', 'betsCutLabel', 'betsCutNone', 'betsCutAll', 'betsCutPreview', 'betsCutPreviewNone', 'betsCutHidden', 'betsSettingsNote', 'problemBetsMax', 'problemBetsCut'];
  /** Після 22a свідомо змінені uk-тексти: посилання на друзів ведуть на сторінку «Друзі», а не в профіль. */
  const CHANGED_LATER = ['feedEmptyLink', 'noFriendsToInvite', /* перший пункт меню веде на стартове меню — «Меню» */ 'menuJoin', 'menuShortJoin', /* 24d: «Рамка» стала «Рамка ніку», бо з'явилась рамка фото */ 'lookFrame'];

  it('keeps every uk text as it was before localisation', () => {
    const current: Record<string, string> = ukMessages;
    const changed = Object.entries(golden as Record<string, string>).filter(([key, value]) => !REMOVED.includes(key) && !CHANGED_LATER.includes(key) && current[key] !== value);
    expect(changed).toEqual([]);
    const removedStill = REMOVED.filter((key) => key in current);
    expect(removedStill).toEqual([]);
  });

  it('adds no uk keys beyond the agreed list', () => {
    const fresh = Object.keys(ukMessages).filter((key) => !(key in golden));
    expect(fresh.filter((key) => !ADDED.includes(key) && !ADDED_LATER.includes(key) && !ADDED_23A.includes(key) && !ADDED_24A.includes(key) && !ADDED_24B.includes(key) && !ADDED_24C.includes(key) && !ADDED_24D.includes(key) && !ADDED_GRAIL.includes(key) && !ADDED_25C.includes(key) && !ADDED_25D.includes(key) && !ADDED_25E.includes(key) && !ADDED_26A.includes(key) && !ADDED_26B.includes(key) && !ADDED_26C.includes(key) && !ADDED_27A.includes(key))).toEqual([]);
  });
});

describe('uk plurals through Intl', () => {
  it('counts questions in every Ukrainian form', () => {
    const counts = [1, 2, 5, 11, 12, 21, 22, 25, 111];
    expect(counts.map((n) => countText('questionCount', n, { count: n }))).toEqual([
      '1 запитання',
      '2 запитання',
      '5 запитань',
      '11 запитань',
      '12 запитань',
      '21 запитання',
      '22 запитання',
      '25 запитань',
      '111 запитань',
    ]);
  });

  it('picks the same form as the old hand-written rule for every integer up to 2000 and below zero', () => {
    const old = (count: number) => {
      const lastTwo = Math.abs(count) % 100;
      const last = lastTwo % 10;
      const form = last === 1 && lastTwo !== 11 ? 'one' : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'few' : 'many';
      return t(`pointsWord_${form}`);
    };
    const counts = [...Array(2001).keys(), -1, -2, -5, -11, -21];
    expect(counts.map((n) => countText('pointsWord', n))).toEqual(counts.map(old));
  });
});

describe('active locale', () => {
  afterEach(() => activateLocaleForTests('uk'));

  it('reads the active dictionary and falls back to uk', () => {
    activateLocaleForTests('en', { ui: { yes: 'Yes', questionCount_one: '{count} question', questionCount_other: '{count} questions' } });
    expect(t('yes')).toBe('Yes');
    expect(t('no')).toBe('Ні');
    expect(countText('questionCount', 1, { count: 1 })).toBe('1 question');
    expect(countText('questionCount', 7, { count: 7 })).toBe('7 questions');
    expect(activeMessages().ui.yes).toBe('Yes');
  });

  it('falls back to the uk form when the active dictionary has no form of the noun', () => {
    activateLocaleForTests('en', { ui: {} });
    expect(countText('questionCount', 5, { count: 5 })).toBe('5 запитань');
    expect(countText('questionCount', 2, { count: 2 })).toBe('2 запитання');
  });

  it('uses many when other is absent', () => {
    activateLocaleForTests('pl', { ui: { questionCount_one: '{count} pytanie', questionCount_many: '{count} pytań' } });
    expect(countText('questionCount', 3, { count: 3 })).toBe('3 pytań');
  });

  it('explains errors from the active dictionary', () => {
    activateLocaleForTests('en', { ui: { err_nickname_taken: 'That name is taken.' } });
    expect(errorText('nickname_taken')).toBe('That name is taken.');
    expect(errorText('something_new')).toBe('Щось пішло не так. Спробуйте ще раз.');
  });

  it('comes back to uk exactly', () => {
    activateLocaleForTests('en', { ui: { yes: 'Yes' } });
    activateLocaleForTests('uk');
    expect(t('yes')).toBe(ukMessages.yes);
    expect(activeMessages().ui).toBe(ukMessages);
  });

  it('refuses to activate a locale that is not loaded', () => {
    expect(() => activateLocale('de')).toThrow();
  });
});
