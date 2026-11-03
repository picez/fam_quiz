// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveMyLocale } from '../api';
import { activateLocaleForTests, t } from '../i18n';
import { applyDocument, resetChoiceForTests } from './choose';
import { currentLocale } from './current';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LocaleRoot } from './LocaleRoot';

const enabled = vi.hoisted(() => ({ list: ['uk', 'en'] as string[] }));

vi.mock('../api', () => ({ saveMyLocale: vi.fn(async () => ({ ok: true })) }));
vi.mock('./locales', async (importOriginal) => {
  const original = await importOriginal<typeof import('./locales')>();
  return {
    ...original,
    get ENABLED_LOCALES() {
      return enabled.list;
    },
    isEnabled: (locale: string) => enabled.list.includes(locale),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetChoiceForTests();
  enabled.list = ['uk', 'en'];
});
afterEach(() => {
  cleanup();
  activateLocaleForTests('uk');
  applyDocument('uk');
});

const select = () => screen.getByLabelText('Мова') as HTMLSelectElement;

describe('LanguageSwitcher', () => {
  it('lists the enabled locales by their own names, each with its lang', () => {
    render(<LanguageSwitcher signedIn={false} />);
    const options = [...select().options];
    expect(options.map((option) => option.textContent)).toEqual(['Українська', 'English']);
    expect(options.map((option) => option.lang)).toEqual(['uk', 'en']);
    expect(select().value).toBe('uk');
  });

  it('is hidden while uk is the only enabled locale', () => {
    enabled.list = ['uk'];
    render(<LanguageSwitcher signedIn />);
    expect(screen.queryByLabelText('Мова')).toBeNull();
  });

  it('saves the choice in the profile for an account', async () => {
    render(<LanguageSwitcher signedIn />);
    fireEvent.change(select(), { target: { value: 'en' } });
    await waitFor(() => expect(currentLocale()).toBe('en'));
    expect(saveMyLocale).toHaveBeenCalledWith('en');
  });

  it('does not call the server for a guest', async () => {
    render(<LanguageSwitcher signedIn={false} />);
    fireEvent.change(select(), { target: { value: 'en' } });
    await waitFor(() => expect(currentLocale()).toBe('en'));
    expect(saveMyLocale).not.toHaveBeenCalled();
  });

  it('keeps the new locale and says so when the profile save fails', async () => {
    vi.mocked(saveMyLocale).mockResolvedValueOnce({ ok: false, error: 'offline' });
    render(<LanguageSwitcher signedIn />);
    fireEvent.change(select(), { target: { value: 'en' } });
    expect(await screen.findByText(t('languageSaveFailed'))).toBeTruthy();
    expect(currentLocale()).toBe('en');
  });

  it('keeps the failure message through the remount on switch', async () => {
    vi.mocked(saveMyLocale).mockResolvedValueOnce({ ok: false, error: 'offline' });
    render(
      <LocaleRoot>
        <LanguageSwitcher signedIn />
      </LocaleRoot>,
    );
    fireEvent.change(select(), { target: { value: 'en' } });
    expect(await screen.findByText(t('languageSaveFailed'))).toBeTruthy();
    expect(select().value).toBe('en');
  });
});
