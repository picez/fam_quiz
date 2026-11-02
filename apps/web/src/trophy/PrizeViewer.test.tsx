// @vitest-environment jsdom
// Vitest підміняє CSS порожнім рядком, тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrizeContent } from '@quiz/shared';
import { PrizeViewer, canViewPrize, prizeViewLabel } from './PrizeViewer';

vi.mock('./TrophyView', () => ({
  TrophyView: (props: { size: string; interactive: boolean }) => <span className="trophy-mock" data-size={props.size} data-interactive={String(props.interactive)} />,
}));

afterEach(cleanup);

type Content = Omit<PrizeContent, 'name'>;
const content = (over: Partial<Content> = {}): Content => ({
  trophy: { kind: 'cup', material: 'gold' },
  engraving: 'Чемпіон 2026',
  real: null,
  title: null,
  diploma: false,
  ...over,
});

function Harness({ value }: { value: Content }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Відкрити
      </button>
      <button type="button">Інша</button>
      {open && <PrizeViewer content={value} place={1} onClose={() => setOpen(false)} />}
    </>
  );
}

describe('canViewPrize', () => {
  it('is true for a photo or a trophy, false otherwise', () => {
    expect(canViewPrize(content())).toBe(true);
    expect(canViewPrize(content({ trophy: null, real: { text: 'Піца', photoUrl: 'https://img/x.jpg' } }))).toBe(true);
    expect(canViewPrize(content({ trophy: null, real: { text: 'Піца', photoUrl: null } }))).toBe(false);
    expect(canViewPrize(content({ trophy: null }))).toBe(false);
  });
});

describe('prizeViewLabel', () => {
  it('names the trophy kind, and «Приз» for a photo alone', () => {
    const named = (['cup', 'medal', 'crown', 'star', 'statuette'] as const).map((kind) => prizeViewLabel(content({ trophy: { kind, material: 'gold' } })));
    expect(named).toEqual(['Кубок', 'Медаль', 'Корона', 'Зірка', 'Статуетка']);
    expect(prizeViewLabel(content({ trophy: null, real: { text: 'Піца', photoUrl: 'https://img/x.jpg' } }))).toBe('Приз');
  });
});

describe('PrizeViewer', () => {
  it('locks the page scroll and makes the app root inert while open, and restores both on close', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    document.body.style.overflow = 'clip';
    const { unmount } = render(<PrizeViewer content={content()} place={1} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    expect(root.hasAttribute('inert')).toBe(true);
    // Сам діалог поза #root — не inert.
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull();
    unmount();
    expect(document.body.style.overflow).toBe('clip');
    expect(root.hasAttribute('inert')).toBe(false);
    document.body.style.overflow = '';
    root.remove();
  });

  it('a root that was already inert stays inert after close', () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('inert', '');
    document.body.append(root);
    const { unmount } = render(<PrizeViewer content={content()} place={1} onClose={() => {}} />);
    unmount();
    expect(root.hasAttribute('inert')).toBe(true);
    root.remove();
  });

  it('the focus trap includes the 3D model-viewer', () => {
    render(<PrizeViewer content={content()} place={1} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const viewer = document.createElement('model-viewer');
    dialog.append(viewer);
    const close = screen.getByRole('button', { name: 'Закрити' });
    // × перший, model-viewer (без власного tabindex) останній: Shift+Tab з × веде на нього.
    const focus = vi.spyOn(viewer, 'focus');
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(focus).toHaveBeenCalled();
  });

  it('a modal dialog with the photo large, the engraving, the caption and the title', () => {
    const value = content({ real: { text: 'Кубок з гравіюванням', photoUrl: 'https://img/cup.jpg' }, title: 'Король' });
    render(<PrizeViewer content={value} place={2} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Приз за 2 місце' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const img = dialog.querySelector('img.prize-view-photo') as HTMLImageElement;
    expect(img.src).toBe('https://img/cup.jpg');
    expect(img.alt).toBe('Кубок з гравіюванням');
    // Фото є — 3D-трофей не потрібен.
    expect(dialog.querySelector('.trophy-mock')).toBeNull();
    expect(dialog.textContent).toContain('Чемпіон 2026');
    expect(dialog.textContent).toContain('🎁 Кубок з гравіюванням');
    expect(dialog.textContent).toContain('👑 Король');
  });

  it('without a photo shows the 3D trophy large and rotatable', () => {
    render(<PrizeViewer content={content()} place={1} onClose={() => {}} />);
    const trophy = screen.getByRole('dialog').querySelector('.trophy-mock')!;
    expect(trophy.getAttribute('data-size')).toBe('view');
    expect(trophy.getAttribute('data-interactive')).toBe('true');
    expect(screen.getByRole('dialog').textContent).toContain('Чемпіон 2026');
  });

  it('closes on ×, on Escape and on a backdrop tap, but not on a tap inside', () => {
    const onClose = vi.fn();
    render(<PrizeViewer content={content()} place={1} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(document.querySelector('.prize-view-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('takes focus to ×, keeps Tab inside and gives focus back to the opener', () => {
    render(<Harness value={content()} />);
    const opener = screen.getByRole('button', { name: 'Відкрити' });
    opener.focus();
    fireEvent.click(opener);
    const close = screen.getByRole('button', { name: 'Закрити' });
    expect(document.activeElement).toBe(close);
    // Одна кнопка в діалозі: Tab і Shift+Tab лишаються на ній.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('styles: the photo fits the viewport, × is at least 44 px, the box never overflows 375 px', () => {
    const path = ['src/styles.css', 'apps/web/src/styles.css'].find((p) => existsSync(p))!;
    const css = readFileSync(path, 'utf8') as string;
    const rule = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf('}', at));
    };
    expect(rule('.prize-view-photo')).toContain('object-fit: contain');
    expect(rule('.prize-view-photo')).toMatch(/max-height: \S*vh/);
    expect(rule('.prize-view-close')).toContain('min-width: 44px');
    expect(rule('.prize-view-close')).toContain('min-height: 44px');
    expect(rule('.prize-view')).toMatch(/max-width: (calc\(100vw|min\(|100%)/);
    expect(rule('.trophy-view')).toContain('width:');
  });
});
