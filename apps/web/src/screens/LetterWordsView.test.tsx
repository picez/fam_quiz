// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, type LetterWordsInfo, type PlayerLetterWords, type PublicQuestion } from '@quiz/shared';
import type { Send, SendResult } from '../live/types';
import { LetterTiles, LetterWordsBest, LetterWordsBoard, LetterWordsPlay } from './LetterWordsView';

const letters = ['м', 'о', 'р', 'к', 'в', 'а', 'с', 'т', 'і'];

const question: PublicQuestion = {
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
  letterwords: { letters, goal: 'most', per: 'word', unit: 20 },
};

const mineOf = (over: Partial<PlayerLetterWords> = {}): PlayerLetterWords => ({ words: [], canType: true, ...over });

const field = () => screen.getByLabelText('Ваше слово') as HTMLInputElement;
const tile = (letter: string) => screen.getByRole('button', { name: `Літера ${letter.toLocaleUpperCase('uk')}` });
const addButton = () => screen.getByRole('button', { name: 'Додати' }) as HTMLButtonElement;
const typeIn = (value: string) => fireEvent.change(field(), { target: { value } });
const submit = () => fireEvent.submit(field().form!);

/** Ack, що відповідає, коли тест скаже. */
function deferred() {
  const answers: ((result: SendResult) => void)[] = [];
  const send = vi.fn<Send>(() => new Promise<SendResult>((resolve) => answers.push(resolve)));
  return { send, answer: async (result: SendResult, at = answers.length - 1) => act(async () => answers[at](result)) };
}

afterEach(cleanup);

describe('LetterTiles', () => {
  it('shows every letter, the used ones run out by count', () => {
    render(<LetterTiles letters={['м', 'а', 'м', 'а']} used={['м']} onPick={() => {}} />);
    const tiles = screen.getAllByRole('button', { name: 'Літера М' });
    expect(tiles).toHaveLength(2);
    expect(tiles.filter((t) => t.getAttribute('aria-disabled') === 'true')).toHaveLength(1);
  });

  it('without onPick the tiles are only shown', () => {
    render(<LetterTiles letters={letters} big />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(document.querySelectorAll('.letterwords-tile')).toHaveLength(9);
    expect(document.querySelector('.letterwords-tiles.is-big')).not.toBeNull();
  });
});

describe('LetterWordsPlay', () => {
  it('tiles add letters and run out by count', () => {
    render(<LetterWordsPlay info={mineOf()} question={question} paused={false} send={vi.fn<Send>()} />);
    const input = field();
    expect(input.maxLength).toBe(LIMITS.letterWord);
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('enterkeyhint')).toBe('send');
    fireEvent.click(tile('м'));
    fireEvent.click(tile('о'));
    expect(field().value).toBe('мо');
    expect(tile('м').getAttribute('aria-disabled')).toBe('true');
    // Вичерпана плитка не дописує літеру вдруге.
    fireEvent.click(tile('м'));
    expect(field().value).toBe('мо');
    fireEvent.click(screen.getByRole('button', { name: 'Стерти літеру' }));
    fireEvent.click(screen.getByRole('button', { name: 'Стерти літеру' }));
    expect(field().value).toBe('');
    expect(tile('м').getAttribute('aria-disabled')).toBe('false');
    // З клавіатури великими теж рахується.
    typeIn('М');
    expect(tile('м').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Очистити' }));
    expect(field().value).toBe('');
  });

  it('a tile keeps the focus in the field', () => {
    render(<LetterWordsPlay info={mineOf()} question={question} paused={false} send={vi.fn<Send>()} />);
    field().focus();
    const down = fireEvent.pointerDown(tile('к'));
    // preventDefault на pointerdown: дотик до плитки не забирає фокус (і клавіатуру) з поля.
    expect(down).toBe(false);
    fireEvent.click(tile('к'));
    expect(document.activeElement).toBe(field());
  });

  it('add, erase, clear and shuffle keep the focus in the field', () => {
    render(<LetterWordsPlay info={mineOf()} question={question} paused={false} send={vi.fn<Send>()} />);
    typeIn('мак');
    for (const name of ['Додати', 'Стерти літеру', 'Очистити', 'Перемішати']) {
      const button = screen.getByRole('button', { name });
      // preventDefault на pointerdown і mousedown: на Android дотик не закриває клавіатуру.
      expect(fireEvent.pointerDown(button), name).toBe(false);
      expect(fireEvent.mouseDown(button), name).toBe(false);
    }
  });

  it('while off the tiles look disabled and do nothing, shuffle too', () => {
    for (const info of [mineOf(), mineOf({ canType: false })]) {
      const paused = info.canType;
      render(<LetterWordsPlay info={info} question={question} paused={paused} send={vi.fn<Send>()} />);
      const tiles = screen.getAllByRole('button', { name: /^Літера / });
      expect(tiles.every((el) => el.getAttribute('aria-disabled') === 'true')).toBe(true);
      expect(document.querySelector('.letterwords-tiles.is-off')).not.toBeNull();
      fireEvent.click(tile('м'));
      expect(field().value).toBe('');
      expect((screen.getByRole('button', { name: 'Перемішати' }) as HTMLButtonElement).disabled).toBe(true);
      cleanup();
    }
    render(<LetterWordsPlay info={mineOf()} question={question} paused={false} send={vi.fn<Send>()} />);
    expect(document.querySelector('.letterwords-tiles.is-off')).toBeNull();
    expect((screen.getByRole('button', { name: 'Перемішати' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a second tap on a word already in flight does not send it again', async () => {
    const { send, answer } = deferred();
    render(<LetterWordsPlay info={mineOf()} question={question} paused={false} send={send} />);
    typeIn('мама');
    submit();
    submit();
    await answer({ ok: false, error: 'letters_not_in_set' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(field().value).toBe('мама');
    // Виправлене слово йде як завжди.
    typeIn('мак');
    submit();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('shuffle keeps the same letters', () => {
    render(<LetterWordsPlay info={mineOf()} question={question} paused={false} send={vi.fn<Send>()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Перемішати' }));
    const shown = [...document.querySelectorAll('.letterwords-tile')].map((el) => el.textContent?.toLocaleLowerCase('uk'));
    expect([...shown].sort()).toEqual([...letters].sort());
  });

  it('the add button waits for three letters', () => {
    const send = vi.fn<Send>();
    render(<LetterWordsPlay info={mineOf()} question={question} paused={false} send={send} />);
    expect(addButton().disabled).toBe(true);
    typeIn("м'");
    expect(addButton().disabled).toBe(true);
    submit();
    expect(send).not.toHaveBeenCalled();
    typeIn('мак');
    expect(addButton().disabled).toBe(false);
    cleanup();
    render(<LetterWordsPlay info={mineOf()} question={question} paused send={send} />);
    typeIn('мак');
    expect(addButton().disabled).toBe(true);
    cleanup();
    render(<LetterWordsPlay info={mineOf({ canType: false })} question={question} paused={false} send={send} />);
    expect(field().disabled).toBe(true);
  });

  it('a found word joins the list and clears the field', async () => {
    const { send, answer } = deferred();
    const { rerender } = render(<LetterWordsPlay info={mineOf({ words: [{ text: 'ставок', letters: 6 }] })} question={question} paused={false} send={send} />);
    typeIn('Морква');
    submit();
    expect(send).toHaveBeenCalledWith('player:letters', { word: 'Морква' });
    await answer({ ok: true });
    expect(field().value).toBe('');
    rerender(<LetterWordsPlay info={mineOf({ words: [{ text: 'ставок', letters: 6 }, { text: 'морква', letters: 6 }] })} question={question} paused={false} send={send} />);
    const items = [...document.querySelectorAll('.letterwords-mine li')];
    // Новіші зверху, з кількістю літер.
    expect(items[0].textContent).toContain('морква');
    expect(items[0].textContent).toContain('6');
    expect(items[0].classList.contains('is-fresh')).toBe(true);
    expect(items[1].textContent).toContain('ставок');
    expect(screen.getByText('Ваші слова: 2')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Додано: морква');
  });

  it('a repeat flashes the word and costs nothing', async () => {
    const { send, answer } = deferred();
    render(<LetterWordsPlay info={mineOf({ words: [{ text: 'морква', letters: 6 }] })} question={question} paused={false} send={send} />);
    typeIn('морква');
    submit();
    await answer({ ok: false, error: 'letters_repeat' });
    expect(field().value).toBe('');
    expect(screen.getByText('морква').closest('li')?.classList.contains('is-again')).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Це слово вже є у списку');
    expect(document.querySelector('.is-shake')).toBeNull();
  });

  it('a refusal shakes and keeps the word to fix', async () => {
    const { send, answer } = deferred();
    render(<LetterWordsPlay info={mineOf()} question={question} paused={false} send={send} />);
    typeIn('мама');
    submit();
    await answer({ ok: false, error: 'letters_not_in_set' });
    expect(field().value).toBe('мама');
    expect(document.querySelector('.is-shake')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Це слово не складається з літер набору');
    typeIn('корт');
    submit();
    await answer({ ok: false, error: 'word_unknown' });
    expect(field().value).toBe('корт');
    expect(screen.getByRole('status').textContent).toBe('Такого слова не існує');
    // Ліміт частоти — тихо: ні трусу, ні тексту, слово лишається.
    cleanup();
    const soon = deferred();
    render(<LetterWordsPlay info={mineOf()} question={question} paused={false} send={soon.send} />);
    typeIn('ставок');
    submit();
    await soon.answer({ ok: false, error: 'too_soon' });
    expect(field().value).toBe('ставок');
    expect(document.querySelector('.is-shake')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('one request at a time and a cleared field only for the word that was sent', async () => {
    const { send, answer } = deferred();
    render(<LetterWordsPlay info={mineOf()} question={question} paused={false} send={send} />);
    typeIn('морква');
    submit();
    submit();
    expect(send).toHaveBeenCalledTimes(1);
    // Поки сервер думає, гравець почав наступне слово: надіслане з поля йде, дописане лишається.
    typeIn('морквас');
    await answer({ ok: true });
    expect(field().value).toBe('с');
    // Поле переписане зовсім — лишається як є.
    typeIn('ставок');
    submit();
    typeIn('острів');
    await answer({ ok: true });
    expect(field().value).toBe('острів');
    // Enter, натиснутий під час запиту, не губиться: слово йде, щойно відповідь прийшла.
    submit();
    expect(send).toHaveBeenCalledTimes(3);
    typeIn('сіра');
    submit();
    expect(send).toHaveBeenCalledTimes(3);
    await answer({ ok: true });
    expect(send).toHaveBeenCalledTimes(4);
    expect(send).toHaveBeenLastCalledWith('player:letters', { word: 'сіра' });
  });
});

describe('LetterWordsBoard and LetterWordsBest', () => {
  const playing: LetterWordsInfo = {
    rows: [
      { playerId: 'p1', nickname: 'Олена', found: 5, top: null, more: null, points: null },
      { playerId: 'p2', nickname: 'Тарас', found: 2, top: null, more: null, points: null },
    ],
    best: null,
    possible: null,
    words: null,
  };

  it('the stage board shows counts while playing, then the best words', () => {
    const { unmount } = render(<LetterWordsBoard info={playing} reveal={false} />);
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText('Слів: 5')).toBeTruthy();
    expect(screen.getByText('Слів: 2')).toBeTruthy();
    expect(document.querySelector('.score')).toBeNull();
    unmount();
    const revealed: LetterWordsInfo = {
      ...playing,
      rows: [
        { playerId: 'p1', nickname: 'Олена', found: 5, top: ['морква', 'острів', 'ставок'], more: 2, points: 100 },
        { playerId: 'p2', nickname: 'Тарас', found: 0, top: [], more: 0, points: 0 },
      ],
    };
    render(<LetterWordsBoard info={revealed} reveal mine="p1" />);
    expect(screen.getByText('морква, острів, ставок')).toBeTruthy();
    expect(screen.getByText('ще 2')).toBeTruthy();
    expect(document.querySelector('.letterwords-board .score')?.textContent).toBe('+100');
    expect(screen.getByText('Олена').closest('li')?.classList.contains('is-mine')).toBe(true);
    expect(screen.getByText('Тарас').closest('li')?.classList.contains('is-mine')).toBe(false);
    expect(screen.queryByText('ще 0')).toBeNull();
  });

  it('the host board lists every word live', () => {
    render(<LetterWordsBoard info={{ ...playing, words: { p1: ['ставок', 'морква'], p2: [] } }} reveal={false} />);
    expect(screen.getByText('ставок, морква')).toBeTruthy();
  });

  it('LetterWordsBest names the longest words or says none exist', () => {
    const { unmount } = render(<LetterWordsBest info={{ ...playing, best: ['кентавр', 'верстак'], possible: 41 }} />);
    expect(screen.getByRole('heading', { name: 'Найдовші слова з цих літер' })).toBeTruthy();
    expect(screen.getByText('кентавр')).toBeTruthy();
    expect(screen.getByText('верстак')).toBeTruthy();
    expect(screen.getAllByText('7 літ.')).toHaveLength(2);
    expect(screen.getByText('Усього слів у наборі: 41')).toBeTruthy();
    unmount();
    const none = render(<LetterWordsBest info={{ ...playing, best: [], possible: 0 }} />);
    expect(screen.getByText('З цих літер слів зі словника не складається')).toBeTruthy();
    none.unmount();
    render(<LetterWordsBest info={playing} />);
    expect(document.body.textContent).toBe('');
  });
});
