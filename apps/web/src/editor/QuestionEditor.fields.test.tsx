// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '@quiz/shared';
import { t } from '../i18n';
import { QUESTION_TYPES, newQuestion, questionTypesFor } from './draft';
import { QuestionEditor } from './QuestionEditor';

afterEach(cleanup);

/** Варіанти запитання: без медіа, з картинкою, з відео, з аудіо. */
const VARIANTS: Record<string, (question: Question) => Question> = {
  plain: (q) => q,
  image: (q) => ({ ...q, imageUrl: 'https://x/i.png' }) as Question,
  video: (q) => ({ ...q, video: { id: 'abc', start: 42 } }) as Question,
  audio: (q) => ({ ...q, audio: { source: 'file', url: '/uploads/0123456789abcdef0123456789abcdef.mp3', start: 0, duration: 10 } }) as Question,
};

/** Набори прапорців: типові, як у запасних, без часу, з проявленням. */
const FLAG_SETS: Record<string, Partial<Record<'showPoints' | 'showHint' | 'showTime' | 'showVideo' | 'showAudio' | 'showReveal', boolean>>> = {
  defaults: {},
  spare: { showPoints: false, showHint: false, showVideo: false, showAudio: false },
  noTime: { showTime: false },
  reveal: { showReveal: true },
};

/** Поля власних редакторів типу (пазл, мелодія, кліп) — не поля QuestionEditor. */
const SUB_EDITORS = '.melody-editor, .jigsaw-editor, .jigsaw-editor-time';

const own = (elements: Iterable<Element>) => [...elements].filter((el) => el.closest(SUB_EDITORS) === null);

const labelled = (root: HTMLElement, text: string) => own(root.querySelectorAll('label')).filter((label) => label.querySelector(':scope > span')?.textContent === text);

const withText = (root: HTMLElement, text: string) => own(root.querySelectorAll('p')).filter((p) => p.textContent === text);

/** Маркери, які видно: зображення, проявлення, відео, аудіо, текст, підказка, таймер, «без таймера», бали, «без балів». */
function markers(root: HTMLElement): string[] {
  const found: [string, boolean][] = [
    ['image', own(root.querySelectorAll('.image-field')).length > 0],
    ['reveal', own(root.querySelectorAll(`[role="group"][aria-label="${t('revealLabel')}"]`)).length > 0],
    ['video', own(root.querySelectorAll('.video-field')).length > 0],
    ['audio', own(root.querySelectorAll('.audio-field')).length > 0],
    ['text', labelled(root, t('questionText')).length > 0],
    ['hint', labelled(root, t('hintLabel')).length > 0],
    ['time', labelled(root, t('timeLimit')).length + labelled(root, t('bluffLieTime')).length > 0],
    ['noTimer', withText(root, t('noTimerHint')).length > 0],
    ['points', labelled(root, t('pointsLabel')).length > 0],
    ['noPoints', withText(root, t('noPointsNote')).length > 0],
  ];
  return found.filter(([, on]) => on).map(([name]) => name);
}

describe('QuestionEditor fields (74)', () => {
  it('shows the same fields for every type, media and flag set', () => {
    const table: Record<string, string> = {};
    const types = questionTypesFor('classic');
    for (const type of QUESTION_TYPES) {
      for (const [variant, make] of Object.entries(VARIANTS)) {
        for (const [flagsName, flags] of Object.entries(FLAG_SETS)) {
          const { container } = render(<QuestionEditor question={make(newQuestion(type))} onChange={vi.fn()} types={types} {...flags} />);
          table[`${type} ${variant} ${flagsName}`] = markers(container).join(' ');
          cleanup();
        }
      }
    }
    expect(table).toMatchSnapshot();
  });
});
