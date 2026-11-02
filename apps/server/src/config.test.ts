import webpush from 'web-push';
import { describe, expect, it } from 'vitest';
import { adminEmails, baseUrl, proxyTrust, localOrigins, pushKeys, secretProblem } from './config';

describe('secretProblem', () => {
  it('accepts a long random secret', () => {
    expect(secretProblem('9f2c1e7a4b6d8035c1e9f7a2b4d6c8e0a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1')).toBeNull();
  });

  it('refuses the value from .env.example', () => {
    expect(secretProblem('change-me-to-a-long-random-string')).toContain('BETTER_AUTH_SECRET');
  });

  it('refuses a secret shorter than 32 characters', () => {
    expect(secretProblem('abc')).toContain('32');
    expect(secretProblem('x'.repeat(31))).toContain('32');
    expect(secretProblem('x1y2'.repeat(8))).toBeNull();
  });
});

describe('localOrigins', () => {
  it('lists this computer under every address players may use in the local network', () => {
    const interfaces = {
      'Wi-Fi': [
        { address: '192.168.0.10', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false },
      ],
      Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      Ethernet: undefined,
    };
    expect(localOrigins(interfaces, 3000)).toEqual({
      lan: ['http://192.168.0.10:3000'],
      all: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.0.10:3000'],
    });
  });
});

describe('baseUrl', () => {
  it('prefers the configured address', () => {
    expect(baseUrl({ BETTER_AUTH_URL: 'https://quiz.example', RENDER_EXTERNAL_URL: 'https://x.onrender.com' }, 3000)).toBe(
      'https://quiz.example',
    );
  });

  it('falls back to the address Render gives the service', () => {
    expect(baseUrl({ RENDER_EXTERNAL_URL: 'https://fam-quiz.onrender.com' }, 10000)).toBe('https://fam-quiz.onrender.com');
    expect(baseUrl({ BETTER_AUTH_URL: '', RENDER_EXTERNAL_URL: 'https://fam-quiz.onrender.com' }, 10000)).toBe(
      'https://fam-quiz.onrender.com',
    );
  });

  it('uses this computer when nothing is configured', () => {
    expect(baseUrl({}, 3000)).toBe('http://localhost:3000');
  });

  it('drops a trailing slash, which would break the comparison of origins', () => {
    expect(baseUrl({ BETTER_AUTH_URL: 'https://quiz.example/' }, 3000)).toBe('https://quiz.example');
  });
});

describe('proxyTrust', () => {
  it('reads the number of proxies in front of the server', () => {
    expect(proxyTrust('1')).toBe(1);
    expect(proxyTrust('2')).toBe(2);
    expect(proxyTrust('10')).toBe(10);
  });

  it('keeps the old switch and is off by default or for nonsense', () => {
    expect(proxyTrust('true')).toBe(true);
    for (const value of [undefined, '', 'false', '0', '-1', 'yes', '1.5']) expect(proxyTrust(value), String(value)).toBe(false);
  });
});

describe('pushKeys', () => {
  const pair = webpush.generateVAPIDKeys();
  const full = { VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey, VAPID_SUBJECT: 'mailto:owner@example.com' };

  it('is off with none of the three, also when empty', () => {
    expect(pushKeys({})).toEqual({ ok: true, keys: null });
    expect(pushKeys({ VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '' })).toEqual({ ok: true, keys: null });
  });

  it('returns the keys when all three are right', () => {
    expect(pushKeys(full)).toEqual({ ok: true, keys: { publicKey: pair.publicKey, privateKey: pair.privateKey, subject: 'mailto:owner@example.com' } });
    expect(pushKeys({ ...full, VAPID_SUBJECT: 'https://quiz.example.com' }).ok).toBe(true);
  });

  it('trims pasted values (a trailing newline or spaces)', () => {
    const pasted = { VAPID_PUBLIC_KEY: pair.publicKey + '\n', VAPID_PRIVATE_KEY: ' ' + pair.privateKey + '\r\n', VAPID_SUBJECT: 'mailto:owner@example.com\n' };
    expect(pushKeys(pasted)).toEqual({ ok: true, keys: { publicKey: pair.publicKey, privateKey: pair.privateKey, subject: 'mailto:owner@example.com' } });
    expect(pushKeys({ VAPID_PUBLIC_KEY: '\n', VAPID_PRIVATE_KEY: ' ', VAPID_SUBJECT: '' })).toEqual({ ok: true, keys: null });
  });

  it('names the missing variables', () => {
    const result = pushKeys({ VAPID_PUBLIC_KEY: pair.publicKey });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem).toContain('VAPID_PRIVATE_KEY');
      expect(result.problem).toContain('VAPID_SUBJECT');
    }
  });

  it('refuses a subject that is neither mailto: nor https://', () => {
    const result = pushKeys({ ...full, VAPID_SUBJECT: 'owner@example.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain('mailto:');
  });

  it('refuses keys of the wrong length', () => {
    expect(pushKeys({ ...full, VAPID_PUBLIC_KEY: pair.publicKey + 'A' }).ok).toBe(false);
    expect(pushKeys({ ...full, VAPID_PUBLIC_KEY: pair.publicKey.slice(0, 86) }).ok).toBe(false);
    expect(pushKeys({ ...full, VAPID_PRIVATE_KEY: pair.privateKey + 'A' }).ok).toBe(false);
    expect(pushKeys({ ...full, VAPID_PRIVATE_KEY: pair.privateKey.slice(0, 42) }).ok).toBe(false);
  });
});

describe('adminEmails', () => {
  it('splits, trims, lowercases and drops empties', () => {
    expect([...adminEmails({ ADMIN_EMAILS: ' A@Example.com , b@example.com,, ' })].sort()).toEqual(['a@example.com', 'b@example.com']);
  });

  it('is empty without the variable or with only separators', () => {
    expect(adminEmails({}).size).toBe(0);
    expect(adminEmails({ ADMIN_EMAILS: ' , ' }).size).toBe(0);
  });
});
