import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Ширина до виміру і там, де ResizeObserver немає (jsdom). */
export const FALLBACK_WIDTH = 320;

/** 71: ширина контейнера в цілих px (ResizeObserver); графік малюється в реальних px, а не масштабує viewBox. */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
