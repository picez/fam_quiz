// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { EasyModeRoot } from './EasyModeRoot';
import { resetEasyForTests, setEasyMode } from './easy-mode';

const html = () => document.documentElement;
let go: (path: string) => void = () => undefined;

function Nav() {
  const navigate = useNavigate();
  go = (path) => void navigate(path);
  return null;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetEasyForTests();
  html().classList.remove('is-easy');
});

describe('EasyModeRoot (31)', () => {
  it('puts is-easy on <html> when the mode turns on and takes it off on the stage', () => {
    render(
      <MemoryRouter initialEntries={['/play/123456']}>
        <EasyModeRoot />
        <Nav />
      </MemoryRouter>,
    );
    expect(html().classList.contains('is-easy')).toBe(false);
    act(() => setEasyMode(true));
    expect(html().classList.contains('is-easy')).toBe(true);
    act(() => go('/stage/123456'));
    expect(html().classList.contains('is-easy')).toBe(false);
    act(() => go('/'));
    expect(html().classList.contains('is-easy')).toBe(true);
  });
});
