/** Півперіод сирени: частота доходить від 600 до 1200 Гц (і назад) за стільки секунд. */
const HALF_S = 0.4;
const LOW_HZ = 600;
const HIGH_HZ = 1200;
const VOLUME = 0.2;

type AudioContextClass = new () => AudioContext;

function audioContextClass(): AudioContextClass | null {
  const scope = globalThis as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** Обіцянка Web Audio (resume, close), що може відхилитися чи бути відсутньою в старому браузері: лише без помилки. */
function quietly(run: () => unknown): void {
  try {
    void Promise.resolve(run()).catch(() => undefined);
  } catch {
    // Браузер не дозволив — тиша.
  }
}

/**
 * Сирена тривоги (12e): Web Audio без файлу — пилка через гучність 0,2, частота 600 ↔ 1200 Гц (півперіод 0,4 с) протягом ms,
 * потім stop і close. Немає AudioContext чи браузер не дозволив — тиша без помилки. Повертає функцію, що зупиняє звук достроково.
 * Власного перемикача звуку в застосунку немає: діє системна гучність пристрою.
 */
export function playSiren(ms: number): () => void {
  const Context = audioContextClass();
  if (Context === null) return () => undefined;
  let context: AudioContext | null = null;
  try {
    context = new Context();
    const ctx = context;
    // Жест у грі вже був (вхід, відповіді), але контекст може стартувати призупиненим.
    if (ctx.state === 'suspended') quietly(() => ctx.resume());
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sawtooth';
    gain.gain.value = VOLUME;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime;
    const end = start + ms / 1000;
    oscillator.frequency.setValueAtTime(LOW_HZ, start);
    // Рахунок кроками, а не додаванням: 0,4 · 6 не накопичує похибки за кінцем.
    for (let step = 1; step * HALF_S <= ms / 1000 + 1e-9; step += 1) {
      oscillator.frequency.linearRampToValueAtTime(step % 2 === 1 ? HIGH_HZ : LOW_HZ, start + step * HALF_S);
    }
    oscillator.start(start);
    oscillator.stop(end);
    let done = false;
    // Таймер, а не onended: у призупиненому контексті час не йде і onended не настав би.
    const timer = setTimeout(() => finish(), ms);
    function finish(): void {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        oscillator.stop();
      } catch {
        // Уже зупинено.
      }
      try {
        oscillator.disconnect();
        gain.disconnect();
      } catch {
        // Вузли вже від'єднано.
      }
      quietly(() => ctx.close());
    }
    return finish;
  } catch {
    const broken = context;
    if (broken !== null) quietly(() => broken.close());
    return () => undefined;
  }
}
