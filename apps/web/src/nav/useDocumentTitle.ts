import { useEffect } from 'react';
import { documentTitle } from './page-meta';

/**
 * Уточнює заголовок вкладки власною назвою сторінки (назва вікторини, нік): «Географія · Вікторина».
 * null — лишити загальну назву сторінки, яку поставив RouteEffects. Ефект сторінки йде після ефекту RouteEffects.
 */
export function useDocumentTitle(text: string | null): void {
  useEffect(() => {
    if (text !== null && text.trim() !== '') document.title = documentTitle(text.trim());
  }, [text]);
}
