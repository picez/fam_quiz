// @vitest-environment jsdom
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { diplomaFileName, diplomaLines, shareDiploma, type DiplomaData } from './diploma';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const data: DiplomaData = {
  nickname: 'Оля',
  place: 1,
  quizTitle: 'Новорічна вікторина',
  date: new Date('2026-12-31T22:30:00Z'),
  engraving: 'Чемпіон 2026',
  trophy: { kind: 'cup', material: 'gold' },
};

describe('diplomaLines', () => {
  it('lists the lines top to bottom with the Kyiv date', () => {
    expect(diplomaLines(data)).toEqual(['Диплом', 'Оля', '1 місце', 'Новорічна вікторина', 'Чемпіон 2026', '01.01.2027']);
  });

  it('has no engraving line without an engraving', () => {
    expect(diplomaLines({ ...data, engraving: null, place: 3, trophy: null })).toEqual([
      'Диплом',
      'Оля',
      '3 місце',
      'Новорічна вікторина',
      '01.01.2027',
    ]);
  });
});

describe('diplomaFileName', () => {
  it('keeps letters and digits and turns the rest into dashes', () => {
    expect(diplomaFileName('Оля Петрівна!')).toBe('dyplom-Оля-Петрівна.png');
    expect(diplomaFileName('  Max_2026  ')).toBe('dyplom-Max-2026.png');
  });
});

describe('shareDiploma', () => {
  const blob = new Blob(['png'], { type: 'image/png' });

  it('shares the file when the browser can', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await shareDiploma(blob, 'dyplom-Оля.png')).toBe('shared');
    const files = (share.mock.calls[0]![0] as { files: File[] }).files;
    expect(files[0]!.name).toBe('dyplom-Оля.png');
    expect(files[0]!.type).toBe('image/png');
  });

  it('downloads through a link without canShare', async () => {
    vi.stubGlobal('navigator', {});
    const created = vi.fn(() => 'blob:diploma');
    const revoked = vi.fn();
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = created;
    URL.revokeObjectURL = revoked;
    onTestFinished(() => {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('dyplom-Оля.png');
      expect(this.href).toBe('blob:diploma');
    });
    expect(await shareDiploma(blob, 'dyplom-Оля.png')).toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('treats a cancelled share as shared, not an error', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'));
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await shareDiploma(blob, 'dyplom-Оля.png')).toBe('shared');
  });
});
