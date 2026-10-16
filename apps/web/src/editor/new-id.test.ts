import { afterEach, describe, expect, it } from 'vitest';
import { newQuestion, newQuiz } from './draft';
import { newId } from './new-id';

const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');

/** Як у браузері на звичайному http в локальній мережі: randomUUID там немає. */
function removeRandomUuid() {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
}

afterEach(() => {
  if (original !== undefined) Object.defineProperty(globalThis.crypto, 'randomUUID', original);
});

describe('newId', () => {
  it('gives unique ids that the server accepts as option ids', () => {
    const ids = Array.from({ length: 200 }, newId);
    expect(new Set(ids).size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{32,36}$/);
  });

  it('works where the browser has no crypto.randomUUID', () => {
    removeRandomUuid();
    const ids = Array.from({ length: 200 }, newId);
    expect(new Set(ids).size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('the editor without crypto.randomUUID', () => {
  it('still creates a new quiz and questions of every type', () => {
    removeRandomUuid();
    expect(newQuiz().rounds[0].questions).toHaveLength(1);
    for (const type of ['single', 'multi', 'boolean', 'text', 'numeric', 'order'] as const) {
      expect(newQuestion(type).type).toBe(type);
    }
  });
});
