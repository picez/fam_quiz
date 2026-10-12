import { describe, expect, it } from 'vitest';
import { errorText, t } from './i18n';

describe('i18n', () => {
  it('substitutes variables', () => {
    expect(t('answeredOf', { answered: 7, total: 12 })).toBe('Відповіли 7 з 12');
  });

  it('explains known error codes and falls back for unknown ones', () => {
    expect(errorText('nickname_taken')).toBe('Таке ім’я вже зайняте. Виберіть інше.');
    expect(errorText('something_new')).toBe('Щось пішло не так. Спробуйте ще раз.');
  });
});
