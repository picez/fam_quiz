import type { GuidePage, Question, RoundBrief } from '@quiz/shared';
import { BUFF_ICONS, buffName } from './buff-meta';
import { DEBUFF_ICONS, debuffName } from './debuff-meta';
import { countText, t, type TextKey } from './i18n';
import { roundSummary } from './round-summary';

/** Пункт сторінки: значок (лише сцена), назва, рядок; details — додаткові рядки сцени (бали раунду). */
export interface GuideItem {
  icon: string;
  name: string;
  line: string;
  details: string[];
}

export interface GuideText {
  title: string;
  lead: string[];
  items: GuideItem[];
}

export const ROUND_ICONS: Record<RoundBrief['type'], string> = { classic: '❓', blitz: '⚡', board: '▦', final: '🏆', wipeout: '💰' };

export const ROUND_NAMES: Record<RoundBrief['type'], TextKey> = {
  classic: 'roundTypeClassic',
  blitz: 'roundTypeBlitz',
  board: 'roundTypeBoard',
  final: 'roundTypeFinal',
  wipeout: 'roundTypeWipeout',
};

export const TYPE_ICONS: Record<Question['type'], string> = {
  single: '◉',
  multi: '☑',
  boolean: '✓✗',
  text: 'Аа',
  numeric: '123',
  order: '↕',
  match: '⇆',
  chain: '⛓',
  sort: '▤',
  slider: '⟷',
  clues: '…?',
  pin: '⌖',
  wall: '▦',
  poll: '▮▮',
  wordcloud: '☁',
  survey: '💯',
  bluff: '🎭',
};

/** Як проходить раунд — 1 рядок (у фіналі 2: ставка і режим ставок; пам'ятка бере лише перший). */
export function roundHow(brief: RoundBrief): string[] {
  switch (brief.type) {
    case 'classic':
      return [t('roundHow_classic')];
    case 'blitz':
      return [t(brief.instant ? 'roundHow_blitzInstant' : 'roundHow_blitz')];
    case 'board':
      return [t('roundHow_board')];
    case 'final':
      return [t('roundHow_final'), t(brief.wagerMode === 'bank' ? 'summaryFinalBank' : 'summaryFinalScore')];
    case 'wipeout':
      return [t('roundHow_wipeout')];
  }
}

/** Мала перша літера, лише якщо друга теж мала: «Найбільший» → «найбільший», а «NASA» чи «ВВП» без змін. */
export function lowerFirst(label: string): string {
  const second = label.charAt(1);
  const secondLower = second !== '' && second === second.toLocaleLowerCase('uk') && second !== second.toLocaleUpperCase('uk');
  return secondLower ? label.charAt(0).toLocaleLowerCase('uk') + label.slice(1) : label;
}

/** Як відповідати на запитання цього типу; top — підпис верху порядку ('' — немає). */
export function typeHow(type: Question['type'], top = ''): string {
  if (type === 'order') {
    const label = top.trim();
    if (label === '') return t('typeHow_order');
    return t('typeHow_orderTop', { top: lowerFirst(label) });
  }
  return t(`typeHow_${type}` as TextKey);
}

/** Заголовок, вступні рядки й пункти сторінки «Як грати». */
export function guidePageText(page: GuidePage): GuideText {
  switch (page.kind) {
    case 'phone':
      return { title: t('guidePhoneTitle'), lead: [t('guidePhoneSee'), t('guidePhoneAnswer'), t('guidePhoneScore')], items: [] };
    case 'rounds':
      return {
        title: t('guideRoundsTitle'),
        lead: [],
        items: page.rounds.map((brief) => ({
          icon: ROUND_ICONS[brief.type],
          name: t(ROUND_NAMES[brief.type]),
          line: roundHow(brief).join(' '),
          details: roundSummary(brief),
        })),
      };
    case 'questions':
      return {
        title: t('guideQuestionsTitle'),
        lead: [],
        items: page.types.map(({ type, top }) => ({
          icon: TYPE_ICONS[type],
          name: t(`type_${type}` as TextKey),
          line: typeHow(type, top),
          details: [],
        })),
      };
    case 'buffs':
      return {
        title: t('guideBuffsTitle'),
        lead: [t('guideBuffsLead'), t('guideBuffsWhere')],
        items: page.buffs.map((kind) => ({ icon: BUFF_ICONS[kind], name: buffName(kind), line: t(`buffGuide_${kind}` as TextKey), details: [] })),
      };
    case 'debuffs':
      return {
        title: t('guideDebuffsTitle'),
        lead: [t('guideDebuffsLead')],
        items: page.debuffs.map((kind) => ({ icon: DEBUFF_ICONS[kind], name: debuffName(kind), line: t(`debuffGuide_${kind}` as TextKey), details: [] })),
      };
    case 'duels': {
      const when = `${countText('guideDuelsWhen', page.after, { count: page.after })} ${t(page.final ? 'guideDuelsCutoffFinal' : 'guideDuelsCutoffLast')}`;
      const lead = [when, t('guideDuelsHow'), t('guideDuelsWin', { count: page.questions })];
      if (page.stake > 0) lead.push(countText('guideDuelsStake', page.stake, { stake: page.stake }));
      return { title: t('guideDuelsTitle'), lead, items: [] };
    }
  }
}
