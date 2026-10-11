import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkExternalResources, checkUrl, isPublicAddress, type ExternalFailure, type ExternalPorts, type ExternalTarget } from '../src/publish/external.js';

// DES-009 M-7・M-8: the daily check of outside resources, and the addresses it never reads.

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(200, { 'content-length': '5000' }); res.end(req.method === 'HEAD' ? undefined : Buffer.alloc(5000)); return; }
    if (req.url === '/moved') { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }); res.end(); return; }
    if (req.url === '/no-head') {
      if (req.method === 'HEAD') { res.writeHead(405); res.end(); return; }
      res.writeHead(req.headers.range === 'bytes=0-0' ? 206 : 200); res.end('x'); return;
    }
    if (req.url === '/slow') { setTimeout(() => { res.writeHead(200); res.end(); }, 3000); return; }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

/** Only for these tests: plain HTTP on loopback, which the real check never allows. */
const local = { requireHttps: false, allowed: () => true, timeoutMs: 1000 };

describe('the address rule (the same as the machine review’s, DES-007 J-6)', () => {
  it('refuses every inside and special address, and passes public ones', () => {
    const refused = [
      '127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1',
      '192.0.0.8', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::1', 'fe80::1', 'fd00::1', 'ff02::1',
      '::ffff:10.0.0.1', '64:ff9b::a00:1', '2001:db8::1',
    ];
    for (const a of refused) expect(isPublicAddress(a), a).toBe(false);
    for (const a of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) expect(isPublicAddress(a), a).toBe(true);
    expect(isPublicAddress('not an address')).toBe(false);
  });
});

describe('checking one URL', () => {
  it('accepts a resource of the declared size, and HEAD-less servers by a one-byte GET', async () => {
    expect(await checkUrl(`${base}/ok`, 5000, local)).toEqual({ ok: true });
    expect(await checkUrl(`${base}/no-head`, 5000, local)).toEqual({ ok: true });
  });

  it('reports another size, a missing or slow resource, and never follows a redirect', async () => {
    expect(await checkUrl(`${base}/ok`, 4096, local)).toEqual({ ok: false, detail: 'size 5000, not 4096' });
    expect(await checkUrl(`${base}/missing`, 1, local)).toEqual({ ok: false, detail: 'HTTP 404' });
    expect(await checkUrl(`${base}/slow`, 1, local)).toEqual({ ok: false, detail: 'timed out' });
    expect(await checkUrl(`${base}/moved`, 1, local)).toEqual({ ok: false, detail: 'redirect (HTTP 302) not followed' });
  });

  it('reads only HTTPS from public addresses', async () => {
    expect(await checkUrl(`${base}/ok`, 5000)).toEqual({ ok: false, detail: 'not HTTPS' });
    expect(await checkUrl('https://127.0.0.1/ok', 1)).toEqual({ ok: false, detail: '127.0.0.1 is not a public address' });
    expect(await checkUrl('https://user:pass@example.com/x', 1)).toEqual({ ok: false, detail: 'credentials in the URL' });
    // A name that resolves inside is refused before connecting.
    expect(await checkUrl('https://cdn.example.com/n.ogg', 1, { resolve: async () => ['10.0.0.5'] })).toEqual({ ok: false, detail: 'cdn.example.com is not a public address' });
  });
});

describe('the daily run', () => {
  function ports(targets: ExternalTarget[]) {
    const recorded = new Map<string, ExternalFailure[]>();
    const told: [string, string[]][] = [];
    let clock = 0;
    const p: ExternalPorts = {
      targets: async () => targets,
      record: async (id, check) => void recorded.set(id, check.failures),
      notifyFailures: async (t, failures) => void told.push([t.collectionId, failures.map((f) => f.resourceId)]),
      now: () => new Date(clock += 1000),
    };
    return { p, recorded, told };
  }

  const target = (id: string, previous: string[] = []): ExternalTarget => ({
    collectionId: id, publisherId: 'PUB',
    resources: [{ resourceId: 'a', url: 'https://cdn.example.com/a', size: 1 }, { resourceId: 'b', url: 'https://cdn.example.com/b', size: 1 }],
    previousFailures: previous.map((r) => ({ resourceId: r, url: '', status: 'HTTP 404' })),
  });

  it('records every result and tells the producer only of new failures', async () => {
    const { p, recorded, told } = ports([target('first'), target('second', ['b'])]);
    const result = await checkExternalResources(p, async (url) => (url.endsWith('/b') ? { ok: false, detail: 'HTTP 404' } : { ok: true }));
    expect(result).toEqual({ checked: 2, failed: 2, skipped: 0 });
    expect(recorded.get('first')).toEqual([{ resourceId: 'b', url: 'https://cdn.example.com/b', status: 'HTTP 404' }]);
    // "second" already failed on b yesterday: no second mail.
    expect(told).toEqual([['first', ['b']]]);
  });

  it('leaves what doesn’t fit in its time for the next day', async () => {
    const { p, recorded } = ports([target('first'), target('second'), target('third')]);
    const result = await checkExternalResources(p, async () => ({ ok: true }), 2500);
    expect(result.skipped).toBeGreaterThan(0);
    expect(recorded.has('third')).toBe(false);
  });
});
