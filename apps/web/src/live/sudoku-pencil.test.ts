// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPencil, pencilAfterWrite, savePencil, sudokuPeers, togglePencil } from './sudoku-pencil';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('togglePencil', () => {
  it('turns a digit on and off and keeps the digits sorted', () => {
    let marks = togglePencil({}, 4, '3');
    marks = togglePencil(marks, 4, '1');
    expect(marks).toEqual({ 4: '13' });
    marks = togglePencil(marks, 4, '3');
    expect(marks).toEqual({ 4: '1' });
    expect(togglePencil(marks, 4, '1')).toEqual({});
  });
});

describe('pencilAfterWrite', () => {
  it('clears its cell and removes the digit from its row, column and box only', () => {
    // Клітинка 7: рядок 1, стовпець 1; блок — рядки 0–1, стовпці 0–2.
    const marks = { 7: '14', 6: '45', 11: '4', 1: '24', 13: '48', 0: '4', 14: '4', 35: '4', 9: '4', 8: '1' };
    const next = pencilAfterWrite(marks, 7, '4');
    expect(next[7]).toBeUndefined();
    expect(next).toEqual({ 6: '5', 13: '8', 1: '2', 14: '4', 35: '4', 8: '1' });
  });

  it('peers are the row, column and 2×3 box', () => {
    const peers = sudokuPeers(7);
    expect(peers).not.toContain(7);
    expect(peers).toContain(6);
    expect(peers).toContain(1);
    expect(peers).toContain(0);
    expect(peers).not.toContain(14);
    expect(peers).not.toContain(35);
  });
});

describe('loadPencil / savePencil', () => {
  it('reads what was saved under the same tag and nothing under another', () => {
    savePencil('ABCD', '0:1:abc', { 3: '25' });
    expect(loadPencil('ABCD', '0:1:abc')).toEqual({ 3: '25' });
    expect(loadPencil('ABCD', '0:2:abc')).toEqual({});
    expect(loadPencil('WXYZ', '0:1:abc')).toEqual({});
  });

  it('broken JSON gives no marks', () => {
    sessionStorage.setItem('quiz:pencil:ABCD', '{oops');
    expect(loadPencil('ABCD', 't')).toEqual({});
  });

  it('a storage that throws does not break', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => savePencil('ABCD', 't', { 1: '2' })).not.toThrow();
  });
});
