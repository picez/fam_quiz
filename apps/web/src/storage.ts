export interface HostTokens {
  hostToken: string;
  stageToken: string;
}

const key = (role: 'host' | 'player', code: string) => `quiz:${role}:${code}`;

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
