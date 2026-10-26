export interface HostTokens {
  hostToken: string;
  stageToken: string;
}

const key = (role: 'host' | 'player' | 'author', code: string) => `quiz:${role}:${code}`;

function read(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(name);
    else localStorage.setItem(name, value);
  } catch {
    // Приватний режим або заповнене сховище: гра працює, але не переживе оновлення сторінки.
  }
}

export const loadPlayer = (code: string): string | null => read(key('player', code));
export const savePlayer = (code: string, token: string): void => write(key('player', code), token);
export const clearPlayer = (code: string): void => write(key('player', code), null);

export const saveHost = (code: string, tokens: HostTokens): void => write(key('host', code), JSON.stringify(tokens));

export function loadHost(code: string): HostTokens | null {
  const raw = read(key('host', code));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { hostToken, stageToken } = parsed as Record<string, unknown>;
    return typeof hostToken === 'string' && typeof stageToken === 'string' ? { hostToken, stageToken } : null;
  } catch {
    return null;
  }
}

/** Токен сцени автора гри без ведучого: є лише на пристрої, з якого створено кімнату. */
export interface AuthorTokens {
  stageToken: string;
}

export const saveAuthor = (code: string, tokens: AuthorTokens): void => write(key('author', code), JSON.stringify(tokens));

export function loadAuthor(code: string): AuthorTokens | null {
  const raw = read(key('author', code));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { stageToken } = parsed as Record<string, unknown>;
    return typeof stageToken === 'string' ? { stageToken } : null;
  } catch {
    return null;
  }
}

const LAST_GAME = 'quiz:last-game';

/** Код гри, яку ведучий запустив останньою з цього пристрою. */
export const loadLastGame = (): string | null => read(LAST_GAME);
export const saveLastGame = (code: string): void => write(LAST_GAME, code);
export const clearLastGame = (): void => write(LAST_GAME, null);
