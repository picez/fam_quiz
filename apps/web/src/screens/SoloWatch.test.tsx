// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicQuestion, SoloWatch } from '@quiz/shared';
import { SoloWatchView } from './SoloWatch';

const base: PublicQuestion = {
  type: 'letterwords',
  text: 'Складіть слова з літер',
  imageUrl: null,
  video: null,
  timeLimit: 90,
  points: 20,
  choices: [],
  right: [],
  orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
  chain: null,
  sort: null,
};

afterEach(cleanup);

describe('SoloWatchView', () => {
  it('letter words: the set, the count and the answerer words newest first', () => {
    const question = { ...base, letterwords: { letters: [...'морквасті'], goal: 'most' as const, per: 'word' as const, unit: 20 } };
    const solo: SoloWatch = { playerId: 'p2', nickname: 'Тарас', progress: { kind: 'letterwords', words: [{ text: 'кіт', letters: 3 }, { text: 'морква', letters: 6 }] } };
    const { container } = render(<SoloWatchView solo={solo} question={question} />);
    expect(screen.getByText('Відповідає Тарас')).toBeTruthy();
    expect(screen.getByText('Слів: 2')).toBeTruthy();
    expect([...container.querySelectorAll('.solo-watch-words .letterwords-word')].map((el) => el.textContent)).toEqual(['морква', 'кіт']);
    expect(container.querySelectorAll('.letterwords-tile')).toHaveLength(9);
    cleanup();
    // Сцена: плитки вже стоять під запитанням.
    const stage = render(<SoloWatchView solo={solo} question={question} stage />);
    expect(stage.container.querySelectorAll('.letterwords-tile')).toHaveLength(0);
  });

  it('chain: solved words in full, the current one marked, hints counted; without the name when the screen already says it', () => {
    const question = { ...base, type: 'chain' as const, chain: { first: 'Форель', masks: [['Р', null, null, null], ['О', null, null, null, null]], hintSeconds: 5 } };
    const solo: SoloWatch = { playerId: 'p2', nickname: 'Тарас', progress: { kind: 'chain', solved: 1, total: 2, hints: 1, masks: [[...'Риба'], ['О', null, null, null, null]] } };
    const { container } = render(<SoloWatchView solo={solo} question={question} named={false} />);
    expect(screen.queryByText('Відповідає Тарас')).toBeNull();
    expect(screen.getByLabelText('Риба')).toBeTruthy();
    expect(container.querySelector('.chain-word.is-current')?.getAttribute('aria-label')).toBe('О____');
    expect(screen.getByText('1 з 2')).toBeTruthy();
    expect(screen.getByText('підказок: 1')).toBeTruthy();
  });

  it('word ladder: a finished ladder says the steps', () => {
    const question = { ...base, type: 'wordladder' as const, wordladder: { start: 'поле', target: 'тара', letters: 4, maxSteps: 8 } };
    const solo: SoloWatch = { playerId: 'p2', nickname: 'Тарас', progress: { kind: 'wordladder', words: ['пола', 'пора', 'пара', 'тара'], finished: true } };
    render(<SoloWatchView solo={solo} question={question} />);
    expect(screen.getByText('Дійшли за кроків: 4')).toBeTruthy();
    expect(screen.getByText('поле → тара')).toBeTruthy();
  });
});
