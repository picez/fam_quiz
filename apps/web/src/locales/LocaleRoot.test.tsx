// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { activateLocaleForTests, t } from '../i18n';
import { LocaleRoot } from './LocaleRoot';

afterEach(() => {
  cleanup();
  activateLocaleForTests('uk');
});

function Child() {
  // Стан дитини: після перемонтування він починається знову.
  const [mounted] = useState(() => Math.random());
  return <p data-mounted={mounted}>{t('yes')}</p>;
}

describe('LocaleRoot', () => {
  it('re-renders the tree in the new locale and remounts it', () => {
    render(
      <LocaleRoot>
        <Child />
      </LocaleRoot>,
    );
    const before = screen.getByText(t('yes'));
    const mark = before.getAttribute('data-mounted');
    act(() => activateLocaleForTests('en', { ui: { yes: 'Yes' } }));
    const after = screen.getByText('Yes');
    expect(after.getAttribute('data-mounted')).not.toBe(mark);
  });
});
