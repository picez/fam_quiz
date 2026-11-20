import { describe, expect, it, vi } from 'vitest';
import { guardTarget, isPublicAddress, offlineResolve, type CheckResolve } from './url-guard';

const PUBLIC = '93.184.216.34';

describe('isPublicAddress', () => {
  it('rejects loopback, private, link-local, CGNAT, unspecified and multicast, v4 and v6', () => {
    for (const ip of ['127.0.0.1', '127.8.9.10', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.255', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', 'not-an-ip']) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it('accepts public addresses', () => {
    for (const ip of [PUBLIC, '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(isPublicAddress(ip), ip).toBe(true);
  });
});

describe('guardTarget', () => {
  const resolve = vi.fn<CheckResolve>(async (host) => (host === 'intranet.example' ? ['192.168.1.10'] : host === 'mixed.example' ? [PUBLIC, '10.1.1.1'] : [PUBLIC]));

  it('blocks internal literals and names without asking DNS', async () => {
    resolve.mockClear();
    for (const url of ['http://localhost/x.jpg', 'http://LOCALHOST./x.jpg', 'http://db.localhost/x', 'http://printer.local/x', 'http://metadata.google.internal/x', 'http://127.0.0.1/x.jpg', 'http://127.1/x', 'http://2130706433/x', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/x.jpg', 'http://[::1]/x.jpg', 'http://[::ffff:127.0.0.1]/x', 'http://0.0.0.0/x', 'ftp://example.com/x', 'http://example.com:5432/x', 'not a url']) {
      expect(await guardTarget(url, resolve), url).toBe('blocked');
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it('blocks a name that resolves to any internal address', async () => {
    expect(await guardTarget('http://intranet.example/x.jpg', resolve)).toBe('blocked');
    expect(await guardTarget('https://mixed.example/x.jpg', resolve)).toBe('blocked');
  });

  it('lets a public target through', async () => {
    expect(await guardTarget('https://public.example/x.jpg', resolve)).toBe('ok');
    expect(await guardTarget('http://public.example:80/x.jpg', resolve)).toBe('ok');
    expect(await guardTarget(`http://${PUBLIC}/x.jpg`, resolve)).toBe('ok');
  });

  it('a failing resolver is a failure, not a pass', async () => {
    await expect(guardTarget('https://public.example/x.jpg', offlineResolve)).rejects.toThrow('offline');
    await expect(guardTarget('https://public.example/x.jpg', async () => [])).resolves.toBe('blocked');
  });
});
