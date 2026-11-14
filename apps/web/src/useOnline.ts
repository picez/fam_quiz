import { useEffect, useState } from 'react';

const read = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

/** Чи є в пристрою мережа (32): navigator.onLine і події online/offline. «Є мережа» ще не означає, що сервер доступний. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(read);
  useEffect(() => {
    const update = () => setOnline(read());
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
