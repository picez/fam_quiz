import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/** Адреси імені хоста (57, перевірка вікторини); у тестах — підробка, справжній DNS передає лише main.ts. */
export type CheckResolve = (host: string) => Promise<string[]>;

/** Типовий резолвер без мережі: зовнішня адреса лишається неперевіреною. */
export const offlineResolve: CheckResolve = () => Promise.reject(new Error('offline'));

/** Справжній DNS: усі адреси імені. */
export const systemResolve: CheckResolve = async (host) => (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

const INTERNAL = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  INTERNAL.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  INTERNAL.addSubnet(net, prefix, 'ipv6');
}

const MAPPED_DOTTED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

/** Публічна адреса: не loopback, не приватна, не link-local, не CGNAT, не 0.0.0.0, не multicast (v4, v6 і v4 у v6). */
export function isPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '');
  const kind = isIP(ip);
  if (kind === 0) return false;
  if (kind === 4) return !INTERNAL.check(ip, 'ipv4');
  const dotted = MAPPED_DOTTED.exec(ip);
  if (dotted !== null) return isPublicAddress(dotted[1]!);
  const hex = MAPPED_HEX.exec(ip);
  if (hex !== null) {
    const high = parseInt(hex[1]!, 16);
    const low = parseInt(hex[2]!, 16);
    return isPublicAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return !INTERNAL.check(ip, 'ipv6');
}

const INTERNAL_NAME = /(?:^|\.)(?:localhost|local|internal)$/;

/**
 * Чи можна перевірці (57) ходити за адресою: лише http/https, порт 80/443 чи типовий, без імені й пароля,
 * не внутрішнє ім'я; IP — публічний; ім'я — кожна адреса з DNS публічна. Збій DNS — виняток (адреса неперевірена).
 */
export async function guardTarget(url: string, resolve: CheckResolve): Promise<'ok' | 'blocked'> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'blocked';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'blocked';
  if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') return 'blocked';
  if (parsed.username !== '' || parsed.password !== '') return 'blocked';
  const host = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (host === '' || INTERNAL_NAME.test(host)) return 'blocked';
  if (isIP(host) !== 0) return isPublicAddress(host) ? 'ok' : 'blocked';
  // Прийнятий залишковий ризик (DNS rebinding, огляд 57 п. 6): fetch у main.ts питає DNS удруге сам, тож ім'я з TTL 0
  // може відповісти тут публічною адресою, а там — внутрішньою. Закріпити з'єднання за перевіреною адресою можна лише
  // через undici Agent з connect.lookup, а undici не є прямою залежністю сервера (нову не додаємо). Ризик низький:
  // зовнішні адреси є лише в старих рядках, перевірку запускає тільки адмін, а назад повертається лише статус.
  const addresses = await resolve(host);
  return addresses.length > 0 && addresses.every(isPublicAddress) ? 'ok' : 'blocked';
}
