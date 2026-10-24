// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WordCloud } from './WordCloud';

afterEach(cleanup);

const words = [
  { key: 'київ', text: 'Київ', count: 5 },
  { key: 'каштани', text: 'каштани', count: 1 },
  { key: 'дніпро', text: 'Дніпро', count: 3 },
  { key: 'борщ', text: 'борщ', count: 1 },
];

const size = (container: HTMLElement, text: string) => {
  const word = [...container.querySelectorAll('li')].find((li) => li.textContent === text) as HTMLElement;
  return parseFloat(word.style.fontSize);
};

describe('WordCloud', () => {
  it('a more frequent word is bigger, between 1.25 and 4.5 rem', () => {
    const { container } = render(<WordCloud words={words} />);
    expect(size(container, 'Київ')).toBeGreaterThan(size(container, 'каштани'));
    expect(size(container, 'Київ')).toBeCloseTo(4.5);
    expect(size(container, 'каштани')).toBeCloseTo(1.25);
  });

  it('the order is the same between two renders', () => {
    const order = () => {
      const { container, unmount } = render(<WordCloud words={words} />);
      const list = [...container.querySelectorAll('li')].map((li) => li.textContent);
      unmount();
      return list;
    };
    expect(order()).toEqual(order());
  });

  it('puts the biggest word in the middle', () => {
    const { container } = render(<WordCloud words={words} />);
    const list = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(list.indexOf('Київ')).toBeGreaterThan(0);
    expect(list.indexOf('Київ')).toBeLessThan(list.length - 1);
  });

  it('shrinks the words when there are many', () => {
    const many = Array.from({ length: 40 }, (_, n) => ({ key: `w${n}`, text: `слово${n}`, count: n === 0 ? 5 : 1 }));
    const { container } = render(<WordCloud words={many} />);
    expect(container.querySelector('.word-cloud.is-dense')).not.toBeNull();
    expect(size(container, 'слово0')).toBeLessThan(4.5);
    // Найменше слово лишається читабельним на проєкторі.
    expect(size(container, 'слово1')).toBeGreaterThanOrEqual(1.25);
  });
});
