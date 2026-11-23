// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '@quiz/shared';
import { t } from '../i18n';
import { QUESTION_TYPES, newQuestion, questionTypesFor } from './draft';
import { QuestionEditor } from './QuestionEditor';
import { hasMedia, hintShown, mediaFields, mediaSummary, noTimerHintShown, pointsFieldShown, timeFieldShown, type LayoutFlags } from './question-layout';

afterEach(cleanup);

// Ті самі набори, що в знімку QuestionEditor.fields.test.tsx (малий дубль циклу — навмисно).
const VARIANTS: Record<string, (question: Question) => Question> = {
  plain: (q) => q,
  image: (q) => ({ ...q, imageUrl: 'https://x/i.png' }) as Question,
  video: (q) => ({ ...q, video: { id: 'abc', start: 42 } }) as Question,
  audio: (q) => ({ ...q, audio: { source: 'file', url: '/uploads/0123456789abcdef0123456789abcdef.mp3', start: 0, duration: 10 } }) as Question,
};

const FLAG_SETS: Record<string, Partial<LayoutFlags>> = {
  defaults: {},
  spare: { showPoints: false, showHint: false, showVideo: false, showAudio: false },
  noTime: { showTime: false },
  reveal: { showReveal: true },
};

const DEFAULTS: LayoutFlags = { showPoints: true, showHint: true, showTime: true, showVideo: true, showAudio: true, showReveal: false };

// Власні поля редакторів типу (час пазла, бали пари «Більше чи менше», відео кліпу, картинки різниць) — не поля QuestionEditor.
const SUB_EDITORS = '.melody-editor, .jigsaw-editor, .jigsaw-editor-time, .moreless-editor-pair, .spotdiff-editor';
const own = (elements: Iterable<Element>) => [...elements].filter((el) => el.closest(SUB_EDITORS) === null);
const labelled = (root: HTMLElement, text: string) => own(root.querySelectorAll('label')).some((label) => label.querySelector(':scope > span')?.textContent === text);
const withText = (root: HTMLElement, text: string) => own(root.querySelectorAll('p')).some((p) => p.textContent === text);

describe('question layout (74)', () => {
  it('matches the current visibility rules', () => {
    const types = questionTypesFor('classic');
    for (const type of QUESTION_TYPES) {
      for (const [variant, make] of Object.entries(VARIANTS)) {
        for (const [flagsName, partial] of Object.entries(FLAG_SETS)) {
          const question = make(newQuestion(type));
          const flags = { ...DEFAULTS, ...partial };
          const { container } = render(createElement(QuestionEditor, { question, onChange: vi.fn(), types, ...partial }));
          const media = mediaFields(question, flags);
          const seen = {
            image: own(container.querySelectorAll('.image-field')).length > 0,
            reveal: own(container.querySelectorAll(`[role="group"][aria-label="${t('revealLabel')}"]`)).length > 0,
            video: own(container.querySelectorAll('.video-field')).length > 0,
            audio: own(container.querySelectorAll('.audio-field')).length > 0,
            hint: labelled(container, t('hintLabel')),
            time: labelled(container, t('timeLimit')) || labelled(container, t('bluffLieTime')),
            noTimer: withText(container, t('noTimerHint')),
            points: labelled(container, t('pointsLabel')),
          };
          const expected = {
            ...media,
            hint: hintShown(question, flags),
            time: timeFieldShown(question, flags),
            noTimer: noTimerHintShown(question, flags),
            points: pointsFieldShown(question, flags),
          };
          expect(expected, `${type} ${variant} ${flagsName}`).toEqual(seen);
          cleanup();
        }
      }
    }
  });

  it('names the media of a question', () => {
    const base = newQuestion('single');
    expect(mediaSummary({ ...base, imageUrl: 'x', video: { id: 'abc', start: 42 } } as Question)).toBe('картинка, відео з 0:42');
    expect(mediaSummary(base)).toBeNull();
    expect(hasMedia(newQuestion('single'))).toBe(false);
  });
});
