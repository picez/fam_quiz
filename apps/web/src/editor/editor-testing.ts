import { fireEvent, screen, within } from '@testing-library/react';
import { t } from '../i18n';
import type { QuestionType } from './draft';
import type { EditorTab } from './QuizEditor';

/** The type button (first in scope). */
function typeButton(scope: HTMLElement): HTMLElement {
  const found = within(scope).getAllByRole('button', { name: new RegExp(`^${t('questionType')}:`) });
  return found[0]!;
}

/** Відкриває «Тип запитання» (перший у scope) і вибирає тип за data-value. */
export function chooseType(type: QuestionType, scope: HTMLElement = document.body): void {
  const button = typeButton(scope);
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
  const option = button.parentElement!.querySelector<HTMLElement>(`[role="option"][data-value="${type}"]`);
  if (!option) throw new Error(`Type ${type} is not in the list`);
  fireEvent.click(option);
}

/** Типи в меню (data-value у порядку показу); меню закривається Esc. */
export function typeOptions(scope: HTMLElement = document.body): QuestionType[] {
  const button = typeButton(scope);
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
  const values = [...button.parentElement!.querySelectorAll<HTMLElement>('[role="option"]')].map((el) => el.dataset.value as QuestionType);
  fireEvent.keyDown(button.parentElement!.querySelector('[role="listbox"]') ?? button, { key: 'Escape' });
  return values;
}

/** Текст вибраного типу на кнопці (повна назва type_*). */
export function currentTypeLabel(scope: HTMLElement = document.body): string {
  return typeButton(scope).querySelector('.combo-name')?.textContent ?? '';
}

/** Перемикає вкладку редактора («Загальне» чи «Раунди й запитання») кліком по role="tab". */
export function openTab(tab: EditorTab): void {
  const label = t(tab === 'general' ? 'editorTabGeneral' : 'editorTabRounds');
  const found = screen.getAllByRole('tab').find((el) => el.id === `editor-tab-${tab}` || el.textContent?.includes(label));
  if (!found) throw new Error(`Tab ${tab} is not shown`);
  fireEvent.click(found);
}
