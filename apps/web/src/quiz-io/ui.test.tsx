// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadTemplate, exportQuizFile, exportQuizTable, importQuizFile, problemText } from './actions';
import { ExportMenu } from './ExportMenu';
import { ImportDialog } from './ImportDialog';

vi.mock('./actions');

beforeEach(() => {
  vi.mocked(problemText).mockImplementation((row) => `Рядок ${row.row}: немає правильної відповіді`);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const pending = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('ExportMenu', () => {
  it('export menu offers the file and the table', async () => {
    const gate = pending<{ ok: true }>();
    vi.mocked(exportQuizFile).mockImplementation(async (_id, onProgress) => {
      onProgress({ stage: 'media', done: 1, total: 3 });
      return gate.promise;
    });
    render(<ExportMenu quizId="q1" />);
    fireEvent.click(screen.getByText('Експорт'));
    const file = screen.getByRole('button', { name: 'Файл вікторини' });
    const table = screen.getByRole('button', { name: 'Таблиця (Excel)' });
    fireEvent.click(file);
    expect((await screen.findByRole('status')).textContent).toBe('Медіа: 1 з 3');
    expect(exportQuizFile).toHaveBeenCalledWith('q1', expect.any(Function));
    expect((file as HTMLButtonElement).disabled).toBe(true);
    expect((table as HTMLButtonElement).disabled).toBe(true);
    gate.resolve({ ok: true });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect((file as HTMLButtonElement).disabled).toBe(false);
  });

  it('table export reports skipped questions', async () => {
    vi.mocked(exportQuizTable).mockResolvedValueOnce({ ok: true, skipped: 2 });
    render(<ExportMenu quizId="q1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця (Excel)' }));
    expect(await screen.findByText('Пропущено 2 запитання інших типів чи з медіа (вони є лише у файлі вікторини)')).toBeTruthy();
    vi.mocked(exportQuizTable).mockResolvedValueOnce({ ok: true, skipped: 5 });
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця (Excel)' }));
    expect(await screen.findByText('Пропущено 5 запитань інших типів чи з медіа (вони є лише у файлі вікторини)')).toBeTruthy();
    vi.mocked(exportQuizTable).mockResolvedValueOnce({ ok: true, skipped: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Таблиця (Excel)' }));
    await waitFor(() => expect(screen.queryByText(/Пропущено/)).toBeNull());
  });

  it('opening the menu scrolls it into view', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<ExportMenu quizId="q1" />);
    const details = document.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    // @ts-expect-error — прибираємо підставку jsdom
    delete Element.prototype.scrollIntoView;
  });

  it('the menu closes on an outside click and on Escape, not on a click inside', () => {
    render(<ExportMenu quizId="q1" />);
    const details = document.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Файл вікторини' }));
    expect(details.open).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(details.open).toBe(false);
    details.open = true;
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(details.open).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(details.open).toBe(false);
  });

  it('a busy menu does not toggle from its summary', async () => {
    const gate = pending<{ ok: true }>();
    vi.mocked(exportQuizFile).mockReturnValueOnce(gate.promise);
    render(<ExportMenu quizId="q1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Файл вікторини' }));
    await screen.findByRole('status');
    const summary = screen.getByText('Експорт');
    expect(fireEvent.click(summary)).toBe(false);
    gate.resolve({ ok: true });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('export error is an alert', async () => {
    vi.mocked(exportQuizFile).mockResolvedValueOnce({ ok: false, error: 'io_media_fetch' });
    render(<ExportMenu quizId="q1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Файл вікторини' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Не вдалося прочитати картинки чи аудіо вікторини.');
  });
});

describe('ImportDialog', () => {
  const file = () => new File(['x'], 'q.quiz');
  const choose = (input: HTMLInputElement, f: File) => fireEvent.change(input, { target: { files: [f] } });
  const input = () => document.querySelector('input[type=file]') as HTMLInputElement;

  it('import dialog has the help button with the import and export entry', () => {
    render(<ImportDialog onClose={vi.fn()} onImported={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Імпорт і експорт' }));
    expect(screen.getByRole('heading', { name: 'Імпорт і експорт' })).toBeTruthy();
  });

  it('the help icon sits in the same flex line as the hint text', () => {
    render(<ImportDialog onClose={vi.fn()} onImported={vi.fn()} />);
    const help = screen.getByRole('button', { name: 'Довідка: Імпорт і експорт' });
    expect(help.classList.contains('io-hint-help')).toBe(true);
    expect(help.parentElement!.classList.contains('io-hint')).toBe(true);
  });

  it('import dialog focus starts on choosing a file', () => {
    render(<ImportDialog onClose={vi.fn()} onImported={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Вибрати файл' }));
  });

  it('Escape closes only the help popup, then the dialog', () => {
    const onClose = vi.fn();
    render(<ImportDialog onClose={onClose} onImported={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Імпорт і експорт' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Імпорт і експорт' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('import dialog picks a file and goes on', async () => {
    const onImported = vi.fn();
    vi.mocked(importQuizFile).mockResolvedValueOnce({ ok: true, id: 'n1' });
    render(<ImportDialog onClose={vi.fn()} onImported={onImported} />);
    expect(screen.getByRole('dialog', { name: 'Імпорт вікторини' })).toBeTruthy();
    expect(input().getAttribute('accept')).toBe('.quiz,.xlsx,.csv');
    const f = file();
    choose(input(), f);
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('n1'));
    expect(importQuizFile).toHaveBeenCalledWith(f, expect.any(Function));
  });

  it('row errors are listed and nothing is opened', async () => {
    const onImported = vi.fn();
    const errors = Array.from({ length: 60 }, (_, i) => ({ row: i + 2, code: 'no_answer' }));
    vi.mocked(importQuizFile).mockResolvedValueOnce({ ok: false, errors } as never);
    render(<ImportDialog onClose={vi.fn()} onImported={onImported} />);
    choose(input(), file());
    expect((await screen.findByText('У таблиці є помилки — нічого не створено:')).getAttribute('role')).toBe('alert');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(50);
    expect(items[0]!.textContent).toBe('Рядок 2: немає правильної відповіді');
    expect(screen.getByText('…і ще 10')).toBeTruthy();
    expect(onImported).not.toHaveBeenCalled();
    vi.mocked(importQuizFile).mockResolvedValueOnce({ ok: true, id: 'n2' });
    choose(input(), file());
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('n2'));
  });

  it('progress and the upload wait', async () => {
    const onClose = vi.fn();
    const gate = pending<{ ok: false; error: string }>();
    vi.mocked(importQuizFile).mockImplementation(async (_f, onProgress) => {
      onProgress({ stage: 'wait' });
      return gate.promise;
    });
    render(<ImportDialog onClose={onClose} onImported={vi.fn()} />);
    choose(input(), file());
    expect((await screen.findByRole('status')).textContent).toBe('Забагато завантажень поспіль — чекаю хвилинку…');
    expect((screen.getByRole('button', { name: 'Закрити' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    gate.resolve({ ok: false, error: 'io_invalid' });
    await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: 'Закрити' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('template button downloads', async () => {
    render(<ImportDialog onClose={vi.fn()} onImported={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Завантажити шаблон' }));
    await waitFor(() => expect(downloadTemplate).toHaveBeenCalledTimes(1));
  });

  it('newer file message', async () => {
    vi.mocked(importQuizFile).mockResolvedValueOnce({ ok: false, error: 'io_newer' });
    render(<ImportDialog onClose={vi.fn()} onImported={vi.fn()} />);
    choose(input(), file());
    expect((await screen.findByRole('alert')).textContent).toBe('Файл з новішої версії додатку. Оновіть сторінку й спробуйте ще раз.');
  });

  it('Escape and close', () => {
    const onClose = vi.fn();
    render(<ImportDialog onClose={onClose} onImported={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
