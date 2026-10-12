// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Broken(): never {
  throw new Error('crypto.randomUUID is not a function');
}

describe('ErrorBoundary', () => {
  it('shows its children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>усе гаразд</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('усе гаразд')).toBeTruthy();
  });

  it('replaces a crashed page with an explanation and a way to reload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Щось зламалося на цій сторінці.');
    expect(screen.getByRole('button', { name: 'Перезавантажити сторінку' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'На головну' }).getAttribute('href')).toBe('/');
    expect(screen.getByText(/crypto\.randomUUID is not a function/)).toBeTruthy();
  });
});
