import { describe, expect, it } from 'vitest';
import { AUDIO_LIMITS, AUTOPILOT_MS, AWAY_MS, REVEAL_MIN_SHARE, clueShare, BUFF_KINDS, CELL_KINDS, DEBUFF_KINDS, LIMITS, QUESTION_TYPES, ROUND_TYPES, wallShare } from '@quiz/shared';
import { buffName } from '../buff-meta';
import { debuffName } from '../debuff-meta';
import { ROUND_NAMES } from '../guide-text';
import { t, type TextKey } from '../i18n';
import { MIRROR_SWAP_MS, freezeMs } from '../screens/Debuffs';
import { SETTING_HELP_KEYS } from './settings';
import { HELP_TOPICS, cellHelpId, helpAnchor, helpEntry, helpIds, helpTopic, searchHelp, type HelpId } from './host-help';

const SENTENCE_END = /[.!?…](?=\s|$)/g;
const filled = (id: HelpId) => {
  const e = helpEntry(id);
  expect(e.title.trim(), id).not.toBe('');
  expect(e.what.trim(), id).not.toBe('');
  expect((e.what.match(SENTENCE_END) ?? []).length, `${id}: «Що це» — одне-два речення`).toBeLessThanOrEqual(2);
  for (const list of [e.how, e.points, e.tip]) {
    expect(list.length, id).toBeGreaterThan(0);
    for (const line of list) expect(line.trim(), id).not.toBe('');
  }
  if (e.limits !== undefined) expect(e.limits.length, id).toBeGreaterThan(0);
};

const text = (id: HelpId) => {
  const e = helpEntry(id);
  return [e.title, e.what, ...e.how, ...e.points, ...e.tip, ...(e.limits ?? [])].join(' ');
};

describe('host help', () => {
  it('every round type, question type and cell kind has an entry', () => {
    for (const type of ROUND_TYPES) filled(`round.${type}`);
    for (const type of QUESTION_TYPES) filled(`question.${type}`);
    for (const kind of CELL_KINDS) filled(`cell.${kind}`);
    filled('cell.voice');
    filled('cell.marks');
  });

  it('titles match the names in the interface', () => {
    for (const type of ROUND_TYPES) expect(helpEntry(`round.${type}`).title).toBe(t(ROUND_NAMES[type]));
    for (const type of QUESTION_TYPES) expect(helpEntry(`question.${type}`).title).toBe(t(`type_${type}` as TextKey));
  });

  it('topics list their entries in the order of the shared lists; ids are unique', () => {
    expect(helpIds('rounds')).toEqual(ROUND_TYPES.map((type) => `round.${type}`));
    expect(helpIds('questions')).toEqual(QUESTION_TYPES.map((type) => `question.${type}`));
    expect(helpIds('cells')).toEqual(['cell.normal', 'cell.blitz', 'cell.voice', 'cell.marks']);
    expect(helpIds('teams')).toEqual(['team.play', 'team.host', 'team.pick', 'team.random', 'team.dice', 'team.captain', 'team.formats']);
    const all = HELP_TOPICS.flatMap(helpIds);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(helpIds(helpTopic(id))).toContain(id);
  });

  it('anchors and search by name', () => {
    expect(helpAnchor('round.board')).toBe('help-round-board');
    expect(searchHelp('')).toEqual(HELP_TOPICS.flatMap(helpIds));
    expect(searchHelp('  ПОЛЕ ')).toEqual(['round.board']);
    expect(searchHelp('клітинка')).toEqual(['cell.normal', 'cell.blitz']);
    expect(searchHelp('зззз')).toEqual([]);
  });

  it('picks the entry of a board cell', () => {
    expect(cellHelpId({ kind: 'blitz', answerMode: 'voice', mark: 'x2' })).toBe('cell.blitz');
    expect(cellHelpId({ kind: 'normal', answerMode: 'voice', mark: 'x3' })).toBe('cell.voice');
    expect(cellHelpId({ kind: 'normal', answerMode: 'phone', mark: 'x2' })).toBe('cell.marks');
    expect(cellHelpId({ kind: 'normal', answerMode: 'phone', mark: 'none' })).toBe('cell.normal');
  });

  it('every buff, debuff and listed setting has an entry', () => {
    for (const kind of BUFF_KINDS) filled(`buff.${kind}`);
    for (const kind of DEBUFF_KINDS) filled(`debuff.${kind}`);
    for (const key of SETTING_HELP_KEYS) filled(`setting.${key}`);
    expect(helpIds('buffs')).toEqual(BUFF_KINDS.map((kind) => `buff.${kind}`));
    expect(helpIds('debuffs')).toEqual(DEBUFF_KINDS.map((kind) => `debuff.${kind}`));
    expect(helpIds('settings')).toEqual(SETTING_HELP_KEYS.map((key) => `setting.${key}`));
  });

  it('host help agrees with the player texts', () => {
    for (const kind of BUFF_KINDS) expect(helpEntry(`buff.${kind}`).title).toBe(buffName(kind));
    for (const kind of DEBUFF_KINDS) expect(helpEntry(`debuff.${kind}`).title).toBe(debuffName(kind));
    // Числа, які гравці бачать у своїх текстах.
    expect(t('buffGuide_time')).toContain('30 секунд');
    expect(text('buff.time')).toContain('30 секунд');
    expect(t('buffGuide_audience')).toContain('15 с');
    expect(text('buff.audience')).toContain('15 секунд');
    expect(t('swapMine')).toContain('20 с');
    expect(text('buff.swap')).toContain('20 секунд');
    expect(text('debuff.mirror')).toContain(`${MIRROR_SWAP_MS / 1000} секунди`);
    expect(text('debuff.freeze')).toContain(`${freezeMs(null) / 1000} секунд`);
    expect(text('setting.debuffShop')).toContain(`типово ${LIMITS.defaultDebuffPrice}`);
    expect(text('setting.spares')).toContain(`до ${LIMITS.maxSpares}`);
    expect(text('setting.spares')).toContain(`до ${LIMITS.maxCategorySpares}`);
    // Де бафів немає — те саме, що в «?» гравця (buffHelpNone): бліц, бліц-клітинки, фінал, ланцюжок, сортування, дуелі.
    expect(text('round.blitz')).toContain('Бафи в бліці не діють');
    expect(text('cell.blitz')).toContain('Бафів на бліц-клітинці немає');
    expect(text('round.final')).toContain('бафів у фіналі немає');
    expect(text('question.chain')).toContain('без бафів');
    expect(text('question.sort')).toContain('без бафів');
    expect(text('setting.duels')).toContain('Бафів і дебафів у дуелі немає');
  });

  it('11b minimum-time entry follows «newcomers» and tells the minimum times', () => {
    const ids = helpIds('settings');
    expect(ids.indexOf('setting.pacing')).toBe(ids.indexOf('setting.newcomers') + 1);
    filled('setting.pacing');
    const body = text('setting.pacing');
    expect(helpEntry('setting.pacing').title).toBe('Мінімальний час перед «Далі»');
    for (const part of ['2 с', '1 с', '3 с', 'Завершити раунд', 'вилучення гравця', '«Закрити випробування» у «Вибуванні» — через 3 с', '«Почати драбину» в «Мільйонері» — через 3 с']) expect(body).toContain(part);
    expect(searchHelp('мінімальний час')).toContain('setting.pacing');
    expect(searchHelp('пауза')).not.toContain('setting.pacing');
  });

  it('11h autopilot entry follows «reveal» and tells the stage times and what the author menu does', () => {
    expect(helpIds('settings').at(-1)).toBe('setting.autopilot');
    expect(helpIds('settings').at(-2)).toBe('setting.reveal');
    filled('setting.autopilot');
    const body = text('setting.autopilot');
    for (const part of [`${AUTOPILOT_MS.reveal / 1000} с`, `${AUTOPILOT_MS.leaderboard / 1000} с`, `${AUTOPILOT_MS.resume / 1000} с`, 'Приховати', 'Провести ботом']) expect(body).toContain(part);
    expect(helpEntry('setting.autopilot').title).toBe(t('autopilotTitle'));
  });

  it('11c live answers entry follows «pacing» and the captain line tells the host sees the draft', () => {
    const ids = helpIds('settings');
    expect(ids.indexOf('setting.live')).toBe(ids.indexOf('setting.pacing') + 1);
    filled('setting.live');
    const body = text('setting.live').toLowerCase();
    for (const part of ['чекаємо', 'чекає рішення', 'вибір капітана', 'лише ви']) expect(body).toContain(part);
    for (const part of ['відкритому випробуванні «вибування»', 'на межі', 'дуелі', 'спроби кожного дуелянта', '«ва-банк»', 'ще в грі']) expect(body).toContain(part);
    expect(text('team.captain')).toContain('Відповідях наживо');
    expect(searchHelp('наживо')).toContain('setting.live');
  });

  it('12b live entry tells the toggle, live choices before «Надіслати», changes and thinking time, and honesty', () => {
    filled('setting.live');
    const body = text('setting.live');
    for (const part of ['👁 Наживо', 'запам', 'Відповіли 5 з 8', 'ще не надіслав', 'змінював 3 рази', 'думає 12 с', 'одним дотиком', 'не знають', 'без ведучого']) expect(body).toContain(part);
    expect(searchHelp('наживо')).toContain('setting.live');
  });

  it('11f scores entry follows «live» and tells who sees the per-round columns and the breakdown', () => {
    const ids = helpIds('settings');
    expect(ids.indexOf('setting.scores')).toBe(ids.indexOf('setting.live') + 1);
    filled('setting.scores');
    const body = text('setting.scores');
    for (const part of ['Р1', '+ / −', 'Чужу розбивку гравець не бачить', '+N за раунд', 'найбільший ривок']) expect(body).toContain(part);
    expect(text('setting.leaderboard')).toContain('Колонки раундів');
    expect(text('team.play')).toContain('п’єдестал');
    expect(searchHelp('за раундами')).toContain('setting.scores');
  });

  it('12d scores entry tells the reveal line, round facts, the own cards, the game awards, the history and the limits', () => {
    expect(helpEntry('setting.scores').title).toBe('Бали за раундами, «+ / −» і цікавинки');
    const body = text('setting.scores');
    for (const part of ['Правильно 4 з 7', 'Цікавинки раунду', 'Твій раунд', 'Нагороди на сцені', 'Нагороди гри', 'Твою гру', 'картки команди', 'Цікавинки балів не змінюють', 'лише куплені', 'з таймером']) expect(body).toContain(part);
    expect(helpEntry('setting.scores').limits?.length).toBeGreaterThan(0);
    expect(body.toLowerCase()).not.toMatch(/росі|срср/);
    expect(searchHelp('цікавинки')).toContain('setting.scores');
  });

  it('12e away entry follows «undo» and tells what counts, who sees what, the penalty, the undo and the honest limits', () => {
    const ids = helpIds('settings');
    expect(ids.indexOf('setting.away')).toBe(ids.indexOf('setting.undo') + 1);
    expect(ids.at(-1)).toBe('setting.autopilot');
    filled('setting.away');
    const body = text('setting.away').replace(/ /g, ' ');
    const sec = (ms: number) => `${String(ms / 1000).replace('.', ',')} с`;
    expect([AWAY_MS.mark, AWAY_MS.penalty, AWAY_MS.alarm, AWAY_MS.preGrace]).toEqual([2000, 3000, 2500, 5000]);
    for (const part of [`від ${sec(AWAY_MS.mark)} сумарно`, `від ${sec(AWAY_MS.penalty)} сумарно — 0 балів`, `зникає сам за ${sec(AWAY_MS.alarm)}`, `перші ${sec(AWAY_MS.preGrace)} не рахуються`, `на зв’язку пробув поза грою від ${sec(AWAY_MS.penalty)} сумарно`]) expect(body, part).toContain(part);
    for (const part of ['лише значок', 'не довше, ніж тривав розрив', 'менше з двох', 'режим польоту', 'непоміченим', 'Другий пристрій', 'червон', 'сирен', '↶ Бали', 'після кінця гри', 'не гасне', 'у відео-запитанні', 'YouTube', 'youtube.com', 'перезапуск', 'два виходи (2 рази)', 'поза грою', 'штраф знімає лише апеляція']) expect(body, part).toContain(part);
    expect(body).not.toMatch(/будь-хто/);
    expect(body.match(/гру не бачить/g)).toBeNull();
    expect(body).not.toMatch(/відволік|виходив/);
    expect(text('setting.undo')).toContain('(вихід із гри)');
    expect(text('setting.autopilot')).toContain('Штраф за вихід діє й без ведучого. У грі без ведучого штраф знімає лише апеляція.');
    expect(text('setting.autopilot')).toContain(`${AUTOPILOT_MS.appealWindow / 1000} с`);
    expect(searchHelp('поза грою')).toContain('setting.away');
  });

  it('12f appeal entry follows «away» and tells when, who votes, the count, the host and the limits', () => {
    const ids = helpIds('settings');
    expect(ids.indexOf('setting.appeal')).toBe(ids.indexOf('setting.away') + 1);
    expect(ids.at(-1)).toBe('setting.autopilot');
    filled('setting.appeal');
    const body = text('setting.appeal').replace(/ /g, ' ');
    for (const part of ['30 с', '2 апеляції', 'Голосує зал', 'не бачить ніхто', 'Зараховано ведучим', '(апеляція)', 'Нема кому голосувати', 'Оскаржити штраф', 'капітан', 'Нічия', 'Пауза', '↶ Бали', 'Після кінця гри']) expect(body, part).toContain(part);
    expect(body.toLowerCase()).not.toMatch(/росі|срср/);
    expect(body).not.toMatch(/(^|[^а-яіїєґ])(голосував|голосувала|оскаржив|оскаржила)/);
    expect(searchHelp('апеляція')).toContain('setting.appeal');
    expect(text('setting.undo')).toContain('(апеляція)');
    expect(text('setting.autopilot')).toContain(`${AUTOPILOT_MS.appealShown / 1000} с`);
  });

  it('12a undo entry follows «scores» and tells what is undone, what is not, «Повернути» and why the current question goes by grading', () => {
    const ids = helpIds('settings');
    expect(ids.indexOf('setting.undo')).toBe(ids.indexOf('setting.scores') + 1);
    filled('setting.undo');
    const body = text('setting.undo');
    for (const part of ['↶ Бали', 'Скасувати все', 'Скасувати раунд', 'Повернути', 'Прийняти', 'Скасовано ведучим', '«Ва-банк»', 'без ведучого', 'командній грі']) expect(body).toContain(part);
    expect(text('setting.scores')).toContain('Скасовано ведучим');
    expect(text('setting.autopilot')).toContain('скасування балів');
    expect(searchHelp('скасування')).toContain('setting.undo');
  });

  it('11d sorting help tells who watches the card, the marks and the captain watchers', () => {
    for (const part of ['куди він її тягне', 'не встиг', '✗2', 'чужої картки й руху не бачить ніхто', '«Відповідях наживо»', '«→ категорія»']) expect(text('question.sort')).toContain(part);
    expect(text('team.captain')).toContain('картку капітана');
  });

  it('10b entries tell the engine numbers', () => {
    expect(helpEntry('setting.reveal').points.join(' ')).toContain('100 %');
    expect(helpEntry('setting.reveal').points.join(' ')).toContain(`${REVEAL_MIN_SHARE * 100} %`);
    expect(helpEntry('setting.reveal').points.join(' ')).toContain('завжди лишається правильною');
    expect((helpEntry('setting.audio').limits ?? []).join(' ')).toContain(`${AUDIO_LIMITS.maxBytes / 1024 / 1024} МБ`);
    expect((helpEntry('setting.audio').limits ?? []).join(' ')).toContain(`${LIMITS.maxAudioSeconds} с`);
    expect(helpEntry('question.slider').points.join(' ')).toContain('половин');
    expect(text('buff.retry')).toContain('Не діє на картинці, що проявляється');
    expect(text('setting.speedBonus')).toContain('Не нараховується на картинці, що проявляється');
    expect(text('question.numeric')).toContain('«Повзунок»');
  });

  it('12c clues entry tells own pace, the button, the own price, 20 s and the voice cell', () => {
    filled('question.clues');
    const body = text('question.clues');
    for (const part of ['кожен сам', 'Ще підказка', 'Оля 1 · Петро 3', 'підказка 3/5', 'три — 60 %', `${LIMITS.selfCluesMinTime} с`, '«кожен сам» не діє', 'на підказці 3', 'відповідає за команду']) expect(body).toContain(part);
  });

  it('10c entries tell the engine numbers', () => {
    const percents = [1, 2, 3, 4, 5].map((k) => Math.round(clueShare(5, k) * 100));
    expect(percents).toEqual([100, 80, 60, 40, 20]);
    expect(helpEntry('question.clues').points.join(' ')).toContain('100, 80, 60, 40 і 20');
    expect(helpEntry('question.clues').how.join(' ')).toContain(`${LIMITS.minClues}–${LIMITS.maxClues}`);
    expect((helpEntry('question.clues').limits ?? []).join(' ')).toContain(`${LIMITS.clueTailSeconds} с`);
    expect(helpEntry('question.pin').points.join(' ')).toContain('половин');
    expect((helpEntry('question.pin').limits ?? []).join(' ')).toContain('50/50');
    expect(helpEntry('question.pin').tip.join(' ')).toContain('Natural Earth');
  });

  it('10i ladder entries tell the engine numbers and the isolation', () => {
    const ladder = text('round.ladder');
    expect(ladder).toContain(String(LIMITS.maxLadderLevel));
    expect(ladder).toContain(`${LIMITS.minLadderQuestions}–${LIMITS.maxLadderQuestions}`);
    expect(ladder).toContain('10 %');
    expect(ladder).toContain('неспалим');
    expect(ladder).toContain('раз за драбину');
    expect(ladder).toContain('Забрати');
    for (const kind of BUFF_KINDS) expect((helpEntry(`buff.${kind}`).limits ?? []).join(' '), kind).toContain('Мільйонері');
    for (const kind of ['fifty', 'audience', 'hint'] as const) expect(text(`buff.${kind}`), kind).toContain('підказка драбини');
    for (const key of ['debuffShop', 'duels', 'leaderboard', 'speedBonus'] as const) expect(text(`setting.${key}`), key).toContain('Мільйонері');
    expect(text('round.wipeout')).toContain('раунд «Мільйонер»');
    expect(searchHelp('мільйонер')).toContain('round.ladder');
  });

  it('related entries mention the new limits', () => {
    for (const kind of ['fifty', 'retry', 'audience'] as const) expect(text(`buff.${kind}`), kind).toContain('Хто я?');
    expect(text('cell.voice')).toContain('Відкрити підказку');
    expect(text('setting.speedBonus')).toContain('Хто я?');
    expect(text('round.blitz')).toContain('точка на мапі');
    expect(text('round.final')).toContain('точка на мапі');
  });

  it('titles of the 10b entries match the editor labels', () => {
    expect(helpEntry('setting.audio').title).toBe(t('audioLabel'));
    expect(helpEntry('setting.reveal').title).toBe(t('revealLabel'));
    expect(helpEntry('question.slider').title).toBe(t('type_slider'));
  });

  it('search finds buffs and debuffs by name', () => {
    expect(searchHelp('щит')).toEqual(['buff.shield']);
    expect(searchHelp('50')).toEqual(['buff.fifty']);
    expect(searchHelp('ЗАМІНА')).toEqual(['buff.swap']);
    expect(searchHelp('туман')).toEqual(['debuff.fog']);
  });

  it('every buff states the once-per-game rule and where buffs do not work', () => {
    for (const kind of BUFF_KINDS) {
      const e = helpEntry(`buff.${kind}`);
      expect(e.how[0], kind).toContain('раз за гру, не більше одного на запитання і лише до відповіді');
      expect((e.limits ?? []).join(' '), kind).toContain("Бафи не діють у бліці, на бліц-клітинках, у фіналі, у «Ва-банк», «Вибуванні» й «Мільйонері», на запитаннях «ланцюжок» і «сортування», на стіні зв'язків, опитуванні й хмарі слів та в дуелях");
    }
    expect(text('buff.shield')).toContain('в інших баф узяти не можна');
    expect(text('buff.swap')).toContain('лише за наявності запасних запитань');
    for (const kind of ['retry', 'audience', 'swap'] as const) expect(text(`buff.${kind}`)).toContain('кілька правильних');
    expect(text('setting.debuffShop')).toContain('підключений до гри');
    expect(text('setting.streak')).toContain('У бліці без натискання серія не обривається');
    expect(text('round.board')).toContain(`до ${LIMITS.maxCategories * LIMITS.maxCategoryQuestions} клітинок`);
    expect(text('round.classic')).toContain('Запитання з відео й картинкою, що проявляється, бонусу за швидкість не мають');
  });

  it('10d entries tell the engine numbers', () => {
    const wall = helpEntry('question.wall');
    const full4 = Math.round(wallShare(4, 4) * 100);
    const full3 = Math.round(wallShare(3, 3) * 100);
    expect(wall.points.join(' ')).toContain(`${full4} %`);
    expect(wall.points.join(' ')).toContain(`${full3} %`);
    expect([full4, full3]).toEqual([75, 67]);
    expect((wall.limits ?? []).join(' ')).toContain(`${LIMITS.minWallMistakes}–${LIMITS.maxWallMistakes}`);
    expect(wall.tip.join(' ')).toContain(`${LIMITS.wallTile}`);
    expect(helpEntry('question.poll').points.join(' ')).toContain('Балів немає');
    expect(helpEntry('question.wordcloud').points.join(' ')).toContain('Балів немає');
    expect(helpEntry('question.wordcloud').how.join(' ')).toContain(`${LIMITS.cloudShown}`);
    expect(helpEntry('question.wordcloud').how.join(' ')).toContain('сховати');
    expect(helpEntry('question.wordcloud').tip.join(' ')).toContain('100 до 1');
  });

  it('10e entries tell the engine numbers', () => {
    const survey = helpEntry('question.survey');
    const limits = (survey.limits ?? []).join(' ');
    expect(limits).toContain(`${LIMITS.minSurveyRows}–${LIMITS.maxSurveyRows}`);
    expect(limits).toContain(`1–${LIMITS.maxSurveyAnswers}`);
    expect(survey.points.join(' ')).toContain('ціна × популярність / 100');
    expect(survey.points.join(' ')).toContain('Половина ціни');
    expect(survey.how.join(' ')).toContain('знизу вгору');
    expect(survey.how.join(' ')).toContain('пропускається');
  });

  it('10f entries tell the engine numbers', () => {
    const bluff = helpEntry('question.bluff');
    const limits = (bluff.limits ?? []).join(' ');
    expect(limits).toContain(`${LIMITS.bluffLie}`);
    expect(limits).toContain(`${LIMITS.minBluffSpares}–${LIMITS.maxBluffSpares}`);
    expect(bluff.points.join(' ')).toContain('половина ціни');
    expect(bluff.points.join(' ')).toContain('Множник раунду');
    expect(bluff.how.join(' ')).toContain('Це правда!');
    expect(bluff.how.join(' ')).toContain('Прибрати');
    expect(bluff.how.join(' ')).toContain('правда — остання');
  });

  it('10j team entries tell the engine rules', () => {
    for (const id of helpIds('teams')) {
      filled(id);
      expect(helpEntry(id).points.length, id).toBeGreaterThan(0);
    }
    expect(text('team.play')).toContain(`${LIMITS.minTeams}–${LIMITS.maxTeams}`);
    expect(text('team.play')).toContain(String(LIMITS.teamName));
    expect(text('team.dice')).toContain('смуг');
    expect(text('team.dice')).toContain('перекида');
    expect(text('team.captain')).toContain('наступн');
    expect(text('team.captain')).toContain('на зв’язку');
    for (const word of ['натиснув', 'інших команд', 'кожен окремо', 'капітан']) expect(text('team.formats'), word).toContain(word);
    expect(searchHelp('капітан')).toContain('team.captain');
    expect(searchHelp('кубик')).toContain('team.dice');
  });

  it('format, buff, debuff and setting entries have a team line', () => {
    const ids: HelpId[] = ['round.classic', 'round.blitz', 'round.board', 'round.final', 'round.wipeout', 'round.survival', 'round.ladder', 'question.bluff', 'question.poll', 'question.wordcloud', 'buff.audience', 'buff.hint', 'buff.retry', 'setting.duels', 'setting.debuffShop'];
    for (const kind of DEBUFF_KINDS) ids.push(`debuff.${kind}`);
    for (const id of ids) expect(text(id), id).toContain('У командній грі');
  });

  it('related entries mention the bluff', () => {
    for (const id of ['buff.double', 'buff.shield', 'buff.time', 'buff.hint', 'buff.swap', 'setting.speedBonus'] as HelpId[]) {
      expect(text(id), id).toContain('блеф');
    }
    for (const id of ['round.board', 'round.blitz', 'round.final'] as HelpId[]) {
      expect(text(id), id).toContain('Блеф');
    }
  });

  it('related entries mention 100 до 1', () => {
    const ids: HelpId[] = ['buff.fifty', 'buff.retry', 'buff.audience', 'buff.double', 'cell.normal', 'cell.voice', 'cell.blitz', 'round.board', 'round.blitz', 'round.final', 'round.classic', 'setting.speedBonus'];
    for (const id of ids) {
      expect(text(id), id).toContain('100 до 1');
    }
  });

  it('11e wipeout help tells the banks for everyone, the «Рішення» screen and its 3 s minimum', () => {
    const wipeout = text('round.wipeout');
    for (const part of ['смужку «У грі', 'екран «Рішення»', 'Без вибору', '3 с', 'Мінімальний час перед «Далі»']) expect(wipeout, part).toContain(part);
    expect(wipeout).not.toContain('драбину з тим, хто вцілів і скільки в банку, вона покаже після «Далі»');
    expect(text('setting.pacing')).toContain('екран «Рішення»');
  });

  it('10g wipeout entries tell the engine numbers and the isolation', () => {
    const wipeout = text('round.wipeout');
    expect(wipeout).toContain(String(LIMITS.wipeoutDecideSeconds));
    expect(wipeout).toContain(`${LIMITS.minWipeoutQuestions}–${LIMITS.maxWipeoutQuestions}`);
    expect(wipeout).toContain('забирає банк сам');
    for (const kind of BUFF_KINDS) expect((helpEntry(`buff.${kind}`).limits ?? []).join(' '), kind).toContain('у «Ва-банк»');
    for (const kind of DEBUFF_KINDS) expect(text(`debuff.${kind}`), kind).toContain('«Ва-банк»');
    for (const key of ['debuffShop', 'duels', 'leaderboard'] as const) expect(text(`setting.${key}`), key).toContain('Ва-банк');
    expect(text('round.final')).toContain('не те саме, що раунд «Ва-банк»');
    expect(text('round.classic')).toContain('«Ва-банк» — окремий тип раунду');
    expect(searchHelp('ва-банк')).toContain('round.wipeout');
  });

  it('10h survival entries tell the engine numbers and the isolation', () => {
    const survival = text('round.survival');
    expect(survival).toContain(String(LIMITS.survivalLuckSeconds));
    expect(survival).toContain(`${LIMITS.minSurvivalQuestions}–${LIMITS.maxSurvivalQuestions}`);
    expect(survival).toContain('виберуться самі');
    expect(survival).toContain('ніхто не вибуває');
    expect(survival).toContain('привид');
    for (const kind of BUFF_KINDS) expect((helpEntry(`buff.${kind}`).limits ?? []).join(' '), kind).toContain('Вибуванні');
    for (const key of ['debuffShop', 'duels', 'leaderboard', 'speedBonus'] as const) expect(text(`setting.${key}`), key).toContain('Вибуванні');
    expect(text('setting.spares')).toContain('питання на виживання');
    expect(text('round.classic')).toContain('«Вибування» — окремий тип раунду');
    expect(searchHelp('вибування')).toContain('round.survival');
  });

  it('related entries mention the new limits', () => {
    expect(text('buff.double')).toContain('стіні');
    expect(text('buff.double')).toContain('опитуванні');
    for (const kind of DEBUFF_KINDS) expect(text(`debuff.${kind}`), kind).toContain('опитуванні');
    expect(text('cell.normal')).toContain("Стіна зв'язків");
    expect(text('round.board')).toContain('Опитування');
    expect(text('round.blitz')).toContain("Стіна зв'язків");
    expect(text('round.final')).toContain("Стіна зв'язків");
    expect(text('setting.speedBonus')).toContain('стіні');
  });

  it('describes long round descriptions and the board cell marks (11a)', () => {
    expect(text('setting.description')).toContain(String(LIMITS.roundDescription));
    expect(text('setting.description')).toContain('трьома крапками');
    expect(text('setting.newcomers')).not.toContain(String(LIMITS.roundDescription));
    for (const word of ['✓', 'не заповнена', 'Зберегти']) expect(text('round.board')).toContain(word);
  });
});
