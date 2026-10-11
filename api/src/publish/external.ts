import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * The daily check of collections' outside resources (DM-001 M-21, DES-009 M-7): each URL is asked
 * with HEAD whether it is there and of the declared size. Hashes are checked only at submission
 * (DES-007). A new problem is told to the producer once.
 */

// ---- which addresses may be fetched (DES-009 M-8) ----

/**
 * The same rule as the machine review's `AddressGuard` (validator/…/External.kt, DES-007 J-6):
 * public unicast only. Change both together. IPv4-mapped IPv6 addresses are refused here
 * outright (a name resolves to plain IPv4 anyway).
 */
const INSIDE = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) INSIDE.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  // Not ::ffff:0:0/96: BlockList checks IPv4 addresses against IPv6 rules in that form, so it would refuse them all.
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) INSIDE.addSubnet(net, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:xxxx:xxxx): refused, see above.
  if (family === 6 && /^::ffff:/i.test(address)) return false;
  return !INSIDE.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

// ---- one URL ----

export type UrlCheck = { ok: true } | { ok: false; detail: string };

export interface UrlCheckOptions {
  fetch?: typeof fetch;
  resolve?: (host: string) => Promise<string[]>;
  timeoutMs?: number;
  /** Only for tests against a local server. */
  requireHttps?: boolean;
  allowed?: (address: string) => boolean;
}

const defaultResolve = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address);

/** Whether [url] answers, and with [size] bytes when it says (HEAD; a ranged GET where HEAD isn't allowed, DES-009 未決 No.2). */
export async function checkUrl(url: string, size: number, options: UrlCheckOptions = {}): Promise<UrlCheck> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, detail: 'not a URL' };
  }
  if ((options.requireHttps ?? true) && parsed.protocol !== 'https:') return { ok: false, detail: 'not HTTPS' };
  if (parsed.username || parsed.password) return { ok: false, detail: 'credentials in the URL' };
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : await (options.resolve ?? defaultResolve)(host);
  } catch {
    return { ok: false, detail: `unknown host ${host}` };
  }
  const allowed = options.allowed ?? isPublicAddress;
  if (addresses.length === 0 || !addresses.every(allowed)) return { ok: false, detail: `${host} is not a public address` };

  const fetchImpl = options.fetch ?? fetch;
  const ask = (init: RequestInit) => fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(options.timeoutMs ?? 10_000) });
  try {
    let res = await ask({ method: 'HEAD' });
    if (res.status === 405 || res.status === 501) {
      res = await ask({ method: 'GET', headers: { Range: 'bytes=0-0' } });
      await res.body?.cancel();
      return res.status === 200 || res.status === 206 ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    }
    if (res.status >= 300 && res.status < 400) return { ok: false, detail: `redirect (HTTP ${res.status}) not followed` };
    if (res.status !== 200) return { ok: false, detail: `HTTP ${res.status}` };
    const length = res.headers.get('content-length');
    if (length !== null && Number(length) !== size) return { ok: false, detail: `size ${length}, not ${size}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error && e.name === 'TimeoutError' ? 'timed out' : 'could not reach it' };
  }
}

// ---- the daily run ----

export interface ExternalFailure {
  resourceId: string;
  url: string;
  status: string;
}

/** A listed collection's outside resources, and what the last check found. */
export interface ExternalTarget {
  collectionId: string;
  publisherId: string;
  resources: { resourceId: string; url: string; size: number }[];
  previousFailures: ExternalFailure[];
}

export interface ExternalPorts {
  targets(): Promise<ExternalTarget[]>;
  record(collectionId: string, check: { checkedAt: string; failures: ExternalFailure[] }): Promise<void>;
  /** Tells the producer about resources that newly failed (API-001 C-20). */
  notifyFailures(target: ExternalTarget, failures: ExternalFailure[]): Promise<void>;
  now(): Date;
}

/**
 * Checks every listed collection's outside resources, within [budgetMs] in all (DES-009 未決 No.3:
 * what doesn't fit waits for tomorrow, keeping its last result). A failure here never fails the
 * publication: it ran first.
 */
export async function checkExternalResources(
  ports: ExternalPorts,
  check: (url: string, size: number) => Promise<UrlCheck> = (url, size) => checkUrl(url, size),
  budgetMs = 5 * 60_000,
): Promise<{ checked: number; failed: number; skipped: number }> {
  const started = ports.now().getTime();
  let checked = 0;
  let failed = 0;
  let skipped = 0;
  for (const target of await ports.targets()) {
    if (ports.now().getTime() - started > budgetMs) { skipped++; continue; }
    const failures: ExternalFailure[] = [];
    for (const r of target.resources) {
      const result = await check(r.url, r.size);
      if (!result.ok) failures.push({ resourceId: r.resourceId, url: r.url, status: result.detail });
    }
    await ports.record(target.collectionId, { checkedAt: ports.now().toISOString(), failures });
    const known = new Set(target.previousFailures.map((f) => f.resourceId));
    const fresh = failures.filter((f) => !known.has(f.resourceId));
    if (fresh.length > 0) await ports.notifyFailures(target, fresh);
    checked++;
    if (failures.length > 0) failed++;
  }
  return { checked, failed, skipped };
}
