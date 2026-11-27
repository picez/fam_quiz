import { afterEach, describe, expect, it } from 'vitest';
import { GROUP_LIMITS, QUESTION_TYPES } from '@quiz/shared';
import golden from './__fixtures__/uk-golden.json';
import ar from './locales/ar.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import it_ from './locales/it.json';
import pl from './locales/pl.json';
import arHelp from './locales/ar.help.json';
import deHelp from './locales/de.help.json';
import enHelp from './locales/en.help.json';
import esHelp from './locales/es.help.json';
import itHelp from './locales/it.help.json';
import plHelp from './locales/pl.help.json';
import { pushStrings } from './push/push-strings';
import pushAr from './push/strings/ar.json';
import pushDe from './push/strings/de.json';
import pushEn from './push/strings/en.json';
import pushEs from './push/strings/es.json';
import pushIt from './push/strings/it.json';
import pushPl from './push/strings/pl.json';
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
  const REMOVED: string[] = ['agoMinutes', 'agoHours', /* меню з п'яти пунктів: призи, досягнення й друзі живуть у профілі */ 'menuAchievements', 'menuPrizes', 'menuShortPrizes', 'menuShortAchievements', /* друзі переїхали з профілю на /friends */ 'openProfile', /* головна профілю з плиток (23a): «Мої вікторини» стали «Найпопулярніші вікторини», «Друзі» — плиткою */ 'myQuizzesTitle', 'friendsTitle', /* публічний профіль більше не пише «пошта прихована» (задача 9) */ 'emailHidden', /* стара смужка ачівок пішла разом із профілем (задача 11) */ 'achievementsMore', 'achievementsAll', /* заголовок старої смужки ачівок без користувачів (фінальна рецензія 23a) */ 'achievementsTitle', /* 79: старі «Я ведучий» головної — ніде не вживаються */ 'hostEntry'];
  /** Нові uk-ключі 22a — лише ці. */
  const ADDED = ['defaultNickname', 'languageLabel', 'languageSaveFailed', 'iconTypeText', 'iconBuffLetter'];
  /** 26b: серії бліц-раунду (рядок на телефоні, позначка, пам'ятка раунду). */
  const ADDED_26B = ['summarySeriesPlus', 'summarySeriesMinus', 'blitzSeriesPlus', 'blitzSeriesMinus', 'seriesMark', 'ruleSeriesPlus', 'ruleSeriesMinus', 'ruleSeriesStep', 'ruleSeriesMinusPenalty'];
  /** Після 22a: сторінка «Друзі», «Ще N» у профілі, підказка рівня, браузер без push. */
  const ADDED_LATER = ['openFriends', /* «Ще N» у профілі прибрано в 23a: 'profileQuizzesMore' */ 'levelRulesHint', 'levelRewardsTitle', 'pushUnsupported'];
  /** Нові uk-ключі 23a: підсторінки профілю (задача 6). */
  const ADDED_23A = ['profileBack', 'profileTileQuizzes', 'profileTilePrizes', 'profileTileAchievements', 'profileTileFriends', 'profileTileStats', 'profileTileLooks', 'profileTileSettings', 'settingsNickAvatar', 'settingsEmail', 'noAwardsYet', /* головна профілю (задача 7) */ 'profileTilesLabel', 'profilePopularTitle', 'profileSeeAll', /* вітрини (задача 8) */ 'shelfTitle', 'shelfAll', 'shelfEmpty', 'achievementShelfTitle', 'pinAdd', 'pinRemove', 'pinFullPrizes', 'pinFullAchievements', /* публічний профіль (задача 9) */ 'publicAwardsAll', 'publicAwardsHide'];
  /** 24a: стартове меню на головній і сторінка «Створити гру». */
  const ADDED_24A = ['startCreate', 'startJoin', 'createMoreHint', /* картинка запитання на весь екран */ 'imageZoomOpen', 'imageZoomClose', 'imageZoomChoice'];
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
  /** 27b: раунд «Аукціон» — назва, пам'ятка, помилки торгу, історія, поля редактора. Задача 6 дописує свої. */
  const ADDED_27B = ['roundTypeAuction', 'roundHow_auction', 'buffWhy_off_auction', 'scoreSource_auction', 'err_bid_none', 'err_bid_leader', 'err_bid_low', 'err_bid_over', 'err_time_over_bid', 'summaryAuctionStep', 'summaryAuctionFree', 'summaryAuctionLossBid', 'summaryAuctionLossPrice', 'auctionHistoryLine', 'auctionHistoryOpen', 'auctionModeLabel', 'auctionModeStep', 'auctionModeFree', 'auctionStepLabel', 'auctionLossLabel', 'auctionLossBid', 'auctionLossBidPrice', 'auctionSettingsNote', 'auctionCutLabel', 'auctionCutPreview', 'auctionCutPreviewNone', 'auctionCutHidden', 'problemAuctionCut', 'auctionPrice', 'auctionTopBid', 'auctionNoBids', 'auctionRaise', 'auctionBidLabel', 'auctionBidPrompt', 'auctionBidPlace', 'auctionLeading', 'auctionShort', 'auctionNone', 'auctionWinnerYou', 'auctionWinnerOther', 'auctionOpenAll', 'auctionResultRight', 'auctionResultWrong', 'auctionSold', 'auctionSoldTo', 'auctionTimerLabel', 'auctionHostLimit', 'auctionHostCannot', 'phaseAuctionBidding'];

  const ADDED_27C = ['type_timedlist', 'typeShort_timedlist', 'typeHow_timedlist', 'buffWhy_off_timedlist', 'listAnswer', 'listAnswerWrong', 'listLive', 'err_list_miss', 'err_list_repeat', 'problemListItems', 'problemListEmpty', 'problemListDuplicate', 'problemListPoints', 'problemListPlace', 'listItemN', 'listOtherSpellings', 'addListItem', 'removeListItem', 'listItemUp', 'listItemDown', 'listPrice', 'listMinusOn', 'listMinus', 'listHint', 'listLabel', 'listCount', 'listMinusNote', 'listWrong', 'listDone', 'listOnPhone', 'listFoundOf', 'listTitle', 'listFinders', 'listNobody', 'listPlayersNote', 'listTeamsNote', 'listCellN', 'listFoundItem', 'timedlistCellNote', 'problemListMinus'];
  /** 26c: словесна драбина — назви типу, формат відповіді, рядок наживо, помилки ходу. Задачі 7–9 дописують сюди свої. */
  const ADDED_26C = ['type_wordladder', 'typeShort_wordladder', 'typeHow_wordladder', 'buffWhy_off_wordladder', 'wordLadderAnswerDone', 'wordLadderAnswerPart', 'wordLadderLiveSteps', 'err_word_one_letter', 'err_word_unknown', 'err_word_repeat', 'err_word_none', 'err_word_too_many', 'wordLadderStart', 'wordLadderStepN', 'addWordLadderStep', 'removeWordLadderStep', 'wordLadderTarget', 'wordLadderMaxSteps', 'wordLadderHint', 'wordLadderUnknown', 'problemWordLadderWord', 'problemWordLadderLength', 'problemWordLadderStep', 'problemWordLadderSteps', 'problemWordLadderMaxSteps', 'problemWordLadderPlace', 'wordLadderGoal', 'wordLadderLabel', 'wordLadderAdd', 'wordLadderBack', 'wordLadderDone', 'wordLadderOut', 'wordLadderMax_one', 'wordLadderMax_few', 'wordLadderMax_many', 'problemWordLadderEmpty', 'wordLadderWait', 'wordLadderGap', 'wordLadderOnPhone', 'wordLadderFinishedOf', 'wordLadderTitle', 'wordLadderRowSteps', 'wordLadderRowFinished', 'wordLadderHostPath'];
  /** 27d: «Слова з літер» — назви типу, формат відповіді, рядок наживо, помилки слова, редактор. Задачі 6–7 дописують сюди свої. */
  const ADDED_27D = ['type_letterwords', 'typeShort_letterwords', 'typeHow_letterwords', 'buffWhy_off_letterwords', 'lettersAnswer', 'lettersLive', 'err_letters_not_in_set', 'err_letters_short', 'err_letters_repeat', 'err_letters_too_many', 'lettersSourceLabel', 'lettersSourceRandom', 'lettersSourceFixed', 'lettersCount', 'lettersOwn', 'lettersGoalLabel', 'lettersGoalMost', 'lettersGoalLongest', 'lettersPerLabel', 'lettersPerWord', 'lettersPerLetter', 'lettersLongestHint', 'lettersUnit', 'lettersHint', 'lettersCheckSome', 'lettersCheckNone', 'problemLettersSet', 'problemLettersPoints', 'problemLettersPlace', 'letterwordsCellNote', 'lettersLabel', 'lettersErase', 'lettersClear', 'lettersShuffle', 'lettersMine', 'lettersOnPhone', 'lettersMore', 'lettersBestTitle', 'lettersPossible', 'lettersNoneExist', 'lettersTile', 'lettersAdded', 'lettersLength', 'lettersCap', 'problemLettersLimits', 'lettersHistorySet', 'lettersHistoryBest'];
  /** 28a: тип «Більше чи менше» — назва, формат відповіді, редактор, проблеми, примітка клітинки; телефон, сцена й пульт. */
  const ADDED_28A = ['type_moreless', 'typeShort_moreless', 'typeHow_moreless', 'buffWhy_off_moreless', 'morelessAnswer', 'morelessLive', 'err_moreless_stale', 'morelessCellNote', 'morelessPairN', 'morelessPrompt', 'morelessPromptPlaceholder', 'morelessOptionA', 'morelessOptionB', 'morelessValue', 'morelessValuePlaceholder', 'morelessCorrect', 'morelessPoints', 'addMoreLessPair', 'removeMoreLessPair', 'moreLessPairUp', 'moreLessPairDown', 'morelessSameAll', 'morelessTotal', 'morelessHint', 'problemMoreLessPairs', 'problemMoreLessEmpty', 'problemMoreLessSame', 'problemMoreLessPairPoints', 'problemMoreLessPoints', 'problemMoreLessPlace', 'morelessCounter', 'morelessPick', 'morelessDone', 'morelessLate', 'morelessTeamWatch', 'morelessOnPhone', 'morelessProgress', 'morelessRightOf', 'morelessRightCount', 'morelessTitle', 'morelessMarkRight', 'morelessMarkWrong', 'morelessMarkLate', 'morelessNext', 'morelessClosed', 'morelessTieWarn'];
  /** 28b: раунд «Правда про гравця» — назва, пам'ятка, помилки, історія, редактор раунду; факт у лобі, пульт фактів, вибір імені, сцена й розкриття. */
  const ADDED_28B = ['roundTypeTruth', 'roundHow_truth', 'buffWhy_off_truth', 'scoreSource_truth', 'err_truth_closed', 'err_truth_own', 'err_truth_text', 'summaryTruth', 'truthHistoryAuthor', 'truthHistoryAuthorRow', 'truthPointsLabel', 'truthTimeLabel', 'truthEditorNote', 'problemTruthOnce', 'truthFactLabel', 'truthFactHint', 'truthFactSave', 'truthFactSaved', 'truthFactCount', 'truthFactHidden', 'truthFactsCount', 'truthFactWrite', 'truthHostTitle', 'truthHostHide', 'truthHostShow', 'truthHostHiddenMark', 'truthHostPlayed', 'truthHostRevised', 'truthHostNone', 'truthHostAuthor', 'truthWho', 'truthOf', 'truthOwn', 'truthOwnTeam', 'truthAuthorIs', 'truthAuthorPoints', 'truthPicked', 'truthNoPick', 'truthSkipped', 'problemTruthNumbers', 'quizTruthNote', 'quizTruthOnly'];
  /** 28c: тип «Малюнок» — назви, формат відповіді, рядок наживо, редактор, проблеми, полотно. Задача 6 дописує сюди свої. */
  const ADDED_28C = ['type_drawing', 'typeShort_drawing', 'typeHow_drawing', 'buffWhy_off_drawing', 'drawingHelp', 'drawingWordHint', 'problemDrawingWord', 'problemDrawingLong', 'problemDrawingPlace', 'drawingAnswer', 'drawingDrewAnswer', 'drawingLive', 'drawingCanvasLabel', 'drawingYourWord', 'drawingYouDraw', 'drawingDrawer', 'drawingGuessed', 'drawingMiss', 'drawingGuessPlaceholder', 'drawingGuessButton', 'drawingCount', 'drawingTeamWatch', 'drawingUndo', 'drawingClear', 'drawingEraser', 'drawingColor', 'drawingWidth_0', 'drawingWidth_1', 'drawingWidth_2', 'drawingWordWas', 'drawingNobody', 'drawingFull', 'drawingArtist'];
  /** 28d: раунд «Головоломки», судоку й кросворд — назви, пам'ятка, помилки, формат відповіді, редактор, проблеми. Задачі 7–8 дописують сюди свої. */
  const ADDED_28D = ['roundTypePuzzles', 'roundHow_puzzles', 'buffWhy_off_puzzles', 'summaryPuzzles', 'summarySudokus_one', 'summaryCrosswords_one', 'puzzlesSettingsNote', 'type_sudoku', 'typeShort_sudoku', 'typeHow_sudoku', 'type_crossword', 'typeShort_crossword', 'typeHow_crossword', 'err_puzzle_stale', 'err_puzzle_done', 'err_puzzle_cell', 'err_puzzle_given', 'puzzleAnswerSolved', 'puzzleAnswerPart', 'sudokuDefaultText', 'crosswordDefaultText', 'sudokuSourceLabel', 'sudokuSourceGenerate', 'sudokuSourceCustom', 'sudokuGenerateConfirm', 'sudokuLevelLabel', 'sudokuLevel_easy', 'sudokuLevel_medium', 'sudokuLevel_hard', 'sudokuNewGrid', 'sudokuGridLabel', 'sudokuCellLabel', 'sudokuGivenCount', 'sudokuCustomHint', 'sudokuUnique', 'sudokuMany', 'sudokuNone', 'sudokuConflict', 'sudokuHelp', 'crosswordWordN', 'crosswordAnswer', 'crosswordAnswerPlaceholder', 'crosswordClue', 'crosswordCluePlaceholder', 'addCrosswordWord', 'removeCrosswordWord', 'crosswordWordUp', 'crosswordWordDown', 'crosswordModeLabel', 'crosswordModeFull', 'crosswordModeKey', 'crosswordKeyLabel', 'crosswordKeyPlaceholder', 'crosswordKeyNote', 'crosswordUnplaced', 'crosswordBadWords', 'crosswordDuplicateWarn', 'crosswordMissing', 'crosswordKeyBad', 'crosswordPreview', 'crosswordAcross', 'crosswordDown', 'crosswordHelp', 'problemPuzzleLimits', 'problemSudokuGrid', 'problemSudokuConflict', 'problemSudokuNone', 'problemSudokuMany', 'problemCrosswordCount', 'problemCrosswordWords', 'problemCrosswordClue', 'problemCrosswordWord', 'problemCrosswordDuplicate', 'problemCrosswordLayout', 'problemCrosswordKey', 'problemCrosswordKeyLetters', 'problemPuzzlePlace', 'problemPuzzlesType', 'puzzleFilled', 'puzzleKeypad', 'puzzleErase', 'puzzleDone', 'puzzleConfirm', 'puzzleConfirmYes', 'puzzleConfirmNo', 'puzzleWaiting', 'puzzleTimeUp', 'puzzleClosed', 'puzzleOffline', 'puzzleYours', 'puzzleSolution', 'crosswordPick', 'crosswordGridLabel', 'crosswordInput', 'crosswordClues', 'puzzleDoneOf'];
  /** Множина 28d: форми, яких немає в мові (en — без few/many), там і не потрібні; _one є в кожній — перевіряє ADDED_28D. */
  const ADDED_28D_PLURALS = ['summarySudokus_few', 'summarySudokus_many', 'summaryCrosswords_few', 'summaryCrosswords_many'];
  /** 29c: пазл — назви, помилки, редактор, проблеми. Тексти гри (телефон, сцена, пульт) дописують наступні задачі. */
  const ADDED_29C = ['type_jigsaw', 'typeShort_jigsaw', 'typeHow_jigsaw', 'buffWhy_off_jigsaw', 'err_jigsaw_stale', 'err_jigsaw_done', 'err_jigsaw_piece', 'err_jigsaw_placed', 'err_jigsaw_held', 'err_jigsaw_miss', 'problemJigsawPhoto', 'problemJigsawPlace', 'problemJigsawGrid', 'problemJigsawImage', 'problemJigsawLimits', 'jigsawDefaultText', 'jigsawPhotoNeed', 'jigsawAspectLabel', 'jigsawPiecesLabel', 'jigsawPieces', 'jigsawCrop', 'jigsawCropHint', 'jigsawNewShape', 'jigsawPreviewLabel', 'jigsawTimeHint', 'jigsawHelp', 'jigsawAnswerDone', 'jigsawAnswerPart', 'summaryJigsaws_one', 'jigsawFrame', 'jigsawPile', 'jigsawPiece', 'jigsawPieceHeld', 'jigsawPreview', 'jigsawProgress', 'jigsawDoneIn', 'jigsawTimeUp', 'jigsawClosed', 'jigsawOffline', 'jigsawPercent', 'jigsawUndone', 'jigsawUndonePercent', 'jigsawSeconds', 'jigsawTablePlace', 'jigsawTableWho', 'jigsawTableTime', 'jigsawTablePoints', 'jigsawTableLabel'];
  /** 29i: виправлення після вечірньої гри; наступні задачі дописують сюди. */
  /** 30a: збій обробника на сервері (ack internal). */
  const ADDED_30A = ['err_internal', 'err_rate_limited'];
  /** 12j: назви, жарти й умови 22 досягнень, «Нове досягнення!», слайд сцени й перемикач «Ховати антидосягнення». */
  const ADDED_12J = ['achievement_in_debt', 'achievement_zero', 'achievement_last_place', 'achievement_last_place_5', 'achievement_black_stripe', 'achievement_so_close', 'achievement_gullible', 'achievement_all_in_lost', 'achievement_burned', 'achievement_umbrella', 'achievement_same_river', 'achievement_slowpoke', 'achievement_debuff_magnet', 'achievement_who_am_i', 'achievement_lawyer', 'achievement_hammer', 'achievement_honest', 'achievement_wanderer', 'achievement_own_pace', 'achievement_risky', 'achievement_peeker', 'achievement_chosen_one', 'achievementJoke_in_debt', 'achievementJoke_zero', 'achievementJoke_last_place', 'achievementJoke_last_place_5', 'achievementJoke_black_stripe', 'achievementJoke_so_close', 'achievementJoke_gullible', 'achievementJoke_all_in_lost', 'achievementJoke_burned', 'achievementJoke_umbrella', 'achievementJoke_same_river', 'achievementJoke_slowpoke', 'achievementJoke_debuff_magnet', 'achievementJoke_who_am_i', 'achievementJoke_lawyer', 'achievementJoke_hammer', 'achievementJoke_honest', 'achievementJoke_wanderer', 'achievementJoke_own_pace', 'achievementJoke_risky', 'achievementJoke_peeker', 'achievementJoke_chosen_one', 'achievementHint_in_debt', 'achievementHint_zero', 'achievementHint_last_place', 'achievementHint_last_place_5', 'achievementHint_black_stripe', 'achievementHint_so_close', 'achievementHint_gullible', 'achievementHint_all_in_lost', 'achievementHint_burned', 'achievementHint_umbrella', 'achievementHint_same_river', 'achievementHint_slowpoke', 'achievementHint_debuff_magnet', 'achievementHint_who_am_i', 'achievementHint_lawyer', 'achievementHint_hammer', 'achievementHint_honest', 'achievementHint_wanderer', 'achievementHint_own_pace', 'achievementHint_risky', 'achievementHint_peeker', 'achievementHint_chosen_one', 'newAchievementsOne', 'newAchievementsMany', 'newAchievementAnti', 'newAchievementsAll', 'newAchievementsSignIn', 'newAchievementsSignInLink', 'stageNewAchievements', 'stageNewAchievementsMore', 'stageNewAchievementsPeople', 'hideAntiLabel', 'hideAntiHint', 'hideAntiSaved'];
  /** 12k: групи — список, запрошення, ролі без роду, сторінка групи, форма запису з прикладами й помилки меж. */
  const ADDED_12K = ['profileTileGroups', 'groupsIntro', 'groupsEmpty', 'groupsCreate', 'groupsInvitesTitle', 'groupInviteLine', 'groupInviteAccept', 'groupInviteDecline', 'groupPeople_one', 'groupItems_one', 'groupRoleOwner', 'groupYou', 'groupFormerMember', 'groupNameLabel', 'groupNamePlaceholder', 'groupEmojiLabel', 'groupDescriptionLabel', 'groupDescriptionPlaceholder', 'groupCreateSubmit', 'groupSaved', 'groupCounter', 'groupTabsLabel', 'groupTabItems', 'groupTabPeople', 'groupTabSettings', 'groupInviteTitle', 'groupInviteLinkHint', 'groupInviteCopy', 'groupInviteCopied', 'groupInviteCopyFailed', 'groupInviteQr', 'groupInviteRefresh', 'groupInviteRefreshConfirm', 'groupInviteRefreshed', 'groupInviteFriends', 'groupInviteFriendsEmpty', 'groupInviteSend', 'groupInviteSent', 'groupInvitePending', 'groupInviteCancel', 'groupMemberRemove', 'groupMemberRemoveConfirm', 'groupMakeOwner', 'groupMakeOwnerConfirm', 'groupLeave', 'groupLeaveConfirm', 'groupOwnerLeaveHint', 'groupDelete', 'groupDeleteConfirm', 'groupJoinTitle', 'groupJoinFrom', 'groupJoinButton', 'groupJoinSignIn', 'groupJoinGone', 'groupJoinAlready', 'groupJoinOpen', 'itemKind_fact', 'itemKind_story', 'itemKind_quote', 'itemKind_date', 'itemKindsLabel', 'itemsAdd', 'itemsEmpty', 'itemsSearch', 'itemsFilterAll', 'itemsFilterAbout', 'itemsFilterAnyone', 'itemsNothingFound', 'itemNewTitle', 'itemEditTitle', 'itemTextLabel', 'itemTextPlaceholder_fact', 'itemTextPlaceholder_story', 'itemTextPlaceholder_quote', 'itemTextPlaceholder_date', 'itemAboutLabel', 'itemAboutNamePlaceholder', 'itemAboutAdd', 'itemAboutRemove', 'itemAboutFull', 'itemAnswerLabel', 'itemAnswerPlaceholder', 'itemAnswerHint', 'itemYearLabel', 'itemYearHint', 'itemPhotoAdd', 'itemPhotoRemove', 'itemSurpriseLabel', 'itemSurpriseHint', 'itemSurpriseFor', 'itemSave', 'itemEdit', 'itemDelete', 'itemDeleteConfirm', 'itemAnswerShown', 'itemBy', 'err_group_not_found', 'err_group_full', 'err_too_many_groups', 'err_group_items_full', 'err_owner_must_transfer', 'err_not_owner', 'err_item_not_found', 'err_not_author', 'err_invite_not_found', 'err_invites_full', 'err_member_not_found', 'err_invalid_payload_group_name', 'err_invalid_payload_item_text', 'err_invalid_payload_item_about', 'err_invalid_payload_surprise_needs_member', 'err_invalid_payload_about_not_member'];
  const ADDED_12L = ['achievement_chronicler', 'achievementJoke_chronicler', 'achievementHint_chronicler', 'groupFromButton', 'groupPickerTitle', 'groupPickerClose', 'groupPickerBack', 'groupPickerGroups', 'groupPickerNoGroups', 'groupPickerOpenGroups', 'groupPickerItems', 'groupPickerNoItems', 'groupPickerUnused', 'groupPickerTemplates', 'groupPickerPreview', 'groupPickerInsert', 'groupPickerReplaceConfirm', 'groupTpl_who', 'groupTpl_truth', 'groupTpl_when', 'groupTpl_whoami', 'groupTpl_open', 'groupTpl_bluff', 'groupTplWhat_who', 'groupTplWhat_truth', 'groupTplWhat_when', 'groupTplWhat_whoami', 'groupTplWhat_open', 'groupTplWhat_bluff', 'groupTplNeedAbout', 'groupTplNeedNames', 'groupTplNeedYear', 'groupTplNeedAnswer', 'groupTplAnswerLong', 'groupTplNamesLong', 'groupTplNotHere', 'groupTplText_who', 'groupTplText_truth', 'groupTplText_when', 'groupTplText_whoami', 'groupTruthTrue', 'groupTruthFalse', 'groupTruthEdit', 'groupTruthHint', 'groupTruthSame', 'groupTruthSwapped', 'groupTruthBalance', 'groupNoteTitle', 'groupNoteDismiss', 'groupNoteBlankName', 'groupNoteBlankAnswer', 'groupNoteClipped', 'groupNotePhoto', 'groupNoteClues', 'groupNoteCluesCut', 'groupNoteLies', 'groupNoteManyAbout', 'groupNoteFiction', 'groupItemUsed', 'groupQuizButton', 'groupQuizHint', 'groupQuizPick', 'groupQuizTemplate', 'groupQuizMixed', 'groupQuizCreate', 'groupQuizFallback', 'groupQuizMax', 'groupQuizReplaceDraft', 'groupQuizName', 'groupQuizNotice'];
  /** 32: слабкий інтернет — смуги «Немає інтернету» й «Слабкий зв’язок», відповідь, що чекає, фото понад 20 МБ; sw* — сторінка воркера (живе в pushStrings). */
  const ADDED_32_SW = ['swOfflineTitle', 'swOfflineBody', 'swOfflineRetry'];
  const ADDED_32_UI: string[] = ['netOffline', 'err_image_raw_too_large', 'netWeak', 'netWeakHint', 'answerPending'];
  const ADDED_32 = [...ADDED_32_UI, ...ADDED_32_SW];
  const ADDED_34 = [
    'pack_basic', 'pack_food', 'pack_party', 'pack_cozy', 'pack_animals', 'pack_everyday', 'pack_winter', 'pack_love', 'pack_hugs', 'pack_baking', 'pack_spooky', 'pack_mischief', 'pack_extra',
    'reward_stickersOr', 'reward_effect', 'effect_light', 'effect_sparks', 'effect_flame', 'effect_frost', 'effect_stardust', 'effect_bolt', 'effect_shimmer',
    'frame_glacier', 'frame_aurora', 'photo_sunflowers', 'photo_waves', 'photo_constellation', 'lookEffect', 'lookNoEffect', 'levelAllOpen',
    'stickerPackLocked', 'stickerPackLockedOr', 'stickerPackMore', 'achievementStickers',
  ];
  /** Світла тема: перемикач теми на пристрої. */
  /** 56: сповіщення бота за розкладом (живуть у pushStrings). */
  /** 56: розділ «Розклад» у вкладці «Бот» — форма, список, стани, причини, помилки, журнал. */
  const ADDED_BOT_SCHEDULE_56 = ['adminBotSchedule', 'adminBotScheduleLead', 'adminBotPlanNew', 'adminBotPlanEdit', 'adminBotPlanQuiz', 'adminBotPlanNoQuizzes', 'adminBotPlanWhen', 'adminBotPlanTo', 'adminBotPlanToNone', 'adminBotPlanToAll', 'adminBotPlanToGroup', 'adminBotPlanToPeople', 'adminBotPlanGroup', 'adminBotPlanNoGroups', 'adminBotPlanSearch', 'adminBotPlanRemove', 'adminBotPlanAuto', 'adminBotPlanAutoAfter', 'adminBotPlanWeekly', 'adminBotPlanSave', 'adminBotPlanSaveEdit', 'adminBotPlanKeep', 'adminBotPlanSaved', 'adminBotPlansCount', 'adminBotPlansEmpty', 'adminBotPlanKyiv', 'adminBotPlanToShownNone', 'adminBotPlanToShownAll', 'adminBotPlanToShownGroup', 'adminBotPlanGroupGone', 'adminBotPlanToShownPeople', 'adminBotPlanAutoShown', 'adminBotPlanWeeklyShown', 'adminBotPlanChange', 'adminBotPlanCancel', 'adminBotPlanCancelConfirm', 'adminBotPlan_scheduled', 'adminBotPlan_opened', 'adminBotPlan_played', 'adminBotPlan_nobody', 'adminBotPlan_cancelled', 'adminBotPlan_failed', 'adminBotPlanReason_server_down', 'adminBotPlanReason_quiz_missing', 'adminBotPlanReason_autopilot_blocked', 'adminBotPlanReason_server_busy', 'adminBotPlanReason_bot_rooms_full', 'adminBotPlanReason_bot_unavailable', 'adminBotPlanReason_room_closed', 'adminBotPlanReason_not_started', 'adminBotPlan_not_started', 'adminBotPlanMissing', 'adminBotPlanReason_start_failed', 'err_plans_full', 'err_plan_time', 'err_plan_locked', 'adminLog_bot_plan_create', 'adminLog_bot_plan_update', 'adminLog_bot_plan_cancel', 'adminLog_bot_plan_run', 'adminLog_bot_plan_fail'];
  /** 57: перегляд вікторини в адмінці (відповіді, написання, підказки, медіа, бали, таймери) і рядок журналу перегляду. */
  const ADDED_QUIZ_CHECK_57 = ['adminPreviewCorrect', 'adminPreviewAnswer', 'adminPreviewAccepted', 'adminPreviewHint', 'adminPreviewVideo', 'adminPreviewAudio', 'adminPreviewPoints', 'adminPreviewNoTimer', 'adminPreviewImage', 'adminLog_quiz_view', 'adminCheckRun', 'adminCheckShort', 'adminChecking', 'adminCheckOk', 'adminCheckErrors', 'adminCheckWarnings', 'adminCheckSummary', 'adminCheckRound', 'adminCheckOther', 'adminCheckGoTo', 'adminCheckBadge', 'adminCheckLaunchConfirm', 'adminCheck_schema', 'adminCheck_media_missing', 'adminCheck_media_unreachable', 'adminCheck_video_missing', 'adminCheck_video_not_embeddable', 'adminCheck_video_start_past_end', 'adminCheck_empty_answer', 'adminCheck_no_correct', 'adminCheck_duplicate_option', 'adminCheck_answer_leak', 'adminCheck_autopilot_blocked', 'adminCheck_short_timer', 'adminCheck_hint_leak', 'adminCheck_media_unchecked', 'adminCheck_video_unchecked', 'adminPreviewPin', 'adminPreviewSpots', 'adminPreviewSolution', 'adminCheckWholeQuiz', 'adminCheck_media_blocked'];
  const ADDED_BOT_SCHEDULE_56_SW = ['pushBotSoonTitle', 'pushBotSoonBody', 'pushBotOpenTitle', 'pushBotOpenBody'];
  const ADDED_THEME = ['themeLabel', 'themeDark', 'themeLight', 'themeSystem', 'themeHint', 'themeQuick', 'themeQuickToLight', 'themeQuickToDark'];
  /** «Правда про гравця»: автори й бали раунду — разом у підсумку наприкінці раунду. */
  const ADDED_TRUTH_RECAP = ['truthHeldNote', 'truthSealed', 'truthClosed', 'truthYourPick', 'truthYouSkipped', 'truthHeldScores', 'truthRecapTitle', 'truthRecapEarly', 'truthRecapMine', 'truthRecapRight', 'truthRecapRightCount', 'truthRecapNobody', 'truthRecapOwn', 'truthHostHeld'];
  /** 52: вигадки ведучого в раунді «Правда про гравця». */
  const ADDED_TRUTH_52 = ['truthFakeOption', 'truthFakeIs', 'truthFakeLabel', 'truthFakeHostMark', 'truthFakeHostAnswer', 'truthFakesTitle', 'truthFakesHint', 'truthFakeAdd', 'truthFakePlaceholder', 'truthFakeEdit', 'truthFakeRemove', 'truthFakePreset', 'truthFakeSkip', 'truthFakesOver', 'truthFakesNoFacts', 'err_truth_fakes_full', 'truthPresetLabel', 'truthPresetHint', 'truthPresetAdd'];
  /** «Правда про гравця» в командах: у підсумку вибір і вгадане — команди, а не «ваші». */
  const ADDED_TRUTH_TEAM = ['truthTeamPick', 'truthTeamSkipped', 'truthRecapTeamMine', 'truthRecapOwnTeam'];
  /** 35: «Думай інакше» — назва, пам'ятка, помилки, редактор, історія, автопілот, телефон, сцена й пульт. */
  const ADDED_THINK = ['roundTypeThink', 'roundHow_think', 'type_think', 'typeShort_think', 'typeHow_think', 'buffWhy_off_think', 'scoreSource_think', 'err_think_no_words', 'err_think_words_closed', 'err_think_out', 'err_think_spectator', 'err_think_word', 'summaryThink', 'thinkLivesLabel', 'thinkPointsLabel', 'thinkSettingsNote', 'thinkWordsLabel', 'thinkWordLabel', 'thinkSynonymsLabel', 'thinkAddWord', 'thinkRemoveWord', 'thinkNoWordsNote', 'thinkMinHint', 'problemThinkWordsDup', 'problemThinkWordEmpty', 'problemThinkWordsLimits', 'problemThinkCount', 'problemThinkNumbers', 'problemThinkType', 'autopilotBlock_think_words', 'thinkHistoryWords', 'thinkHistorySafe', 'thinkHistoryHit', 'thinkHistoryEmpty', 'thinkPrompt', 'thinkInputLabel', 'thinkSend', 'thinkSent', 'thinkHeartsLabel', 'thinkSafe', 'thinkHit', 'thinkEmpty', 'thinkOutNow', 'thinkSpectator', 'thinkSpectatorAuthor', 'thinkOf', 'thinkHostWords', 'thinkHostSave', 'thinkHostLocked', 'thinkHostLate', 'thinkHostAnswers', 'thinkHostHit', 'thinkHostSafe', 'thinkHostNoAnswer', 'thinkHostOverridden', 'thinkHostMarkHit', 'thinkHostMarkSafe', 'thinkAnsweredMark', 'thinkWordsTitle', 'thinkPlacesTitle', 'thinkOutAt', 'thinkPlace', 'thinkRoundCol', 'thinkTotalCol', 'thinkNoAnswer', 'thinkSettingsLegend'];
  /** 51: «Думай інакше» — «не на тему»: позначки, голосування автопілота, перемикач раунду, історія. */
  const ADDED_THINK_51 = ['thinkOffTag', 'thinkOffVoteTag', 'thinkHostMarkOff', 'thinkHostUnmarkOff', 'thinkVerdictOff', 'thinkVoteTitle', 'thinkVoteLead', 'thinkVoteDone', 'thinkVoteSent', 'thinkVoteWatch', 'thinkVoteCaptain', 'thinkVoteNothing', 'thinkVoteVoted', 'thinkVoteNobody', 'thinkOffVoteSetting', 'thinkOffVoteSettingHint', 'thinkHistoryOff', 'thinkHistoryOffVote'];
  /** Судоку: «Стерти все» з перепитуванням. */
  const ADDED_35 = ['sudokuWipe', 'sudokuWipeConfirm'];
  /** «Пам'ять»: ведучий підглядає під картки на пульті. */
  const ADDED_MEMORY_PEEK = ['memoryPeekShow', 'memoryPeekHide', 'memoryPeekNote'];
  const ADDED_31 = ['easyModeLabel', 'easyModeHint', 'easyModeHintAccount', 'easyModeSaveFailed', 'familyLabel', 'familyHint', 'familyLobby', 'familyDebuffOff', 'familySpeechTip', 'speechToggle', 'speechResume', 'speechRepeat', 'speechUnsupported', 'speechNoVoice', 'speechMedia', 'speechOptions', 'speechBlank'];
  /** План 33: назви, жарти й умови 31 нового досягнення (93 ключі). */
  const ADDED_33 = ['classic_clean', 'cold_bets', 'sold', 'mind_reader', 'code_breaker', 'single_ten', 'all_at_once', 'not_a_coin', 'word_for_word', 'in_order', 'pair_to_pair', 'short_path', 'full_list', 'longest_word', 'number_sense', 'masterpiece', 'sudoku_first', 'crossword_full', 'jigsaw_first', 'spotdiff_all', 'elephant_memory', 'first_note', 'buffet', 'host_marathon', 'team_soul', 'quick_sketch', 'dark_horse', 'holiday', 'modern_art', 'mirror_logic', 'last_piece'].flatMap((id) => [`achievement_${id}`, `achievementJoke_${id}`, `achievementHint_${id}`]);
  /** Множина 12k: форм, яких немає в мові, там і не треба; _one є в кожній — перевіряє ADDED_12K. */
  const ADDED_12K_PLURALS = ['groupPeople_few', 'groupPeople_many', 'groupItems_few', 'groupItems_many'];
  const ADDED_29I = ['appealWaitOther', 'appealQueued', 'err_appeal_queued', 'morelessWatchPicks', 'drawingGuessTitle', 'drawingGuessTitleAnon', 'sudokuPencil', 'sudokuPencilMarks'];
  /** Множина 29c: форми, яких немає в мові, там і не потрібні; _one є в кожній — перевіряє ADDED_29C. */
  const ADDED_29C_PLURALS = ['summaryJigsaws_few', 'summaryJigsaws_many'];
  /** 29d: «Знайди відмінності» — назви, помилки, редактор, проблеми чернетки, тексти телефона, сцени й таблиці. */
  const ADDED_29D = ['type_spotdiff', 'typeShort_spotdiff', 'typeHow_spotdiff', 'buffWhy_off_spotdiff', 'err_spotdiff_stale', 'err_spotdiff_done', 'err_spotdiff_found', 'err_spotdiff_miss', 'err_spotdiff_freeze', 'err_spotdiff_frozen', 'problemSpotdiffImages', 'problemSpotdiffSpots', 'problemSpotdiffSame', 'problemSpotdiffPlace', 'problemSpotdiffLimits', 'spotdiffOriginal', 'spotdiffNeedOriginal', 'spotdiffChanged', 'spotdiffMarkHint', 'spotdiffRemove', 'spotdiffMax', 'spotdiffAspectMismatch', 'spotdiffCount', 'spotdiffFound', 'spotdiffCardCount', 'spotdiffFrozen', 'spotdiffDoneIn', 'spotdiffAspectBad', 'spotdiffLowRes', 'spotdiffImageError', 'spotdiffPlayersDone', 'spotdiffTeamsDone', 'spotdiffTimeUp', 'spotdiffClosed', 'spotdiffOffline', 'spotdiffTableFound', 'spotdiffTableLabel', 'spotdiffSpotFoundBy', 'summarySpotdiffs_one'];
  const ADDED_29D_PLURALS = ['summarySpotdiffs_few', 'summarySpotdiffs_many'];
  const ADDED_29F = ['type_memory', 'typeShort_memory', 'typeHow_memory', 'buffWhy_off_memory', 'err_memory_stale', 'err_memory_done', 'err_memory_cell', 'err_memory_wait', 'err_memory_busy', 'err_memory_matched', 'err_memory_open', 'problemMemoryPairs', 'problemMemoryDuplicate', 'problemMemoryPlace', 'problemMemoryLimits', 'memoryDefaultText', 'memoryGridLabel', 'memoryGrid', 'memoryPairLabel', 'memoryHalfText', 'memoryHalfImage', 'memoryTextPlaceholderA', 'memoryTextPlaceholderB', 'memoryShuffle', 'memoryShuffled', 'memoryProgress', 'memoryCard', 'memoryCardClosed', 'memoryCardOpen', 'memoryCardMatched', 'memoryCardMiss', 'memoryBusy', 'memoryDoneIn', 'memoryTimeUp', 'memoryClosed', 'memoryOffline', 'memoryPlayersDone', 'memoryTeamsDone', 'memoryRevealPairs', 'memoryTableMoves', 'memoryTableLabel', 'memoryAnswerDone', 'memoryUndone', 'memoryCardCount', 'memoryMovesCount', 'summaryMemories_one'];
  const ADDED_29F_PLURALS = ['summaryMemories_few', 'summaryMemories_many'];
  /** 29e: «Мелодія за нотами» — тип, помилки, проблеми чернетки, редактор, телефон, сцена й таблиця. */
  const ADDED_29E = ['type_melody', 'typeShort_melody', 'typeHow_melody', 'buffWhy_off_melody', 'err_melody_stale', 'err_melody_step', 'err_melody_unheard', 'problemMelodyTrack', 'problemMelodyAccepted', 'problemMelodyPlace', 'problemMelodyLimits', 'melodyDefaultText', 'melodySourceLabel', 'melodySourceFile', 'melodySourceYoutube', 'melodyLinkLabel', 'melodyLinkPlaceholder', 'melodyBadLink', 'melodyStart', 'melodyShortFile', 'melodyPreview', 'melodyAcceptedHint', 'melodyListen', 'melodyMore', 'melodyReplay', 'melodyStep', 'melodyShareNow', 'melodyListenFirst', 'melodyOpenedBy', 'melodyAnswered', 'melodyBlocked', 'melodyFailed', 'melodyStageNone', 'melodyStageHeard', 'melodyPlayersAnswered', 'melodyRevealTitle', 'melodyTableChunk', 'melodyTableLabel', 'melodyAnswerHeard', 'summaryMelodies_one'];
  const ADDED_29H = ['buff_stealth', 'buffTip_stealth', 'buffGuide_stealth', 'buffWhere_stealth', 'stealthTake', 'stealthArmed', 'stealthUsed', 'debuffAnonNotice', 'debuffCastAnon', 'debuffWaitingAnon', 'debuffFiringAnon', 'powersStealthNeedsShop'];
  /** 29g: «Квест із кодом» — назва, помилки, підсумок, редактор, проблеми чернетки, телефон, сцена й пульт. */
  const ADDED_29G = ['roundTypeQuest', 'roundHow_quest', 'scoreSource_quest', 'err_quest_closed', 'err_quest_solved', 'err_quest_tries', 'err_quest_length', 'err_quest_repeat', 'summaryQuestCode', 'summaryQuestPoints', 'summaryQuestBuff', 'summaryQuestBuffFirst', 'questPromptLabel', 'questPromptPlaceholder', 'questCodeLabel', 'questCodeHint', 'questCodeCount', 'questOrderLabel', 'questOrderPosition', 'questOrderReset', 'questTriesLabel', 'questBonusLabel', 'questBonusPoints', 'questBonusBuff', 'questBonusPointsLabel', 'questBonusBuffLabel', 'questBonusFirst', 'questBonusFirstCount', 'questBuffNone', 'questBuffLast', 'questShortHint', 'problemQuestPrompt', 'problemQuestCode', 'problemQuestOrder', 'problemQuestShort', 'problemQuestBuff', 'problemQuestType', 'questButton', 'questSheetTitle', 'questInputLabel', 'questEnter', 'questShareNow', 'questBuffNow', 'questWrong', 'questSolvedPoints', 'questSolvedBuff', 'questSolvedLate', 'questOut', 'questShownCode', 'questWindow', 'questStrip', 'questRowOpened', 'questRowSolved', 'questRowSolvedStart', 'questTablePlace', 'questTableAfter', 'questTableBonus', 'questHostShow', 'questHostTry', 'questHostBy', 'questOrderMark', 'undoQuestRow', 'historyUndoQuest', 'questLeft_one'];
  const ADDED_29G_PLURALS = ['questLeft_few', 'questLeft_many'];
  const ADDED_VIDEOCLIP = ['type_videoclip', 'typeShort_videoclip', 'typeHow_videoclip', 'buffWhy_off_videoclip', 'err_videoclip_unseen', 'videoclipStepFirst', 'problemVideoclipLink', 'problemVideoclipAccepted', 'problemVideoclipPlace', 'problemVideoclipLimits', 'videoclipDefaultText', 'videoclipStart', 'videoclipSoundLabel', 'videoclipMuted', 'videoclipSound', 'videoclipSoundHint', 'videoclipPreview', 'videoclipShortVideo', 'videoclipAcceptedHint', 'videoclipWatch', 'videoclipReplay', 'videoclipWatchFirst', 'videoclipMutedNote', 'videoclipCover', 'videoclipBlocked', 'videoclipFailed', 'videoclipWatchAgain', 'videoclipStageNone', 'videoclipStageSeen', 'videoclipRevealTitle', 'videoclipTableLabel', 'videoclipSoundTap', 'videoclipOnStage', 'videoclipHere', 'summaryVideoclips_one'];
  const ADDED_VIDEOCLIP_PLURALS = ['summaryVideoclips_few', 'summaryVideoclips_many'];
  const ADDED_MORELESS_STEP = ['morelessStep', 'morelessStepHint'];
  const ADDED_OVERSHOOT = ['overshootLabel', 'overshootHint', 'overshootCorrect', 'overshootOver', 'overshootRowsTitle', 'buffWhy_off_overshoot', 'problemOvershootPlace'];
  const ADDED_THINKALIKE = ['type_thinkalike', 'typeShort_thinkalike', 'typeHow_thinkalike', 'buffWhy_off_thinkalike', 'err_alike_group', 'problemAlikePlace', 'alikeDefaultText', 'alikeEditorHint', 'alikePhoneHint', 'alikeCorrect', 'alikeGroupsTitle', 'alikeTop', 'alikeSilent', 'alikeNobody', 'alikeJoin', 'alikeSplit', 'summaryAlikes_one'];
  const ADDED_THINKALIKE_PLURALS = ['summaryAlikes_few', 'summaryAlikes_many'];
  const ADDED_SPY = ['type_spy', 'typeShort_spy', 'typeHow_spy', 'buffWhy_off_spy', 'err_spy_word', 'err_spy_self', 'err_spy_spectator', 'problemSpyPlace', 'problemSpyTeams', 'problemSpyLeak', 'problemSpyMedia', 'problemSpyWordLong', 'problemSpyWordEmpty', 'problemSpyVoteTime', 'spyDefaultText', 'spyPlayersWord', 'spyPlayersWordHint', 'spyVoteTime', 'spyEditorHint', 'spyYourWord', 'spyWordPrompt', 'spyWaitVote', 'spyVoteTitle', 'spyVoteHint', 'spyVoted', 'spyGuessStage', 'spyCaughtYou', 'spySpectator', 'spyRevealSpy', 'spyCaught', 'spyHidden', 'spyGuessed', 'spyMissed', 'spyMissedGuess', 'spyYourGuess', 'spyGone', 'spyYouWere', 'spyCorrect', 'spyNoWord', 'summarySpies_one'];
  const ADDED_SPY_50 = ['spyYouAreSpy', 'spyHintLine', 'spyHintField', 'spyHintFieldHint', 'spyHintLeak', 'spyLegacyWord', 'spyLegacyToHint', 'spyLegacyDrop', 'spyRevealWord', 'spyRevealHint', 'spyNoHint', 'spyYouHow'];
  const ADDED_SPY_PLURALS = ['summarySpies_few', 'summarySpies_many', 'spyVotes_one', 'spyVotes_few', 'spyVotes_many'];
  const ADDED_DUEL_BETS = ['scoreSource_duelbet', 'err_duel_bets_off', 'err_duel_bets_closed', 'err_duel_bet_self', 'duelsBetStake', 'duelsBetStakeHint', 'duelBetTitle', 'duelBetStake', 'duelBetNone', 'duelBetTeam', 'duelBetWon', 'duelBetLost', 'duelBetTie', 'duelBetsTie', 'duelBetsBanner', 'duelBetsWinners', 'duelBetsLosers', 'duelBetsNobody', 'historyDuelBets', 'historyDuelBet', 'guideDuelsBets'];
  const ADDED_RESULT_IMAGE = ['resultImageButton',  'resultImageTitle',  'resultImageAlt',  'resultImageShare',  'resultImageDownload',  'resultImageClose',  'resultImageFailed',  'resultImageMe',  'resultImagePrizes',  'resultImageAchievements',  'resultImageMore'];
  /** 42: імпорт і експорт вікторин — кнопки, діалог, звіт рядків таблиці, помилки, приклади шаблону. */
  const ADDED_IMPORT_EXPORT = ['ioExport', 'ioExportFile', 'ioExportTable', 'ioImport', 'ioImportTitle', 'ioImportHint', 'ioChooseFile', 'ioTemplate', 'ioClose', 'ioPreparing', 'ioChecking', 'ioMedia', 'ioWaitLimit', 'ioCreating', 'ioErrorsTitle', 'ioRowError', 'ioMoreErrors', 'ioImportedTitle', 'ioSampleRound', 'ioSampleChoice', 'ioSampleOption1', 'ioSampleOption2', 'ioSampleOption3', 'ioSampleOption4', 'ioSampleChoiceHint', 'ioSampleYesNo', 'ioSampleText', 'ioSampleTextAnswers', 'ioSampleNumber', 'ioProblem_no_question', 'ioProblem_question_long', 'ioProblem_unknown_type', 'ioProblem_no_answer', 'ioProblem_few_options', 'ioProblem_option_long', 'ioProblem_duplicate_options', 'ioProblem_answer_not_option', 'ioProblem_bad_boolean', 'ioProblem_bad_number', 'ioProblem_answer_long', 'ioProblem_too_many_answers', 'ioProblem_bad_points', 'ioProblem_bad_timer', 'ioProblem_hint_long', 'ioProblem_round_long', 'ioProblem_round_full', 'ioProblem_too_many_rounds', 'ioProblem_quiz_full', 'err_io_not_quiz', 'err_io_newer', 'err_io_invalid', 'err_io_too_big', 'err_io_media_missing', 'err_io_media_too_big', 'err_io_media_fetch', 'err_io_unknown_file', 'err_io_not_table', 'err_io_csv_encoding', 'err_io_missing_columns', 'err_io_too_many_rows', 'err_io_empty'];
  const ADDED_QUESTION_BANK = ['bankNoFitType', 'bankNoFitLadder', 'bankButton', 'bankTitle', 'bankClose', 'bankSearch', 'bankType', 'bankAllTypes', 'bankThisQuiz', 'bankPoints', 'bankPick', 'bankMore', 'bankEmpty', 'bankNone', 'bankCopy', 'bankRoomLeft'];
  const ADDED_IMPORT_EXPORT_PLURALS = ['ioSkipped_one', 'ioSkipped_few', 'ioSkipped_many'];
  const ADDED_CHALLENGE = ['challengeButton', 'challengeTitle', 'challengeLead', 'challengeChecking', 'challengeSkipTitle', 'challengeSkipNone', 'challengeSkipRound', 'challengeSkipSetting_teams', 'challengeSkipSetting_duels', 'challengeSkipSetting_debuffShop', 'challengeSkipBuffs', 'challengeClose', 'challengeGameClosed', 'challengeBackLink', 'challengeEmpty', 'challengeCreate', 'challengeReplace', 'challengeReplaceConfirm', 'challengeLink', 'challengeCopy', 'challengeCopied', 'challengeCopyFailed', 'challengeShare', 'challengeShareText', 'challengeOpenResults', 'challengeActive', 'challengeResultsLink', 'challengeSignIn', 'challengeGone', 'challengeFrom', 'challengeEnded', 'challengeStart', 'challengeContinue', 'challengeDone', 'challengeHiddenResults', 'challengePlace', 'challengeNick', 'challengeScore', 'challengeTime', 'challengeDate', 'challengeAuthorMark', 'challengeUnfinished', 'challengeNoResults', 'challengeLobby', 'challengeLobbyHint', 'challengeBoardLink', 'err_challenge_not_found', 'err_challenge_closed', 'err_challenge_done', 'err_challenge_empty', 'err_challenge_hidden', 'err_challenge_game'];
  const ADDED_LEAGUE = ['leaguePickTitle', 'leaguePickLabel', 'leaguePickNone', 'leaguePickHint', 'leaguePickNoGroups', 'leaguePickSaved', 'leagueLobbyMark', 'leagueTooFew', 'leagueHostTitle', 'groupTabLeague', 'leagueMonthLabel', 'leagueCurrentMonth', 'leagueEmpty', 'leaguePlace', 'leaguePlayer', 'leaguePoints', 'leagueGames', 'leagueFirsts', 'leagueFormer', 'leagueRules', 'leagueHall', 'leagueHallEmpty', 'leagueChampionTitle', 'leagueTitlesHeading'];
  const ADDED_LEAGUE_PLURALS = ['leagueGained_one', 'leagueGained_few', 'leagueGained_many', 'leagueHostRow_one', 'leagueHostRow_few', 'leagueHostRow_many'];
  /** 47: «Бібліотека вікторин» — аркуш «Відкрити для всіх» у «Моїх вікторинах»; решта ключів і множини — у наступних задачах. */
  const ADDED_LIBRARY = ['libraryTitle', 'libraryShareTitle', 'libraryShareWarning', 'libraryShareLanguage', 'libraryOpen', 'libraryUpdate', 'libraryClose', 'libraryCloseConfirm', 'librarySnapshotHint', 'libraryStatusOpen', 'libraryStatusClosed', 'libraryStatusAuto', 'libraryStatusHidden', 'libraryAppeal', 'libraryAppealSent', 'libraryAppealUsed', 'err_library_invalid', 'err_library_too_few', 'err_library_hidden', 'err_library_not_hidden', 'err_library_appeal_used', 'menuLibrary', 'menuShortLibrary', 'librarySearch', 'librarySort', 'librarySortPopular', 'librarySortNew', 'libraryLanguage', 'libraryAnyLanguage', 'libraryEmpty', 'libraryMore', 'libraryBy', 'libraryRounds', 'libraryLike', 'libraryCopy', 'libraryCopied', 'libraryOpenCopy', 'libraryNoAnswers', 'err_library_own', 'reportButton', 'reportTitle', 'reportReason', 'reportReason_offensive', 'reportReason_spam', 'reportReason_personal', 'reportReason_other', 'reportText', 'reportSend', 'reportSent', 'reportClose', 'err_already_reported', 'err_cannot_report_self', 'adminTabReports', 'adminReportsIntro', 'adminReportsEmpty', 'adminReportQuiz', 'adminReportProfile', 'adminReportAppeal', 'adminReportOpenQuiz', 'adminReportOpenUser', 'adminHideQuiz', 'adminRestoreQuiz', 'adminResetNick', 'adminResetAvatar', 'adminDismissReport', 'adminHideQuizConfirm', 'adminRestoreQuizConfirm', 'adminResetNickConfirm', 'adminResetAvatarConfirm', 'adminDismissConfirm', 'adminLogWas', 'adminLog_library_hide', 'adminLog_library_restore', 'adminLog_report_dismiss', 'adminLog_appeal_reject', 'adminLog_nickname_reset', 'adminLog_avatar_reset', 'adminRejectAppeal', 'adminRejectAppealConfirm', 'adminReportSnapshot'];
  const ADDED_LIBRARY_PLURALS = ['libraryQuestions_one', 'libraryQuestions_few', 'libraryQuestions_many', 'libraryPlays_one', 'libraryPlays_few', 'libraryPlays_many', 'adminReportCount_one', 'adminReportCount_few', 'adminReportCount_many'];
  const ADDED_CHALLENGE_PLURALS = ['challengeDaysLeft_one', 'challengeDaysLeft_few', 'challengeDaysLeft_many', 'challengePlayed_one', 'challengePlayed_few', 'challengePlayed_many', 'challengeSkipQuestions_one', 'challengeSkipQuestions_few', 'challengeSkipQuestions_many'];
  const ADDED_STAGE_SOUNDS = ['stageSoundsUnlock', 'stageSoundsToggle', 'stageSoundsOffByHost', 'hostSounds', 'hostSoundsHint'];
  const ADDED_DUEL_BETS_PLURALS = ['duelBetsCount_one', 'duelBetsCount_few', 'duelBetsCount_many'];
  const ADDED_WORDLE = ['type_wordle', 'typeShort_wordle', 'typeHow_wordle', 'buffWhy_off_wordle', 'err_wordle_word', 'err_wordle_length', 'err_wordle_unknown', 'err_wordle_repeat', 'err_invalid_payload_wordle_unknown', 'problemWordleWord', 'problemWordleLeak', 'problemWordlePlace', 'problemWordleVideo', 'wordleWord', 'wordleWordHint', 'wordleUnknown', 'wordleLetterCount', 'wordleOnPhone', 'wordleCheck', 'wordleErase', 'wordleHit', 'wordleNear', 'wordleMiss', 'wordleCell', 'wordleLegend', 'wordleSolved', 'wordleOut', 'wordleWatch', 'wordleWordIs', 'wordleNotSolved', 'wordleCorrect', 'wordleLive', 'summaryWordles_one'];
  const ADDED_WORDLE_PLURALS = ['summaryWordles_few', 'summaryWordles_many', 'wordleTries_one', 'wordleTries_few', 'wordleTries_many', 'wordleSolvedIn_one', 'wordleSolvedIn_few', 'wordleSolvedIn_many'];
  const ADDED_LEVELS_49 = ['xpMomentTitle', 'xpMomentGained', 'xpMomentPending', 'xpMomentGuest', 'xpMomentGuestLink', 'xpLineJoin', 'xpLinePlace', 'xpLineCap', 'xpLineAchievement', 'xpLineAchievements', 'xpLineGame', 'xpMomentLevelUp', 'xpMomentUnlocked', 'xpMomentToNext', 'xpMomentAllRewards', 'xpReason_few_questions', 'xpReason_few_accounts', 'xpReason_author', 'xpReason_repeat_quiz', 'xpReason_cap', 'achievementShare', 'achievementShareNone', 'achievementRare', 'achievementVeryRare', 'achievementXp', 'levelMapTitle', 'levelMapLink', 'levelMapLocked', 'levelMapHere', 'levelMapNoReward', 'levelMapGot', 'formTitle', 'formGame', 'formTeamGame', 'formPlaceAria', 'xpLineCorrect_one', 'formWins_one', 'formTop3_one'];
  const ADDED_LEVELS_49_PLURALS = ['xpLineCorrect_few', 'xpLineCorrect_many', 'formWins_few', 'formWins_many', 'formTop3_few', 'formTop3_many'];
  const ADDED_ADMIN_HOME_53 = ['adminTabLive', 'adminLiveEmpty', 'adminLiveRefresh', 'adminLiveAuto', 'adminLiveCode', 'adminLiveHost', 'adminLiveGuestHost', 'adminLiveAutopilot', 'adminLivePlayers', 'adminLiveLobby', 'adminLiveStarting', 'adminLiveRound', 'adminLivePaused', 'adminLiveFinished', 'adminLiveAge', 'adminLiveActed', 'adminLiveJustNow', 'adminLiveMinutes', 'adminLiveSpanMinutes', 'adminLiveSpanHours', 'adminLiveStage', 'adminLiveClose', 'adminLiveCloseConfirm', 'adminLiveClosed', 'err_game_finished', 'adminLog_game_close', 'adminLog_announcement_set', 'adminLog_announcement_clear', 'adminChartsTitle', 'adminChartPlayers', 'adminChartGames', 'adminChartCompletion', 'adminChartReturns', 'adminChartReturnsHint', 'adminChartDay', 'adminChartValue', 'adminChartMax', 'adminChartsComputed', 'adminHealthTitle', 'adminHealthBackup', 'adminHealthBackupLine', 'adminHealthBackupNone', 'adminHealthBackupOff', 'adminHealthBackupError', 'adminHealthUptime', 'adminHealthUptimeValue', 'adminHealthMemory', 'adminHealthMemoryValue', 'adminHealthRooms', 'adminHealthConnections', 'adminMegabytes', 'adminTabAnnouncement', 'adminAnnounceCurrent', 'adminAnnounceNone', 'adminAnnounceExpires', 'adminAnnounceText', 'adminAnnounceCount', 'adminAnnounceUrl', 'adminAnnounceUrlHint', 'adminAnnounceUntil', 'adminAnnounceForever', 'adminAnnounceDate', 'adminAnnouncePreview', 'adminAnnouncePublish', 'adminAnnounceReplace', 'adminAnnounceClear', 'adminAnnounceClearConfirm', 'adminAnnounceSaved', 'err_announcement_expiry', 'announceLabel', 'announceMore', 'announceClose', 'homeContinueTitle', 'homeContinueRunning', 'homeContinueBack', 'homeContinueSaved', 'homeEventTitle', 'homeEventWhen', 'homeEventHost', 'homeEventOpen', 'homeEventCalendar', 'adminLiveAgeNew', 'adminLiveStale', 'adminChartMaxPercent', 'adminChartNoData'];
  const ADDED_STICKY_TIMER_55 = ['timerLeft'];
  const ADDED_SMALL_FIXES_60 = ['appealKeptMine', 'bluffLieEdit'];
  const ADDED_WORDLE_61 = ['wordleHeadline', 'wordlePlayed'];
  const ADDED_BOT_ROOM_62 = ['adminBotListed', 'adminBotListedHint', 'adminBotPasswordHint', 'adminBotPasswordShow', 'adminBotPeople', 'adminBotPeopleEmpty', 'adminBotOffline', 'adminBotSkip', 'adminBotSkipConfirm', 'adminBotTime', 'adminBotPlanUnlisted', 'adminLog_bot_room_start', 'adminLog_bot_room_pause', 'adminLog_bot_room_resume', 'adminLog_bot_room_end', 'adminLog_bot_room_skip', 'adminLog_bot_room_time', 'adminLog_bot_room_end_round', 'adminLog_bot_room_kick', 'adminLog_bot_room_release', 'adminLog_bot_room_teams', 'adminLog_bot_room_lobby', 'adminBotLogListed', 'adminBotLogUnlisted', 'adminBotLogOpen'];
  const ADDED_PLAYER_CARD_58 = ['adminCardOverview', 'adminCardRegistered', 'adminCardLastSeen', 'adminCardNeverSeen', 'adminCardLevel', 'adminCardCounts', 'adminCardAchievements', 'adminCardNoAchievements', 'adminCardGrant', 'adminCardGrantPick', 'adminCardGrantConfirm', 'adminCardBlocked', 'adminCardXp', 'adminCardXpAmount', 'adminCardXpReason', 'adminCardXpAdd', 'adminCardXpConfirm', 'adminCardXpDone', 'adminCardGames', 'adminCardNoGames', 'adminCardGameLine', 'adminCardQuizzes', 'adminCardNoQuizzes', 'adminCardBans', 'adminCardNoBans', 'adminCardBanLine', 'adminCardUnbanLine', 'adminCardResetNick', 'adminCardResetNickConfirm', 'adminCardResetAvatar', 'adminCardResetAvatarConfirm', 'adminCardGift', 'adminCardGiftPick', 'adminCardGiftNote', 'adminCardGiftNew', 'adminCardGiftNone', 'adminCardGiftConfirm', 'adminCardDelete', 'adminCardDeleteLead', 'adminCardDeleteType', 'adminCardDeleteConfirm', 'adminGameBack', 'awardGift', 'awardGiftLine', 'feedPrizeGift', 'levelAdminTitle', 'levelAdminBalance', 'deletedPlayer', 'deletedFact', 'err_achievement_owned', 'err_xp_below_zero', 'err_prize_not_found', 'err_cannot_delete_admin', 'err_confirm_mismatch', 'err_achievement_not_owned', 'err_gift_not_found', 'err_delete_failed', 'adminLog_achievement_grant', 'adminLog_achievement_revoke', 'adminLog_xp_adjust', 'adminLog_prize_gift', 'adminLog_gift_revoke', 'adminLog_account_delete', 'adminLogGiftNote', 'adminLogBalanced'];
  const ADDED_BOT_54 = ['adminTabBot', 'adminBotLead', 'adminBotRooms', 'adminBotRoomsCount', 'adminBotRoomsEmpty', 'adminBotCode', 'adminBotLobby', 'adminBotPlaying', 'adminBotPaused', 'adminBotFinished', 'adminBotPlayers', 'adminBotStage', 'adminBotJoin', 'adminBotStart', 'adminBotPause', 'adminBotResume', 'adminBotEnd', 'adminBotEndConfirm', 'adminBotRefresh', 'adminBotQuizzes', 'adminBotQuizzesEmpty', 'adminBotLaunch', 'adminBotLaunched', 'adminBotDelete', 'adminBotDeleteConfirm', 'adminBotCopyTitle', 'adminBotCopyHint', 'adminBotCopy', 'adminBotCopied', 'adminBotMineEmpty', 'adminBotSize', 'err_bot_rooms_full', 'err_bot_unavailable','adminBotRounds_one', 'adminLog_bot_game_start', 'adminLog_bot_copy', 'adminLog_bot_quiz_delete'];
  const ADDED_BOT_54_PLURALS = ['adminBotRounds_few', 'adminBotRounds_many'];
  const ADDED_BROADCAST_59 = ['adminTabBroadcast', 'adminBroadcastLead', 'adminBroadcastTitleLabel', 'adminBroadcastTextLabel', 'adminBroadcastChars', 'adminBroadcastUrlLabel', 'adminBroadcastUrlHint', 'adminBroadcastUrlBad', 'adminBroadcastTo', 'adminBroadcastToAll', 'adminBroadcastToGroup', 'adminBroadcastToPeople', 'adminBroadcastNoGroups', 'adminBroadcastPeople_one', 'adminBroadcastPreview', 'adminBroadcastSend', 'adminBroadcastConfirm', 'adminBroadcastSent', 'adminBroadcastLastDay', 'adminBroadcastNextAt', 'adminBroadcastHistory', 'adminBroadcastHistoryEmpty', 'adminBroadcastShownAll', 'adminBroadcastShownGroup', 'adminBroadcastGroupGone', 'adminBroadcastShownPeople', 'adminBroadcastCounts', 'adminBroadcastSending', 'adminBroadcastInterrupted', 'err_broadcast_too_soon', 'err_broadcast_day_limit', 'err_broadcast_nobody', 'err_push_off', 'adminLog_push_broadcast', 'adminPushLabel', 'adminPushToggle', 'adminPushHint', 'adminPushSaveFailed'];
  /** 64: сторінка «Повідомити про проблему» (задача 6); вкладки адмінки «Збої» й «Копії» додає задача 7. */
  const ADDED_ERRORS_64 = ['adminLogGroup_system', 'problemLink', 'problemReportTitle', 'problemLead', 'problemTextLabel', 'problemChars', 'problemAttach', 'problemAttachHint', 'problemPagePath', 'problemPageBrowser', 'problemPageScreen', 'problemPageLang', 'problemPageTheme', 'problemThemeLight', 'problemThemeDark', 'problemSend', 'problemSent', 'problemGuestHint', 'problemMine', 'problemMineEmpty', 'problemOpen', 'problemResolved', 'problemReplyFrom', 'err_problem_rate', 'err_problem_busy', 'adminTabErrors', 'adminTabErrorsBadge', 'adminTabBackups', 'adminErrorsNew', 'adminErrorsResolvedFilter', 'adminErrorsEmpty', 'adminErrorWhere', 'adminErrorCounts', 'adminErrorTimes', 'adminErrorStack', 'adminErrorResolve', 'adminErrorResolvedBy', 'adminProblemsOpen', 'adminProblemsEmpty', 'adminProblemGuest', 'adminProblemDeleted', 'adminProblemNoPage', 'adminProblemResolve', 'adminProblemReply', 'adminProblemReplyLabel', 'adminProblemReplySend', 'adminProblemReplied', 'err_problem_no_account', 'err_problem_replied', 'adminBackupsLatest', 'adminBackupsNone', 'adminBackupsOff', 'adminBackupsNoStore', 'adminBackupsListError', 'adminBackupsNow', 'adminBackupsNowConfirm', 'adminBackupsRunning', 'adminBackupsNextAt', 'adminBackupsLastOk', 'adminBackupsLastFailed', 'adminBackupsLastLocked', 'adminBackupsBySchedule', 'adminBackupsByAdmin', 'adminBackupsLevel', 'adminBackupsCopyCommand', 'adminBackupsCopied', 'adminBackupsRestoreTitle', 'adminBackupsRestoreLead', 'adminBackupsRestoreStep1', 'adminBackupsRestoreStep2', 'adminBackupsRestoreStep3', 'adminBackupsRestoreStep4', 'err_backup_recent', 'err_backup_busy', 'err_backup_off', 'adminLog_server_error_resolve', 'adminLog_problem_resolve', 'adminLog_problem_reply', 'adminLog_backup_now', 'adminErrorResolvedNotice'];
  const ADDED_ERRORS_64_SW = ['pushProblemReplyTitle'];
  /** 72: пуш «тебе додали до групи». */
  const ADDED_72_SW = ['pushGroupAddedTitle', 'pushGroupAddedBody'];
  /** 66: об'єднання двох акаунтів на картці гравця (задача 7) і текст для адреси, злитої з іншим акаунтом, на сторінці входу. */
  const ADDED_BOT_ADJUST = ['adminBotPointsLabel', 'adminBotAdjustConfirm', 'adminLog_bot_room_adjust'];
  const ADDED_MERGE_66 = ['adminMerge', 'adminMergeLead', 'adminMergeSearch', 'adminMergePrimary', 'adminMergeTotal', 'adminMergeMoves', 'adminMergeSame', 'adminMergeLogins', 'adminMergeLoginGoogle', 'adminMergeLoginCredential', 'adminMergeLoginOther', 'adminMergePasswordDropped', 'adminMergeType', 'adminMergeButton', 'adminMergeConfirm', 'adminMergeNothing', 'adminMergeCount_games', 'adminMergeCount_hosted', 'adminMergeCount_quizzes', 'adminMergeCount_achievements', 'adminMergeCount_xp', 'adminMergeCount_friends', 'adminMergeCount_groups', 'adminMergeCount_prizes', 'adminMergeCount_likes', 'adminMergeCount_calendar', 'adminMergeCount_challenges', 'adminMergeCount_league', 'adminMergeSame_games', 'adminMergeSame_groups', 'adminMergeSame_friends', 'adminMergeSame_achievements', 'adminLog_account_merge', 'err_merge_same', 'err_merge_admin', 'err_merge_banned', 'err_merge_live', 'err_merge_failed', 'err_email_merged'];
  /** 69: компактний список користувачів і масові дії картки. */
  /** 71: графіки статистики з діалогом, розширений «Стан» і метрики за період. */
  const ADDED_71 = ['chartExpand', 'chartExpandShort', 'chartClose', 'chartShowTable', 'chartShowChart', 'chartAverage', 'chartTotal', 'chartWeekOf', 'chartWeekRange', 'chartHour', 'chartKeysHint', 'chartPercentValue', 'chartMinutesValue', 'chartHoursMinutes', 'chartSinceHint', 'adminMetricsTitle', 'adminMetricsPeriod', 'adminMetricsPeriod_7', 'adminMetricsPeriod_30', 'adminMetricsPeriod_90', 'adminMetricsPeriod_365', 'adminMetricsUp', 'adminMetricsDown', 'adminMetricsSame', 'adminMetricsNoPrevious', 'adminMetricActive', 'adminMetricGamesByHost', 'adminMetricHostPeople', 'adminMetricHostAutopilot', 'adminMetricHostBot', 'adminMetricAvgPlayers', 'adminMetricGameTime', 'adminMetricGameTimeHint', 'adminMetricNewUsers', 'adminMetricEditorTime', 'adminMetricEditorHint', 'adminMetricNewQuizzes', 'adminMetricHours', 'adminMetricRoundTypes', 'adminMetricQuestionTypes', 'adminMetricQuestionTypesHint', 'adminMetricTopQuizzes', 'adminMetricTopQuizMeta', 'adminMetricTopEditors', 'adminMetricTopEditorMeta', 'adminMetricEmptyList', 'adminKpiGames', 'adminKpiCompletion', 'adminKpiAvgPlayers', 'adminKpiMedianGame', 'adminKpiGameHours', 'adminKpiPlayerHours', 'adminKpiNewUsers', 'adminKpiActivation', 'adminKpiDau', 'adminKpiWau', 'adminKpiMau', 'adminKpiStickiness', 'adminKpiEditorHours', 'adminKpiEditorSessions', 'adminKpiEditorSession', 'adminKpiEditors', 'adminKpiNewQuizzes', 'adminKpiBotGames', 'adminHealthGroupServer', 'adminHealthGroupGames', 'adminHealthGroupDb', 'adminHealthGroupProblems', 'adminHealthVersion', 'adminHealthVersionUnknown', 'adminHealthNode', 'adminHealthStarted', 'adminHealthStartedValue', 'adminHealthMemoryFull', 'adminHealthCpu', 'adminHealthCpuValue', 'adminHealthLag', 'adminHealthLagValue', 'adminHealthWaiting', 'adminHealthLobbies', 'adminHealthPlaying', 'adminHealthPaused', 'adminHealthBotRooms', 'adminHealthAutopilotRooms', 'adminHealthPlayers', 'adminHealthPlayersValue', 'adminHealthCapacity', 'adminHealthCapacityValue', 'adminHealthRestarting', 'adminHealthDbSize', 'adminHealthRows', 'adminHealthRow_user', 'adminHealthRow_quiz', 'adminHealthRow_game', 'adminHealthRow_participant', 'adminHealthRow_answer', 'adminHealthRow_game_event', 'adminHealthRow_saved_game', 'adminHealthRow_activity_day', 'adminHealthPush', 'adminHealthPushValue', 'adminHealthBackupsTotal', 'adminHealthBackupsTotalValue', 'adminHealthDbFailed', 'adminHealthErrors24', 'adminHealthErrors24Value', 'adminHealthErrorsNew', 'adminHealthProblemsOpen', 'adminHealthReportsOpen', 'adminHealthChecked', 'adminHealthRefresh', 'chartWeek', 'chartPointsValue', 'adminHealthRefreshing', 'adminHealthRefreshFailed'];
  /** 72: додати учасника й запис з адмінки; «тебе додали до групи» у «Вхідних». */
  const ADDED_72 = ['adminGroupAddTitle', 'adminGroupAddLead', 'adminGroupAddButton', 'adminGroupAddConfirm', 'adminGroupAdded', 'adminGroupAddedPushed', 'adminGroupAddedNoPush', 'adminGroupFull', 'adminGroupItemAddTitle', 'adminGroupItemAddLead', 'adminGroupItemAbout', 'adminGroupItemAddButton', 'adminGroupItemAdded', 'adminGroupItemsFull', 'err_user_not_found', 'err_member_banned', 'err_group_hidden', 'err_already_member', 'err_member_too_many_groups', 'adminLog_group_member_add', 'adminLog_group_item_add', 'inboxGroupAdded', 'inboxGroupOpen'];
  const ADDED_73 = ['quizFoldersLabel', 'quizFolderAll', 'quizFolderNone', 'quizFolderChip', 'quizFoldersManage', 'quizFoldersHint', 'quizFoldersEmpty', 'quizFolderNewLabel', 'quizFolderAdd', 'quizFolderNameLabel', 'quizFolderSave', 'quizFolderUp', 'quizFolderDown', 'quizFolderDelete', 'quizFolderDeleteConfirm', 'quizFoldersLimit', 'quizFolderPick', 'quizFolderPickNone', 'quizFolderEmptyList', 'quizNoFolderEmptyList', 'quizSort', 'quizSort_new', 'quizSort_old', 'quizSort_name', 'quizSort_changed', 'quizCreatedOn', 'quizCreatedChanged', 'err_folder_name_taken', 'err_folders_full', 'err_folders_changed'];
  const ADDED_75 = ['guideSkipVote', 'guideSkipCancel', 'guideSkipCount'];
  /** 76: навігація, етап 1 — головна, «назад» зі словом, стани сторінки, редактор. */
  const ADDED_76 = ['pageHome', 'backTo', 'retryLoad', 'emptyHostGame', 'emptyJoinByCode', 'libraryClearSearch', 'leaveUnsaved', 'editorHostGame', 'editorSaveAndHost'];
  /** 77: навігація, етап 2 — вкладки «Вікторин», картка з «⋯», «Провести гру» з бібліотеки. */
  const ADDED_77 = ['menuShortQuizzesTight', 'quizzesTabMine', 'quizzesTabLiked', 'quizzesLikedTitle', 'quizMoreActions', 'quizShareLibrary', 'quizExportFile', 'quizExportTable', 'libraryHost', 'libraryHostSignIn'];
  /** 78: навігація, етап 3 — головна гостя, «Що далі», «Швидкий запуск», низ, «З чого почати». */
  const ADDED_78 = ['homeGuestAbout', 'homeGuestHow', 'homeGuestLibrary', 'homeGuestSignIn', 'homeInviteTitle', 'homeInviteFrom', 'homeChallengeTitle', 'homeChallengePlay', 'homeQuickTitle', 'homeQuickHost', 'homeQuickAll', 'homeFooterLabel', 'welcomeTitle', 'welcomeJoin', 'welcomeLibrary', 'welcomeCreate', 'welcomeDone'];
  /** 79: навігація, етап 4 — блоки профілю, ліга в групах, зіграні ігри, «Мої виклики». */
  const ADDED_79 = ['profileBlockAchievements', 'profileBlockPeople', 'profileBlockSettings', 'profileTileLevel', 'groupLeagueSpot', 'groupLeagueNoPoints', 'groupHostGame', 'createForGroup', 'playedAsYou', 'playedMineTitle', 'playedYourAnswer', 'playedRight', 'playedWrong', 'playedNoAnswer', 'playedQuestionNo', 'playedStatsLink', 'statsPlayedLink', 'historyTabChallenges', 'challengesTitle', 'challengesSent', 'challengesReceived', 'challengesSentEmpty', 'challengesReceivedEmpty', 'challengeBestLine'];
  const ADDED_80 = ['playHelpTitle', 'playHelpLead', 'playHelpJoinTitle', 'playHelpJoinCode', 'playHelpJoinOpen', 'playHelpJoinNick', 'playHelpAnswerTitle', 'playHelpAnswerLead', 'playHelpAnswerTap', 'playHelpAnswerType', 'playHelpAnswerMove', 'playHelpAnswerGuide', 'playHelpBuffsTitle', 'playHelpBuffsLead', 'playHelpBuffsMore', 'playHelpAppealTitle', 'playHelpAppealText', 'playHelpAppealLimit', 'playHelpAwayTitle', 'playHelpAwayText', 'playHelpAwayScreen', 'playHelpEasyTitle', 'playHelpEasyText', 'playHelpAfterTitle', 'playHelpAfterText', 'playHelpAfterAccount', 'playHelpHostLead', 'playHelpNewTab', 'helpPlayersLead', 'settingsHelp', 'siteLooksButton', 'siteLooksTitle', 'siteLooksLabel'];
  /** 77: змінені uk-тексти, чиї переклади теж оновлено. */
  const CHANGED_77 = ['menuJoin', 'menuShortJoin', 'menuQuizzes', 'menuShortQuizzes', 'startCreate', 'play', 'adminRestoreQuizConfirm'];
  /** Пояснення після відповіді: телефон, редактор, імпорт таблиці й перегляд адміна. */
  const ADDED_EXPLANATION = ['explanationTitle', 'explanationLabel', 'explanationPlaceholder', 'ioProblem_explanation_long', 'adminPreviewExplanation', 'puzzleDoneIn', 'puzzleYoursIn'];
  const ADDED_74 = [
    'editorTabs', 'editorTabGeneral', 'editorTabRounds', 'editorTabErrors', 'requiredMark', 'issuesButton', 'issuesRemindersOnly', 'issuesNone', 'issuesTitle', 'issuesErrors', 'issuesReminders', 'issuesClose', 'saveBlocked', 'saveBlockedShow', 'cardAbout', 'cardRules', 'cardQuestion', 'cardMedia', 'cardMediaAdd', 'cardMediaImage', 'cardMediaVideo', 'cardMediaVideoFrom', 'cardMediaAudio', 'cardAnswers', 'cardTime', 'summaryPowersOn', 'summaryOff', 'summarySpares', 'summaryDuels', 'markError', 'markReminder', 'comboSearch', 'comboEmpty', 'roundPick', 'roundMenu', 'reminderTimer', 'reminderTimerInline', 'reminderBooleansYes', 'reminderBooleansNo', 'reminderNoDescription',
    ...['choice', 'input', 'media', 'games', 'polls'].map((id) => `typeGroup_${id}`),
    ...QUESTION_TYPES.map((type) => `typeDesc_${type}`),
  ];
  const ADDED_70 = ['adminProblemGameRoundNoTitle', 'adminTabAppeals', 'adminTabAppealsBadge', 'adminAppealsViews', 'adminAppealsComplaints', 'adminAppealsProblems', 'adminAppealsErrors', 'adminAppealsNew', 'adminProblemGame', 'adminProblemGameRole_player', 'adminProblemGameRole_host', 'adminProblemGameQuiz', 'adminProblemGameNoQuiz', 'adminProblemGameOpenQuiz', 'adminProblemGameRound', 'adminProblemGameQuestion', 'adminProblemGamePhase', 'adminProblemGameText', 'adminProblemReplyInboxHint', 'adminProblemReplyInboxPushed', 'adminProblemReplyInboxOnly', 'adminBroadcastInboxAudience', 'adminBroadcastInboxNobody', 'adminBroadcastInboxNoPush', 'adminBroadcastInboxStats', 'menuInbox', 'menuInboxBadge', 'inboxTitle', 'inboxEmpty', 'inboxNew', 'inboxFromAdmin', 'inboxReplyTitle', 'inboxYouWrote', 'inboxOpenLink', 'inboxAllProblems', 'problemPageGame', 'problemPageGameLobby', 'pushInviteTitle', 'pushInviteText', 'pushInviteOn', 'pushInviteLater', 'pushInviteDone'];
  const ADDED_USERS_69 = ['adminBannedShort', 'adminCardModeration', 'adminCardBlockedCount', 'adminPickAll', 'adminPickLegend', 'adminCardRevokePicked', 'adminCardRevokePickedConfirm', 'adminCardRevokePartial', 'adminCardDeletePicked', 'adminCardDeletePickedConfirm', 'adminCardRemovePicked', 'adminCardRemovePickedConfirm', 'adminCardPickedPartial'];
  const ADDED_BOT_HOST_68 = ['botHostAuto', 'botHostManualMine', 'botHostManualOther', 'botHostTakeOver', 'botHostGiveBack', 'botHostBack', 'botHostDenied', 'adminBotHostOpen', 'adminBotManualTag', 'adminBotHosts', 'adminLog_bot_room_host_open', 'adminLog_bot_room_manual_on', 'adminLog_bot_room_manual_off', 'adminLog_bot_room_grade', 'adminLog_bot_room_grade_plain', 'adminLog_bot_room_undo', 'adminLog_bot_room_debuff', 'adminLog_bot_room_hint', 'botHostRetry', 'adminLog_bot_room_kick_plain', 'adminLog_bot_room_release_plain', 'adminLog_bot_room_adjust_plain', 'adminLog_bot_room_debuff_plain', 'adminLog_bot_room_hint_plain'];
  /** 65: повтор гри по кроках для адміністраторів (задача 4). */
  const ADDED_REPLAY_65 = ['adminReplayOpen', 'adminReplayTitle', 'adminReplayBackToGame', 'adminReplayPrev', 'adminReplayNext', 'adminReplayJump', 'adminReplayStep', 'adminReplayRound', 'adminReplayStart', 'adminReplayPrice', 'adminReplayPriceMark', 'adminReplayNotRecorded', 'adminReplayPlayer', 'adminReplayAnswer', 'adminReplayTime', 'adminReplayVerdict', 'adminReplayPoints', 'adminReplayScore', 'adminReplayBy', 'adminReplayVerdict_correct', 'adminReplayVerdict_partial', 'adminReplayVerdict_wrong', 'adminReplayVerdict_none', 'adminReplayManual', 'adminReplayEvents', 'adminReplayNoEvents', 'adminReplayEventManual', 'adminReplayEventAdjust', 'adminReplayEventBuff', 'adminReplayEventDebuff', 'adminReplayEventAppeal', 'adminReplayEventJoin', 'adminReplayEventLeave', 'adminReplayEventPause', 'adminReplayEventPauseOpen', 'adminReplayVerdict_noAnswer', 'adminReplayTarget', 'adminReplayUndoesQuestion', 'adminReplayUndoesSeq', 'adminReplayAttempt', 'adminReplayWager', 'adminReplayEventPauseUnknown', 'adminReplayNotRecordedStep', 'adminReplayNoSteps', 'adminReplayStatus', 'err_replay_running', 'adminLog_game_replay_view'];
  const ADDED_BROADCAST_59_PLURALS = ['adminBroadcastPeople_few', 'adminBroadcastPeople_many'];
  /** 63: модерація стрічки й груп (задача 6). */
  const ADDED_MODERATION_63 = ['adminTabFeed', 'adminTabGroups', 'adminFeedLead', 'adminFeedPerson', 'adminFeedKind', 'adminFeedKindAll', 'adminFeedKind_game', 'adminFeedKind_achievement', 'adminFeedKind_level', 'adminFeedKind_prize', 'adminFeedKind_planned', 'adminFeedHidden', 'adminFeedHide', 'adminFeedShow', 'adminFeedEmpty', 'adminSearchGroups', 'adminGroupsEmpty', 'adminGroupMembers_one', 'adminGroupOwner', 'adminGroupNoOwner', 'adminGroupHidden', 'adminGroupHide', 'adminGroupHideReason', 'adminGroupHideConfirm', 'adminGroupRestore', 'adminGroupMembersTitle', 'adminGroupBanned', 'adminGroupRemove', 'adminGroupRemoveConfirm', 'adminGroupMakeOwner', 'adminGroupMakeOwnerConfirm', 'adminGroupItems', 'adminGroupItemsEmpty', 'adminGroupItemHide', 'adminGroupItemShow', 'adminGroupSurprise', 'adminGroupDelete', 'adminGroupDeleteLead', 'adminGroupDeleteType', 'adminGroupDeleteConfirm', 'adminGroupBack', 'err_group_name_mismatch', 'feedHiddenByModerator', 'groupHiddenByModerator', 'groupHiddenReason', 'adminLog_feed_hide', 'adminLog_feed_show', 'adminLog_group_hide', 'adminLog_group_restore', 'adminLog_group_member_remove', 'adminLog_group_owner_transfer', 'adminLog_group_delete', 'adminLog_group_item_hide', 'adminLog_group_item_show', 'adminLogFilters', 'adminLogWho', 'adminLogWhoAll', 'adminLogWhat', 'adminLogGroup_moderation', 'adminLogGroup_players', 'adminLogGroup_games', 'adminLogGroup_bot', 'adminLogGroup_announcements', 'adminLogFrom', 'adminLogTo', 'adminLogSearch', 'adminLogClear', 'adminLogNothing', 'adminLogCsv', 'adminLogCsvCapped', 'adminLogCsvAt', 'adminLogCsvAdmin', 'adminLogCsvAction', 'adminLogCsvTarget', 'adminLogCsvDetails'];
  const ADDED_MODERATION_63_PLURALS = ['adminGroupMembers_few', 'adminGroupMembers_many'];
  const ADDED_MENU_ADMIN = ['menuAdmin', 'menuShortAdmin'];
  const ADDED_29E_PLURALS = ['summaryMelodies_few', 'summaryMelodies_many'];
  /** 27a: раунд «Ставки» — назва, пояснення, помилки, редактор, обріз, історія. */
  const ADDED_27A = ['roundTypeBets', 'roundHow_bets', 'buffWhy_off_bets', 'scoreSource_bets', 'err_bet_skipped', 'err_bet_range', 'summaryBetsMinimum', 'summaryBetsMinimumFlat', 'summaryBetsMax', 'summaryBetsAll', 'betsHistoryLine', 'betsQuestionOf', 'betsTeaserLabel', 'betsPrompt', 'betsPlace', 'betsMinimumButton', 'betsMine', 'betsSkipLow', 'betsSkipLate', 'betsWon', 'betsLost', 'betsRefunded', 'betsKeptNoBank', 'betStartLabel', 'betStepLabel', 'betMaxLabel', 'betMaxPlaceholder', 'betsMinimumsNote', 'betsCutLabel', 'betsCutNone', 'betsCutAll', 'betsCutPreview', 'betsCutPreviewNone', 'betsCutHidden', 'betsSettingsNote', 'problemBetsMax', 'problemBetsCut', 'betsBank', 'betsPlacedNames', 'betsNobodyYet', 'betsMinimumStage', 'betsMaximumStage', 'betsSkipping', 'betsOpen', 'betsHostCut', 'betsHostLimit', 'betsHostCannot', 'betsRefundStage', 'betsRowStake'];
  /** Після 22a свідомо змінені uk-тексти: посилання на друзів ведуть на сторінку «Друзі», а не в профіль. */
  const CHANGED_LATER = ['feedEmptyLink', 'noFriendsToInvite', /* перший пункт меню веде на стартове меню — «Меню» */ 'menuJoin', 'menuShortJoin', /* 24d: «Рамка» стала «Рамка ніку», бо з'явилась рамка фото */ 'lookFrame', /* 34: стікери відкривають набори — назва набору й «рівень або досягнення» */ 'reward_stickers', 'err_sticker_locked', /* 76: порожні історії на «ти» й без «увійдіть» для того, хто вже увійшов */ 'historyEmpty', 'myGamesEmpty', /* 77: меню «Головна · Вікторини», «Бібліотека» без «Каталог», «Провести гру» */ 'menuQuizzes', 'menuShortQuizzes', 'menuShortLibrary', 'startCreate', 'play', 'edit', 'adminRestoreQuizConfirm'];

  it('keeps every uk text as it was before localisation', () => {
    const current: Record<string, string> = ukMessages;
    const changed = Object.entries(golden as Record<string, string>).filter(([key, value]) => !REMOVED.includes(key) && !CHANGED_LATER.includes(key) && current[key] !== value);
    expect(changed).toEqual([]);
    const removedStill = REMOVED.filter((key) => key in current);
    expect(removedStill).toEqual([]);
  });

  it('28d keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_28D) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_28D.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('12j keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_12J) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_12J.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('12k keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_12K) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_12K.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('12l keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_12L) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_12L.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('32 keys are in every language (the worker page in the push dictionaries)', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const push: Record<string, Record<string, string>> = { en: pushEn, pl: pushPl, de: pushDe, es: pushEs, it: pushIt, ar: pushAr };
    for (const key of ADDED_32) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_32_UI.filter((key) => !(key in dict)), lang).toEqual([]);
    for (const [lang, dict] of Object.entries(push)) expect(ADDED_32_SW.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('34 keys are in every language, and reward_stickers names its pack by {name}', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_34) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_34.filter((key) => !(key in dict)), lang).toEqual([]);
    for (const dict of [ukMessages as Record<string, string>, ...Object.values(locales)]) {
      expect(dict.reward_stickers).toContain('{name}');
      expect(dict.reward_stickers).not.toContain('{series}');
    }
  });

  it('33 keys (93: name, joke and condition of the 31 new achievements) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    expect(ADDED_33).toHaveLength(93);
    for (const key of ADDED_33) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_33.filter((key) => !(key in dict)), lang).toEqual([]);
      for (const key of ADDED_33) expect(dict[key]?.trim(), `${lang} ${key}`).toBeTruthy();
    }
  });

  it('31 keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_31) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_31.filter((key) => !(key in dict)), lang).toEqual([]);
    for (const key of ADDED_THEME) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_THEME.filter((key) => !(key in dict)), lang).toEqual([]);
    for (const key of ADDED_MEMORY_PEEK) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_MEMORY_PEEK.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('truth recap keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_TRUTH_RECAP) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_TRUTH_RECAP.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('truth team recap keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_TRUTH_TEAM) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_TRUTH_TEAM.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('52 truth fake keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_TRUTH_52) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_TRUTH_52.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('30a keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_30A) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_30A.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('29i keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_29I) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_29I.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('29c keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_29C) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_29C.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('29d keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_29D) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_29D.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('29f keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_29F) expect(ukMessages, key).toHaveProperty(key);
    for (const key of ADDED_29F_PLURALS) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_29F.filter((key) => !(key in dict)), lang).toEqual([]);
    // Форми множини — лише в мовах, що їх мають.
    expect(pl).toHaveProperty('summaryMemories_few');
    expect(ar).toHaveProperty('summaryMemories_zero');
  });

  it('29f help page is in every language', () => {
    const pages: Record<string, Record<string, string>> = { en: enHelp, pl: plHelp, de: deHelp, es: esHelp, it: itHelp, ar: arHelp };
    for (const [lang, dict] of Object.entries(pages)) {
      for (const suffix of ['title', 'what', 'how.0', 'how.2', 'points.0', 'tip.0', 'limits.0', 'limits.1']) expect(dict, lang).toHaveProperty('question.memory.' + suffix);
    }
  });

  it('29e keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_29E) expect(ukMessages, key).toHaveProperty(key);
    for (const key of ADDED_29E_PLURALS) expect(ukMessages, key).toHaveProperty(key);
    for (const key of ADDED_29H) expect(ukMessages, key).toHaveProperty(key);
    for (const key of [...ADDED_29G, ...ADDED_29G_PLURALS]) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_29E.filter((key) => !(key in dict)), lang).toEqual([]);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_29H.filter((key) => !(key in dict)), lang).toEqual([]);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_29G.filter((key) => !(key in dict) && !(key.endsWith('_one') && `${key.slice(0, -4)}_other` in dict)), lang).toEqual([]);
    expect(pl).toHaveProperty('questLeft_few');
    expect(ar).toHaveProperty('questLeft_zero');
    // Форми множини — лише в мовах, що їх мають.
    expect(pl).toHaveProperty('summaryMelodies_few');
    expect(ar).toHaveProperty('summaryMelodies_zero');
  });

  it('29g help page is in every language', () => {
    const pages: Record<string, Record<string, string>> = { en: enHelp, pl: plHelp, de: deHelp, es: esHelp, it: itHelp, ar: arHelp };
    for (const [lang, dict] of Object.entries(pages)) {
      for (const suffix of ['title', 'what', 'how.0', 'how.3', 'points.0', 'points.2', 'tip.0', 'tip.1', 'limits.0', 'limits.2']) expect(dict, lang).toHaveProperty('round.quest.' + suffix);
    }
  });

  it('29e help page is in every language', () => {
    const pages: Record<string, Record<string, string>> = { en: enHelp, pl: plHelp, de: deHelp, es: esHelp, it: itHelp, ar: arHelp };
    for (const [lang, dict] of Object.entries(pages)) {
      for (const suffix of ['title', 'what', 'how.0', 'how.2', 'points.0', 'points.1', 'tip.0', 'tip.1', 'limits.0', 'limits.1', 'limits.2']) expect(dict, lang).toHaveProperty('question.melody.' + suffix);
    }
  });

  it('29d help page is in every language', () => {
    const pages: Record<string, Record<string, string>> = { en: enHelp, pl: plHelp, de: deHelp, es: esHelp, it: itHelp, ar: arHelp };
    for (const [lang, dict] of Object.entries(pages)) {
      for (const suffix of ['title', 'what', 'how.0', 'how.3', 'points.0', 'tip.0', 'limits.0', 'limits.1']) expect(dict, lang).toHaveProperty('question.spotdiff.' + suffix);
    }
  });

  it('think keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of [...ADDED_THINK, ...ADDED_THINK_51]) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect([...ADDED_THINK, ...ADDED_THINK_51].filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('videoclip keys are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of [...ADDED_VIDEOCLIP, ...ADDED_VIDEOCLIP_PLURALS]) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_VIDEOCLIP.filter((key) => !(key in dict)), lang).toEqual([]);
    expect(pl).toHaveProperty('summaryVideoclips_few');
    expect(ar).toHaveProperty('summaryVideoclips_zero');
  });

  it('37 keys (more-or-less step, no overshoot, thinkalike) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const list of [ADDED_MORELESS_STEP, ADDED_OVERSHOOT, ADDED_THINKALIKE, ADDED_THINKALIKE_PLURALS]) {
      for (const key of list) expect(ukMessages, key).toHaveProperty(key);
    }
    for (const [lang, dict] of Object.entries(locales)) {
      expect([...ADDED_MORELESS_STEP, ...ADDED_OVERSHOOT, ...ADDED_THINKALIKE].filter((key) => !(key in dict)), lang).toEqual([]);
    }
    expect(pl).toHaveProperty('summaryAlikes_few');
    expect(ar).toHaveProperty('summaryAlikes_zero');
  });

  it('videoclip help page is in every language', () => {
    const pages: Record<string, Record<string, string>> = { en: enHelp, pl: plHelp, de: deHelp, es: esHelp, it: itHelp, ar: arHelp };
    for (const [lang, dict] of Object.entries(pages)) {
      for (const suffix of ['title', 'what', 'how.0', 'how.2', 'points.0', 'points.1', 'tip.0', 'tip.2', 'limits.0', 'limits.2']) expect(dict, lang).toHaveProperty('question.videoclip.' + suffix);
    }
  });

  it('38 keys (spy) are in every language with the right plural forms', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const list of [ADDED_SPY, ADDED_SPY_50, ADDED_SPY_PLURALS]) {
      for (const key of list) expect(ukMessages, key).toHaveProperty(key);
    }
    for (const [lang, dict] of Object.entries(locales)) {
      expect([...ADDED_SPY, ...ADDED_SPY_50].filter((key) => !(key in dict)), lang).toEqual([]);
      expect(dict, lang).toHaveProperty('spyVotes_other');
      expect(dict, lang).toHaveProperty('summarySpies_other');
    }
    expect(pl).toHaveProperty('spyVotes_few');
    expect(es).toHaveProperty('summarySpies_many');
    expect(ar).toHaveProperty('spyVotes_zero');
    expect(ar).toHaveProperty('summarySpies_two');
  });

  it('48 keys (wordle) are in every language with the right plural forms', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const list of [ADDED_WORDLE, ADDED_WORDLE_PLURALS]) {
      for (const key of list) expect(ukMessages, key).toHaveProperty(key);
    }
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_WORDLE.filter((key) => !(key in dict)), lang).toEqual([]);
      for (const base of ['summaryWordles', 'wordleTries', 'wordleSolvedIn']) expect(dict, lang).toHaveProperty(base + '_other');
      // The colour states are words too: a player who cannot tell the colours reads them.
      for (const key of ['wordleHit', 'wordleNear', 'wordleMiss']) expect(dict[key], lang + ' ' + key).toBeTruthy();
      expect(new Set([dict.wordleHit, dict.wordleNear, dict.wordleMiss]).size, lang).toBe(3);
    }
    expect(pl).toHaveProperty('wordleTries_few');
    expect(es).toHaveProperty('wordleTries_many');
    expect(ar).toHaveProperty('wordleSolvedIn_two');
    expect(ar).toHaveProperty('summaryWordles_zero');
  });

  it('49 keys (xp moment, rarity, rewards map, recent form) are in every language with the right plural forms', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const list of [ADDED_LEVELS_49, ADDED_LEVELS_49_PLURALS]) {
      for (const key of list) expect(ukMessages, key).toHaveProperty(key);
    }
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_LEVELS_49.filter((key) => !(key in dict)), lang).toEqual([]);
      for (const base of ['xpLineCorrect', 'formWins', 'formTop3']) expect(dict, lang).toHaveProperty(base + '_other');
    }
    expect(pl).toHaveProperty('formWins_few');
    expect(pl).toHaveProperty('xpLineCorrect_many');
    expect(es).toHaveProperty('formTop3_many');
    expect(it_).toHaveProperty('xpLineCorrect_many');
    expect(ar).toHaveProperty('formWins_two');
    expect(ar).toHaveProperty('xpLineCorrect_zero');
  });

  it('53 keys (live games, charts, health, announcement, home) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    // The guard itself must see placeholders, or every comparison below passes vacuously.
    expect(vars('{b} and {a}')).toEqual(['a', 'b']);
    for (const key of ADDED_ADMIN_HOME_53) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_ADMIN_HOME_53.filter((key) => !(key in dict)), lang).toEqual([]);
      for (const key of ADDED_ADMIN_HOME_53) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars((ukMessages as Record<string, string>)[key]!));
      }
    }
  });

  it('54 keys (the bot tab) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(vars('{b} and {a}')).toEqual(['a', 'b']);
    for (const list of [ADDED_BOT_54, ADDED_BOT_54_PLURALS]) {
      for (const key of list) expect(ukMessages, key).toHaveProperty(key);
    }
    const plain = ADDED_BOT_54.filter((key) => !key.endsWith('_one'));
    for (const [lang, dict] of Object.entries(locales)) {
      expect(plain.filter((key) => !(key in dict)), lang).toEqual([]);
      for (const key of plain) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars((ukMessages as Record<string, string>)[key]!));
      }
      expect(dict, lang).toHaveProperty('adminBotRounds_one');
    }
    for (const lang of ['en', 'de', 'es', 'it', 'ar']) expect(locales[lang], lang).toHaveProperty('adminBotRounds_other');
    expect(pl).toHaveProperty('adminBotRounds_few');
    expect(pl).toHaveProperty('adminBotRounds_many');
    expect(es).toHaveProperty('adminBotRounds_many');
    expect(it_).toHaveProperty('adminBotRounds_many');
    expect(ar).toHaveProperty('adminBotRounds_two');
    expect(ar).toHaveProperty('adminBotRounds_zero');
    for (const [lang, dict] of Object.entries(locales)) expect(dict.adminBotQuizzesEmpty, lang).toContain('seed:demo --bot');
  });

  it('62 keys (bot room controls) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(vars('{b} and {a}')).toEqual(['a', 'b']);
    for (const key of ADDED_BOT_ROOM_62) expect(ukMessages, key).toHaveProperty(key);
    expect(ukMessages.adminBotTime).toBe('+{seconds} с');
    expect(ukMessages.adminLog_bot_room_lobby).toBe('{admin} змінив(-ла) лобі гри бота (код {code}): {listed}, {locked}');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_BOT_ROOM_62.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_BOT_ROOM_62) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars((ukMessages as Record<string, string>)[key]!));
      }
      expect(dict.adminBotTime, lang).toContain('{seconds}');
      expect(dict.adminLog_bot_room_time, lang).toContain('{seconds}');
    }
  });

  it('55 sticky timer key is in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    expect(ukMessages.timerLeft).toBe('{seconds} с');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_STICKY_TIMER_55.filter((key) => !(key in dict)), lang).toEqual([]);
      expect(dict.timerLeft, lang).toContain('{seconds}');
    }
  });

  it('60 small-fix keys are in every language and not empty', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_SMALL_FIXES_60) {
      expect((ukMessages as Record<string, string>)[key], key).not.toBe('');
      for (const [lang, dict] of Object.entries(locales)) expect(dict[key], lang + ' ' + key).toEqual(expect.stringMatching(/\S/));
    }
  });

  it('61 wordle keys are in every language with their placeholders', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const dict of [ukMessages as Record<string, string>, ...Object.values(locales)]) {
      expect(dict.wordleHeadline).toContain('{count}');
      expect(dict.wordlePlayed).toContain('{word}');
    }
    for (const [lang, dict] of Object.entries(locales)) for (const key of ADDED_WORDLE_61) expect(dict[key], lang + ' ' + key).toEqual(expect.stringMatching(/\S/));
  });

  it('«solved on try N» reads correctly for every try 1…6 in every language', () => {
    const tries = [1, 2, 3, 4, 5, 6];
    const solved = (dict: Record<string, string>) => {
      activateLocaleForTests(dict === ukMessages ? 'uk' : 'en', dict === ukMessages ? undefined : { ui: dict });
      return tries.map((n) => t('wordleSolved', { tries: n }));
    };
    try {
      // Порядковий номер, а не кількість: «з 1-ї спроби», «on try 1», «im 1. Versuch» — без відмінків числа.
      expect(solved(ukMessages)).toEqual(tries.map((n) => `Вгадано з ${n}-ї спроби!`));
      expect(solved(en)).toEqual(tries.map((n) => `Solved on try ${n}!`));
      expect(solved(de)).toEqual(tries.map((n) => `Im ${n}. Versuch erraten!`));
      expect(solved(es)).toEqual(tries.map((n) => `¡Acertada en el intento ${n}!`));
      expect(solved(it_)).toEqual(tries.map((n) => `Indovinata al tentativo ${n}!`));
      expect(solved(pl)).toEqual(tries.map((n) => `Odgadnięte za ${n}. razem!`));
      expect(solved(ar)).toEqual(tries.map((n) => `خمّنتها في المحاولة رقم ${n}!`));
    } finally {
      activateLocaleForTests('uk');
    }
  });

  it('wordle help page is in every language', () => {
    const pages: Record<string, Record<string, string>> = { en: enHelp, pl: plHelp, de: deHelp, es: esHelp, it: itHelp, ar: arHelp };
    for (const [lang, dict] of Object.entries(pages)) {
      for (const suffix of ['title', 'what', 'how.0', 'how.1', 'how.2', 'points.0', 'points.1', 'tip.0', 'limits.0']) expect(dict, lang).toHaveProperty('question.wordle.' + suffix);
    }
  });

  it('43 keys (question bank) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_QUESTION_BANK) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_QUESTION_BANK.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('45 keys (family league: lobby and game lines) are in every language with the right plural forms', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const list of [ADDED_LEAGUE, ADDED_LEAGUE_PLURALS]) {
      for (const key of list) expect(ukMessages, key).toHaveProperty(key);
    }
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_LEAGUE.filter((key) => !(key in dict)), lang).toEqual([]);
      expect(dict, lang).toHaveProperty('leagueGained_one');
      expect(dict, lang).toHaveProperty('leagueGained_other');
    }
  });

  it('47 keys (library) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of [...ADDED_LIBRARY, ...ADDED_LIBRARY_PLURALS]) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_LIBRARY.filter((key) => !(key in dict)), lang).toEqual([]);
      for (const base of ['libraryQuestions', 'libraryPlays']) {
        expect(dict, lang).toHaveProperty(`${base}_one`);
        expect(dict, lang).toHaveProperty(`${base}_other`);
      }
    }
  });

  it('44 keys (challenge a friend) are in every language with the right plural forms', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const list of [ADDED_CHALLENGE, ADDED_CHALLENGE_PLURALS]) {
      for (const key of list) expect(ukMessages, key).toHaveProperty(key);
    }
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_CHALLENGE.filter((key) => !(key in dict)), lang).toEqual([]);
      for (const base of ['challengeDaysLeft', 'challengePlayed', 'challengeSkipQuestions']) {
        expect(dict, lang).toHaveProperty(`${base}_one`);
        expect(dict, lang).toHaveProperty(`${base}_other`);
      }
    }
  });

  it('42 keys (import and export) are in every language with the right plural forms', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const list of [ADDED_IMPORT_EXPORT, ADDED_IMPORT_EXPORT_PLURALS]) {
      for (const key of list) expect(ukMessages, key).toHaveProperty(key);
    }
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_IMPORT_EXPORT.filter((key) => !(key in dict)), lang).toEqual([]);
      expect(dict, lang).toHaveProperty('ioSkipped_one');
      expect(dict, lang).toHaveProperty('ioSkipped_other');
    }
    expect(pl).toHaveProperty('ioSkipped_few');
    expect(es).toHaveProperty('ioSkipped_many');
    expect(ar).toHaveProperty('ioSkipped_zero');
  });

  it('41 keys (result image) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_RESULT_IMAGE) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_RESULT_IMAGE.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('40 keys (stage sounds) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_STAGE_SOUNDS) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_STAGE_SOUNDS.filter((key) => !(key in dict)), lang).toEqual([]);
  });

  it('39 keys (duel bets) are in every language with the right plural forms', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const list of [ADDED_DUEL_BETS, ADDED_DUEL_BETS_PLURALS]) {
      for (const key of list) expect(ukMessages, key).toHaveProperty(key);
    }
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_DUEL_BETS.filter((key) => !(key in dict)), lang).toEqual([]);
      expect(dict, lang).toHaveProperty('duelBetsCount_one');
      expect(dict, lang).toHaveProperty('duelBetsCount_other');
    }
    expect(pl).toHaveProperty('duelBetsCount_few');
    expect(es).toHaveProperty('duelBetsCount_many');
    expect(it_).toHaveProperty('duelBetsCount_many');
    for (const form of ['zero', 'two', 'few', 'many']) expect(ar).toHaveProperty('duelBetsCount_' + form);
  });

  it('duel bet help lines are in every language', () => {
    const pages: Record<string, Record<string, string>> = { en: enHelp, pl: plHelp, de: deHelp, es: esHelp, it: itHelp, ar: arHelp };
    for (const [lang, dict] of Object.entries(pages)) {
      for (const key of ['setting.duels.how.3', 'setting.duels.points.1', 'setting.duels.limits.4', 'setting.duels.limits.5']) expect(dict, lang).toHaveProperty(key);
      expect(dict['setting.duels.points.1'], lang).toContain('{defaultDuelBetStake}');
    }
  });

  it('spy help page is in every language', () => {
    const pages: Record<string, Record<string, string>> = { en: enHelp, pl: plHelp, de: deHelp, es: esHelp, it: itHelp, ar: arHelp };
    for (const [lang, dict] of Object.entries(pages)) {
      for (const suffix of ['title', 'what', 'how.0', 'how.3', 'points.0', 'points.2', 'tip.0', 'tip.1', 'limits.0', 'limits.1']) expect(dict, lang).toHaveProperty('question.spy.' + suffix);
    }
  });

  it('thinkalike help page and the step and overshoot help lines are in every language', () => {
    const pages: Record<string, Record<string, string>> = { en: enHelp, pl: plHelp, de: deHelp, es: esHelp, it: itHelp, ar: arHelp };
    for (const [lang, dict] of Object.entries(pages)) {
      for (const suffix of ['title', 'what', 'how.0', 'how.2', 'points.0', 'points.1', 'tip.0', 'tip.1', 'limits.0', 'limits.1']) expect(dict, lang).toHaveProperty('question.thinkalike.' + suffix);
      expect(dict, lang).toHaveProperty('question.numeric.points.4');
      expect(dict, lang).toHaveProperty('question.moreless.tip.1');
    }
  });

  it('think help pages are in every language', () => {
    const pages: Record<string, Record<string, string>> = { en: enHelp, pl: plHelp, de: deHelp, es: esHelp, it: itHelp, ar: arHelp };
    for (const [lang, dict] of Object.entries(pages)) {
      for (const suffix of ['title', 'what', 'how.0', 'how.4', 'points.0', 'points.1', 'tip.0', 'limits.0', 'limits.2']) expect(dict, lang).toHaveProperty('round.think.' + suffix);
      for (const suffix of ['title', 'what', 'how.0', 'how.1', 'points.0', 'tip.0', 'limits.0']) expect(dict, lang).toHaveProperty('question.think.' + suffix);
    }
  });

  it('has the admin menu item in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const key of ADDED_MENU_ADMIN) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) expect(ADDED_MENU_ADMIN.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
  });

  it('58 keys (the player card) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of ADDED_PLAYER_CARD_58) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_PLAYER_CARD_58.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_PLAYER_CARD_58) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars((ukMessages as Record<string, string>)[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe((ukMessages as Record<string, string>)[key]);
      }
    }
  });

  it('59 keys (push broadcast) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const list of [ADDED_BROADCAST_59, ADDED_BROADCAST_59_PLURALS]) {
      for (const key of list) expect(ukMessages, key).toHaveProperty(key);
    }
    expect(ukMessages.adminBroadcastConfirm).toBe('Надіслати «{title}»? {people}.');
    expect(ukMessages.adminLog_push_broadcast).toBe('{admin} надіслав(-ла) розсилку «{title}», адресатів: {count}');
    const uk = ukMessages as Record<string, string>;
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_BROADCAST_59.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      // Однина (як ar «شخص واحد») може обійтися без числа; решта — ті самі змінні, що в uk.
      for (const key of ADDED_BROADCAST_59.filter((key) => !key.endsWith('_one'))) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
      for (const [key, text] of Object.entries(dict).filter(([key]) => key.startsWith('adminBroadcastPeople_'))) expect(vars(text).filter((name) => name !== 'count'), lang + ' ' + key).toEqual([]);
    }
    for (const lang of ['en', 'de', 'es', 'it', 'ar']) expect(locales[lang], lang).toHaveProperty('adminBroadcastPeople_other');
    expect(pl).toHaveProperty('adminBroadcastPeople_few');
    expect(pl).toHaveProperty('adminBroadcastPeople_many');
    expect(ar).toHaveProperty('adminBroadcastPeople_two');
    expect(ar).toHaveProperty('adminBroadcastPeople_zero');
  });

  it('63 keys (moderation) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const list of [ADDED_MODERATION_63, ADDED_MODERATION_63_PLURALS]) {
      for (const key of list) expect(ukMessages, key).toHaveProperty(key);
    }
    expect(ukMessages.adminLog_feed_hide).toBe('{admin} сховав(-ла) подію стрічки {target}: {text}');
    expect(ukMessages.adminLog_group_hide).toBe('{admin} сховав(-ла) групу «{title}» ({target})');
    expect(ukMessages.adminLog_group_owner_transfer).toBe('{admin} передав(-ла) групу «{title}» від {text} до {target}');
    const uk = ukMessages as Record<string, string>;
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_MODERATION_63.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      // Однина (як ar «شخص واحد») може обійтися без числа; решта — ті самі змінні, що в uk.
      for (const key of ADDED_MODERATION_63.filter((key) => !key.endsWith('_one'))) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
      for (const [key, text] of Object.entries(dict).filter(([key]) => key.startsWith('adminGroupMembers_'))) expect(vars(text).filter((name) => name !== 'count'), lang + ' ' + key).toEqual([]);
    }
    for (const lang of ['en', 'de', 'es', 'it', 'ar']) expect(locales[lang], lang).toHaveProperty('adminGroupMembers_other');
    expect(pl).toHaveProperty('adminGroupMembers_few');
    expect(pl).toHaveProperty('adminGroupMembers_many');
    expect(ar).toHaveProperty('adminGroupMembers_two');
    expect(ar).toHaveProperty('adminGroupMembers_zero');
  });

  it('56 keys (the bot schedule) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of ADDED_BOT_SCHEDULE_56) expect(ukMessages, key).toHaveProperty(key);
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_BOT_SCHEDULE_56.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_BOT_SCHEDULE_56) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars((ukMessages as Record<string, string>)[key]!));
      }
    }
  });

  it('57 keys (quiz preview and check) are in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(vars('{b} and {a}')).toEqual(['a', 'b']);
    for (const key of ADDED_QUIZ_CHECK_57) expect(ukMessages, key).toHaveProperty(key);
    expect(ukMessages.adminLog_quiz_view).toBe('{admin} переглянув(-ла) вікторину «{title}» ({target})');
    expect(ukMessages.adminCheckSummary).toBe('Помилок: {errors} · попереджень: {warnings}');
    expect(ukMessages.adminCheck_short_timer).toBe('Таймер {detail} с — менше 25 с');
    expect(ukMessages.adminPreviewPoints).toBe('Бали: {points} · Таймер: {seconds} с');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_QUIZ_CHECK_57.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_QUIZ_CHECK_57) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars((ukMessages as Record<string, string>)[key]!));
      }
    }
  });

  it('64 keys (errors, problems, backups) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_ERRORS_64) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.problemChars).toBe('{used} з {max}');
    expect(uk.problemReplyFrom).toBe('Відповідь адміністратора: {text}');
    expect(uk.adminTabErrorsBadge).toBe('Збої, нових: {count}');
    expect(uk.adminErrorCounts).toBe('Повторів: {count}, за добу: {day}');
    expect(uk.adminBackupsNextAt).toBe('Наступну копію можна о {time}.');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_ERRORS_64.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_ERRORS_64) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('65 keys (the game replay) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    // Без зворотних скісних рисок у літералі: попередній /{(w+)}/g їх утратив і нічого не перевіряв.
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    // Перевірка сама себе: змінні справді знаходяться.
    expect(vars('{time} — {name} ({score})')).toEqual(['name', 'score', 'time']);
    for (const key of ADDED_REPLAY_65) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.adminReplayStep).toBe('Запитання {n} з {total}');
    expect(uk.adminReplayPriceMark).toBe('Ціна: {points} ×{mark}');
    expect(uk.adminReplayEventLeave).toBe('{time} — вилучено {name} (рахунок {score})');
    expect(uk.adminLog_game_replay_view).toBe('{admin} переглянув(-ла) повтор гри «{title}» ({target})');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_REPLAY_65.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_REPLAY_65) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        // Рядки без слів (риска «—» рішення, «{name}: {points} — {source}») однакові в усіх мовах.
        if (/\p{L}/u.test(uk[key]!.replace(/\{\w+\}/g, ''))) expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('66 keys (merging two accounts) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    // Перевірка сама себе: змінні справді знаходяться.
    expect(vars('{admin} {text}: {summary}')).toEqual(['admin', 'summary', 'text']);
    for (const key of ADDED_MERGE_66) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.adminMergePrimary).toBe('Головним лишається: {nickname}');
    expect(uk.adminMergeTotal).toBe('Разом: рівень {level}, досвід {xp}');
    expect(uk.adminLog_account_merge).toBe("{admin} об'єднав(-ла) акаунт {text} з акаунтом {target}: {summary}");
    expect(uk.err_email_merged).toBe('Ця адреса вже приєднана до іншого акаунта — увійди з нею й паролем');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_MERGE_66.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_MERGE_66) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        // «Google» — назва, однакова в усіх мовах.
        if (key !== 'adminMergeLoginGoogle') expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('71 keys (stats charts, health, metrics) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_71) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.chartExpand).toBe('Розгорнути «{title}»');
    expect(uk.adminKpiStickiness).toBe('Залученість (день / 30 днів)');
    expect(uk.adminHealthLagValue).toBe('типово {p50} мс; 99 % — до {p99} мс; макс. {max} мс');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_71.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_71) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        // «Node.js» — назва, однакова в усіх мовах; рядки без літер (лише змінні й знаки) можуть збігатися.
        if (key !== 'adminHealthNode' && /\p{L}/u.test(uk[key]!.replace(placeholder, ''))) expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('74 keys (editor layout) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_74) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.issuesButton).toBe('⚠ Помилок: {errors} · нагадувань: {reminders}');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_74.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_74) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        // Рядки без літер (лише змінні й знаки) можуть збігатися з uk.
        if (/\p{L}/u.test(uk[key]!.replace(placeholder, ''))) expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('75 keys (skip the guide vote) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_75) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.guideSkipCount).toBe('Хочуть пропустити: {votes} з {of}');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_75.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_75) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('76 keys (navigation foundation) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_76) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.backTo).toBe('Назад: {page}');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_76.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of [...ADDED_76, 'historyEmpty', 'myGamesEmpty']) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('77 keys (navigation stage 2) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_77) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.menuJoin).toBe('Головна');
    expect(uk.menuQuizzes).toBe('Вікторини');
    expect(uk.startCreate).toBe('Провести гру');
    expect(uk.play).toBe('Провести');
    expect(uk.edit).toBe('Змінити');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_77.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of [...ADDED_77, ...CHANGED_77]) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('78 keys (navigation stage 3, home) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_78) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.welcomeTitle).toBe('З чого почати');
    expect(uk.homeGuestSignIn).toBe('Увійти, щоб проводити свої ігри');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_78.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_78) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('79 keys (navigation stage 4, profile, history, groups) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_79) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.profileBlockPeople).toBe('Люди');
    expect(uk.challengesTitle).toBe('Мої виклики');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_79.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_79) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('80 keys (navigation stage 5, help and newcomers) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_80) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.playHelpTitle).toBe('Як грати');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_80.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_80) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('explanation keys are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_EXPLANATION) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.explanationTitle).toBe('Пояснення');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_EXPLANATION.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_EXPLANATION) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('73 keys (quiz folders, dates and sorting) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    // Чип категорії — лише назва й число, тож у всіх мовах він однаковий.
    const SAME_IN_EVERY_LANGUAGE = ['quizFolderChip'];
    for (const key of ADDED_73) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.quizFolderDeleteConfirm).toBe('Видалити категорію «{name}»? Вікторини з неї не зникнуть — вони стануть «Без категорії».');
    expect(uk.quizCreatedChanged).toBe('Створено {created} · змінено {changed}');
    expect(uk.quizSort_changed).toBe('Нещодавно змінені');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_73.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_73) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        if (SAME_IN_EVERY_LANGUAGE.includes(key)) expect(dict[key], lang + ' ' + key).toBe(uk[key]);
        else expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('72 keys (adding to groups from the admin) are in every locale', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_72) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.adminLog_group_member_add).toBe('{admin} додав(-ла) {target} до групи «{title}»');
    expect(uk.adminLog_group_item_add).toBe('{admin} додав(-ла) запис «{text}» у групу «{title}» від Квіз-бота ({target})');
    expect(uk.err_member_too_many_groups).toBe('Людина вже в {limit} групах — це межа.');
    expect(errorText('member_too_many_groups')).toBe(`Людина вже в ${GROUP_LIMITS.groupsPerUser} групах — це межа.`);
    expect(uk.inboxGroupAdded).toBe('Тебе додали до групи «{title}»');
    // Сповіщення людини — завжди у «Вхідних»; пуш — лише додатково.
    expect(uk.adminGroupAddedNoPush).toContain('«Вхідних»');
    expect(uk.adminGroupAddedNoPush).not.toContain('Моїх групах');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_72.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_72) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('70 appeals and inbox keys are in every dictionary with the same variables', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_70) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.adminTabAppealsBadge).toBe('Звернення, нових: {count}');
    expect(uk.menuInboxBadge).toBe('Вхідні, непрочитаних: {count}');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_70.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_70) expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
    }
  });

  it('68 bot host keys are in every dictionary with the same variables', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_BOT_HOST_68) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.botHostTakeOver).toBe('Взяти керування');
    expect(uk.botHostGiveBack).toBe('Віддати боту');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_BOT_HOST_68.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_BOT_HOST_68) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('69 admin users keys are in every dictionary with the same variables', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    const placeholder = new RegExp('[{]([A-Za-z0-9_]+)[}]', 'g');
    const vars = (text: string) => [...text.matchAll(placeholder)].map((m) => m[1]).sort();
    const uk = ukMessages as Record<string, string>;
    for (const key of ADDED_USERS_69) expect(uk[key]?.trim(), key).toBeTruthy();
    expect(uk.adminCardRevokePicked).toBe('Відібрати вибрані');
    for (const [lang, dict] of Object.entries(locales)) {
      expect(ADDED_USERS_69.filter((key) => !dict[key]?.trim()), lang).toEqual([]);
      for (const key of ADDED_USERS_69) {
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars(uk[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe(uk[key]);
      }
    }
  });

  it('64 push keys (problem reply) are in every push dictionary', () => {
    const push: Record<string, Record<string, string>> = { en: pushEn, pl: pushPl, de: pushDe, es: pushEs, it: pushIt, ar: pushAr };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of ADDED_ERRORS_64_SW) {
      expect(pushStrings, key).toHaveProperty(key);
      for (const [lang, dict] of Object.entries(push)) {
        expect(dict[key]?.trim(), lang + ' ' + key).toBeTruthy();
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars((pushStrings as Record<string, string>)[key]!));
      }
    }
  });

  it('72 push keys (added to a group) are in every push dictionary', () => {
    const push: Record<string, Record<string, string>> = { en: pushEn, pl: pushPl, de: pushDe, es: pushEs, it: pushIt, ar: pushAr };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of ADDED_72_SW) {
      expect(pushStrings, key).toHaveProperty(key);
      for (const [lang, dict] of Object.entries(push)) {
        expect(dict[key]?.trim(), lang + ' ' + key).toBeTruthy();
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars((pushStrings as Record<string, string>)[key]!));
        expect(dict[key], lang + ' ' + key).not.toBe((pushStrings as Record<string, string>)[key]);
      }
    }
  });

  it('56 push keys (the bot schedule) are in every push dictionary', () => {
    const push: Record<string, Record<string, string>> = { en: pushEn, pl: pushPl, de: pushDe, es: pushEs, it: pushIt, ar: pushAr };
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of ADDED_BOT_SCHEDULE_56_SW) {
      expect(pushStrings, key).toHaveProperty(key);
      for (const [lang, dict] of Object.entries(push)) {
        expect(dict[key]?.trim(), lang + ' ' + key).toBeTruthy();
        expect(vars(dict[key]!), lang + ' ' + key).toEqual(vars((pushStrings as Record<string, string>)[key]!));
      }
    }
  });

  it('adds no uk keys beyond the agreed list', () => {
    const fresh = Object.keys(ukMessages).filter((key) => !(key in golden));
    expect(fresh.filter((key) => !ADDED.includes(key) && !ADDED_BOT_ADJUST.includes(key) && !ADDED_LATER.includes(key) && !ADDED_23A.includes(key) && !ADDED_24A.includes(key) && !ADDED_24B.includes(key) && !ADDED_24C.includes(key) && !ADDED_24D.includes(key) && !ADDED_GRAIL.includes(key) && !ADDED_25C.includes(key) && !ADDED_25D.includes(key) && !ADDED_25E.includes(key) && !ADDED_26A.includes(key) && !ADDED_26B.includes(key) && !ADDED_26C.includes(key) && !ADDED_27A.includes(key) && !ADDED_27B.includes(key) && !ADDED_27C.includes(key) && !ADDED_27D.includes(key) && !ADDED_28A.includes(key) && !ADDED_28B.includes(key) && !ADDED_28C.includes(key) && !ADDED_28D.includes(key) && !ADDED_28D_PLURALS.includes(key) && !ADDED_29C.includes(key) && !ADDED_29C_PLURALS.includes(key) && !ADDED_29D.includes(key) && !ADDED_29D_PLURALS.includes(key) && !ADDED_29F.includes(key) && !ADDED_29F_PLURALS.includes(key) && !ADDED_29E.includes(key) && !ADDED_29E_PLURALS.includes(key) && !ADDED_29I.includes(key) && !ADDED_29H.includes(key) && !ADDED_29G.includes(key) && !ADDED_29G_PLURALS.includes(key) && !ADDED_30A.includes(key) && !ADDED_12J.includes(key) && !ADDED_12K.includes(key) && !ADDED_12K_PLURALS.includes(key) && !ADDED_12L.includes(key) && !ADDED_31.includes(key) && !ADDED_32.includes(key) && !ADDED_33.includes(key) && !ADDED_34.includes(key) && !ADDED_35.includes(key) && !ADDED_THEME.includes(key) && !ADDED_BOT_SCHEDULE_56.includes(key) && !ADDED_QUIZ_CHECK_57.includes(key) && !ADDED_BOT_SCHEDULE_56_SW.includes(key) && !ADDED_MEMORY_PEEK.includes(key) && !ADDED_TRUTH_RECAP.includes(key) && !ADDED_TRUTH_TEAM.includes(key) && !ADDED_THINK.includes(key) && !ADDED_THINK_51.includes(key) && !ADDED_VIDEOCLIP.includes(key) && !ADDED_VIDEOCLIP_PLURALS.includes(key) && !ADDED_MORELESS_STEP.includes(key) && !ADDED_OVERSHOOT.includes(key) && !ADDED_THINKALIKE.includes(key) && !ADDED_THINKALIKE_PLURALS.includes(key) && !ADDED_SPY.includes(key) && !ADDED_SPY_50.includes(key) && !ADDED_TRUTH_52.includes(key) && !ADDED_SPY_PLURALS.includes(key) && !ADDED_DUEL_BETS.includes(key) && !ADDED_DUEL_BETS_PLURALS.includes(key) && !ADDED_STAGE_SOUNDS.includes(key) && !ADDED_RESULT_IMAGE.includes(key) && !ADDED_IMPORT_EXPORT.includes(key) && !ADDED_IMPORT_EXPORT_PLURALS.includes(key) && !ADDED_QUESTION_BANK.includes(key) && !ADDED_CHALLENGE.includes(key) && !ADDED_CHALLENGE_PLURALS.includes(key) && !ADDED_LEAGUE.includes(key) && !ADDED_LEAGUE_PLURALS.includes(key) && !ADDED_LIBRARY.includes(key) && !ADDED_LIBRARY_PLURALS.includes(key) && !ADDED_WORDLE.includes(key) && !ADDED_WORDLE_PLURALS.includes(key) && !ADDED_LEVELS_49.includes(key) && !ADDED_LEVELS_49_PLURALS.includes(key) && !ADDED_ADMIN_HOME_53.includes(key) && !ADDED_STICKY_TIMER_55.includes(key) && !ADDED_SMALL_FIXES_60.includes(key) && !ADDED_WORDLE_61.includes(key) && !ADDED_BOT_54.includes(key) && !ADDED_BOT_54_PLURALS.includes(key) && !ADDED_MENU_ADMIN.includes(key) && !ADDED_PLAYER_CARD_58.includes(key) && !ADDED_BOT_ROOM_62.includes(key) && !ADDED_BROADCAST_59.includes(key) && !ADDED_BROADCAST_59_PLURALS.includes(key) && !ADDED_ERRORS_64_SW.includes(key) && !ADDED_72_SW.includes(key) && !ADDED_ERRORS_64.includes(key) && !ADDED_REPLAY_65.includes(key) && !ADDED_MERGE_66.includes(key) && !ADDED_USERS_69.includes(key) && !ADDED_70.includes(key) && !ADDED_72.includes(key) && !ADDED_73.includes(key) && !ADDED_74.includes(key) && !ADDED_75.includes(key) && !ADDED_76.includes(key) && !ADDED_77.includes(key) && !ADDED_78.includes(key) && !ADDED_79.includes(key) && !ADDED_80.includes(key) && !ADDED_EXPLANATION.includes(key) && !ADDED_71.includes(key) && !ADDED_BOT_HOST_68.includes(key) && !ADDED_MODERATION_63.includes(key) && !ADDED_MODERATION_63_PLURALS.includes(key))).toEqual([]);
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
