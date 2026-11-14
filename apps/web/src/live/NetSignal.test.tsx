// @vitest-environment jsdom
// Джерела сторінок читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { NetSignal } from './NetSignal';

afterEach(cleanup);

const source = (file: string) => readFileSync(['apps/web/src/' + file, 'src/' + file].find((path) => existsSync(path) as boolean)!, 'utf8') as string;

describe('NetSignal (32)', () => {
  it('shows «📶 Слабкий зв’язок» as a polite status with the hint for screen readers and in the title', () => {
    render(<NetSignal status="live" quality="weak" />);
    const pill = screen.getByRole('status');
    expect(pill.textContent).toContain('📶');
    expect(pill.textContent).toContain(t('netWeak'));
    expect(pill.getAttribute('aria-live')).toBe('polite');
    expect(pill.getAttribute('title')).toBe(t('netWeakHint'));
    expect(pill.querySelector('.sr-only')?.textContent).toBe(t('netWeakHint'));
  });

  it('is not there on a good connection or while offline', () => {
    render(<NetSignal status="live" quality="good" />);
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    render(<NetSignal status="offline" quality="weak" />);
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    render(<NetSignal status="restarting" quality="weak" />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('the phone and the host draw it, the stage does not', () => {
    expect(source('pages/Play.tsx')).toContain('<NetSignal');
    expect(source('pages/Host.tsx')).toContain('<NetSignal');
    expect(source('pages/Stage.tsx')).not.toContain('NetSignal');
  });
});
