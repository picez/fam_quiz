type AudioContextClass = new () => AudioContext;

/**
 * Спільний контекст, створений і розблокований жестом (unlockAudio). iOS лишає контекст, створений поза жестом, призупиненим,
 * і resume() поза жестом відмовляє — тож сирена й звуки сцени грають через нього. Його ніколи не закриваємо.
 */
let shared: AudioContext | null = null;
const listeners = new Set<() => void>();

export function audioContextClass(): AudioContextClass | null {
  const scope = globalThis as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** Обіцянка Web Audio (resume, close), що може відхилитися чи бути відсутньою в старому браузері: лише без помилки. */
export function quietly(run: () => unknown): void {
  try {
    void Promise.resolve(run()).catch(() => undefined);
  } catch {
    // Браузер не дозволив — тиша.
  }
}

/** Safari 16.4+: звук як відтворення, тож чути й з перемикачем «без звуку». Інші браузери — нічого. */
export function playbackSession(): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session !== undefined) session.type = 'playback';
  } catch {
    // Немає чи не дозволено — системна поведінка.
  }
}

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // Слухач не ламає решту.
    }
  }
}

/** Чи браузер узагалі вміє Web Audio. */
export function audioSupported(): boolean {
  return audioContextClass() !== null;
}

/** Спільний контекст (або null, поки жест його не створив). */
export function sharedAudio(): AudioContext | null {
  return shared;
}

/** Чи спільний контекст уже грає: тоді жести більше нічого не розблоковують. */
export function audioReady(): boolean {
  return shared !== null && shared.state === 'running';
}

/** Підписка на розблокування й зміну стану спільного контексту (для useSyncExternalStore). */
export function subscribeAudio(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Розблокування звуку (12e, 40) — лише всередині жесту (дотик, клік, клавіша): створює спільний контекст, будить його
 * (resume, якщо не running — iOS призупиняє чи перериває його після фону) і грає тихий буфер з одного семпла, що відмикає звук на iOS.
 */
export function unlockAudio(): void {
  const Context = audioContextClass();
  if (Context === null) return;
  try {
    playbackSession();
    if (shared === null) {
      shared = new Context();
      shared.onstatechange = () => notify();
    }
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
  notify();
}
