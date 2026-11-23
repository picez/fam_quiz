import { useEffect, type RefObject } from 'react';

/** Закриття по Esc і по pointerdown поза root, поки open. */
export function useDismiss(root: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: Event) => {
      const node = root.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [root, open, onClose]);
}
