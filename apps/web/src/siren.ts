/** Півперіод сирени: частота доходить від 600 до 1200 Гц (і назад) за стільки секунд. */
const HALF_S = 0.4;
const LOW_HZ = 600;
const HIGH_HZ = 1200;
const VOLUME = 0.2;
/** Наростання й згасання гучності, с: без клацання на початку й у кінці. */
const EDGE_S = 0.02;

type AudioContextClass = new () => AudioContext;

/**
 * Спільний контекст, створений і розблокований жестом (unlockSiren). iOS лишає контекст, створений поза жестом, призупиненим,
 * і resume() поза жестом відмовляє — тож сирена грає через нього. Його ніколи не закриваємо.
 */
let shared: AudioContext | null = null;

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

/** Safari 16.4+: звук як відтворення, тож сирену чути й з перемикачем «без звуку». Інші браузери — нічого. */
function playbackSession(): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session !== undefined) session.type = 'playback';
  } catch {
    // Немає чи не дозволено — системна поведінка.
  }
}

/** Чи спільний контекст уже грає: тоді жести більше нічого не розблоковують. */
export function sirenReady(): boolean {
  return shared !== null && shared.state === 'running';
}

/**
 * Розблокування сирени (12e) — лише всередині жесту (дотик, клік, клавіша): створює спільний контекст, будить його
 * (resume, якщо не running — iOS призупиняє чи перериває його після фону) і грає тихий буфер з одного семпла, що відмикає звук на iOS.
 */
export function unlockSiren(): void {
  const Context = audioContextClass();
  if (Context === null) return;
  try {
    playbackSession();
    if (shared === null) shared = new Context();
    const ctx = shared;
    if (ctx.state !== 'running') quietly(() => ctx.resume());
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, 22050);
    source.connect(ctx.destination);
    source.onended = () => {
      try {
        source.disconnect();
      } catch {
        // Уже від'єднано.
      }
    };
    source.start(0);
  } catch {
    // Браузер не дозволив — сирена спробує власний контекст.
  }
}

/**
 * Сирена тривоги (12e): Web Audio без файлу — пилка через гучність 0,2 (наростання й згасання 0,02 с), частота 600 ↔ 1200 Гц
 * (півперіод 0,4 с) протягом ms, потім stop і від'єднання вузлів. Грає через спільний контекст (unlockSiren), якщо він є;
 * інакше — власний, який потім закривається. Немає AudioContext чи браузер не дозволив — тиша без помилки.
 * Повертає функцію, що зупиняє звук достроково. Власного перемикача звуку в застосунку немає: діє системна гучність пристрою.
 */
export function playSiren(ms: number): () => void {
  const own = shared === null;
  let context: AudioContext | null = shared;
  try {
    if (context === null) {
      const Context = audioContextClass();
      if (Context === null) return () => undefined;
      context = new Context();
    }
    const ctx = context;
    playbackSession();
    // Призупинений контекст будимо до розкладу: час у ньому стоїть, тож розклад від currentTime лишається вірним.
    if (ctx.state !== 'running') quietly(() => ctx.resume());
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sawtooth';
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime;
    const seconds = ms / 1000;
    const end = start + seconds;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(VOLUME, start + EDGE_S);
    gain.gain.setValueAtTime(VOLUME, Math.max(start + EDGE_S, end - EDGE_S));
    gain.gain.linearRampToValueAtTime(0, end);
    oscillator.frequency.setValueAtTime(LOW_HZ, start);
    // Рахунок кроками, а не додаванням: 0,4 · 6 не накопичує похибки за кінцем.
    for (let step = 1; step * HALF_S <= seconds + 1e-9; step += 1) {
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
      if (own) quietly(() => ctx.close());
    }
    return finish;
  } catch {
    const broken = context;
    if (own && broken !== null) quietly(() => broken.close());
    return () => undefined;
  }
}
