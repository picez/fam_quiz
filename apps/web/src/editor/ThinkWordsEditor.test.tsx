// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThinkWord } from '@quiz/shared';
import { t } from '../i18n';
import { ThinkWordsEditor } from './ThinkWordsEditor';

afterEach(cleanup);

function Harness({ onChange, initial = [] }: { onChange: (words: ThinkWord[]) => void; initial?: ThinkWord[] }) {
  const [words, setWords] = useState(initial);
  return (
    <ThinkWordsEditor
      words={words}
      onChange={(next) => {
        setWords(next);
        onChange(next);
      }}
    />
  );
}

describe('ThinkWordsEditor (35)', () => {
  it('adds up to three words with synonyms', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: t('thinkAddWord') }));
    expect(screen.queryByRole('button', { name: t('thinkAddWord') })).toBeNull();
    fireEvent.change(screen.getByLabelText(t('thinkWordLabel', { index: 1 })), { target: { value: 'синє' } });
    const synonyms = screen.getAllByLabelText(t('thinkSynonymsLabel'))[0] as HTMLInputElement;
    fireEvent.change(synonyms, { target: { value: ' синій,  блакитний , ' } });
    // Поле лишається таким, як його набрали; список — обрізаний і без порожніх.
    expect(synonyms.value).toBe(' синій,  блакитний , ');
    expect(onChange).toHaveBeenLastCalledWith([
      { word: 'синє', synonyms: ['синій', 'блакитний'] },
      { word: '', synonyms: [] },
      { word: '', synonyms: [] },
    ]);
    fireEvent.click(screen.getByRole('button', { name: `${t('thinkRemoveWord')} 2` }));
    expect(onChange.mock.lastCall![0]).toHaveLength(2);
    expect((screen.getAllByLabelText(t('thinkSynonymsLabel'))[0] as HTMLInputElement).value).toBe(' синій,  блакитний , ');
  });

  it('warns when there are no words', () => {
    render(<ThinkWordsEditor words={[]} onChange={vi.fn()} />);
    expect(screen.getByText(t('thinkNoWordsNote'))).toBeTruthy();
  });

  it('fields keep maxLength 40', () => {
    render(<ThinkWordsEditor words={[{ word: 'червоний', synonyms: ['алий'] }]} onChange={vi.fn()} />);
    expect((screen.getByLabelText(t('thinkWordLabel', { index: 1 })) as HTMLInputElement).maxLength).toBe(40);
    expect((screen.getByLabelText(t('thinkSynonymsLabel')) as HTMLInputElement).value).toBe('алий');
    expect(screen.queryByText(t('thinkNoWordsNote'))).toBeNull();
  });
});
