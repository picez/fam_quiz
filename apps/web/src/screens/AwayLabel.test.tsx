// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AwayLabel } from './AwayLabel';

afterEach(cleanup);

describe('AwayLabel', () => {
  it('hides the 🙈 from screen readers and keeps the words', () => {
    const { container } = render(
      <p>
        <AwayLabel text="🙈 Оля: поза грою 4 с (1 раз)" />
      </p>,
    );
    expect(container.textContent).toBe('🙈 Оля: поза грою 4 с (1 раз)');
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('🙈');
  });

  it('a text without the emoji stays as it is', () => {
    const { container } = render(
      <p>
        <AwayLabel text="" />
      </p>,
    );
    expect(container.textContent).toBe('');
    expect(container.querySelector('[aria-hidden]')).toBeNull();
  });
});
