// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { RouteEffects } from './RouteEffects';
import { useDocumentTitle } from './useDocumentTitle';

let go: NavigateFunction = () => undefined;
function Grab() {
  go = useNavigate();
  return null;
}
function Named() {
  useDocumentTitle('Географія');
  return <main><h1>Географія</h1></main>;
}

function app(start: string) {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Grab />
      <RouteEffects />
      <Routes>
        <Route path="/library/:id" element={<Named />} />
        <Route path="*" element={<main><h1>Сторінка</h1></main>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('RouteEffects: tab title (76)', () => {
  it('names the tab after the page', async () => {
    app('/');
    expect(document.title).toBe('Вікторина');
    await act(async () => go('/profile/friends'));
    expect(document.title).toBe('Друзі · Вікторина');
    await act(async () => go('/host/123456'));
    expect(document.title).toBe('Вікторина');
  });

  it('lets a page refine the title with its own name', async () => {
    app('/');
    await act(async () => go('/library/q1'));
    expect(document.title).toBe('Географія · Вікторина');
  });
});
