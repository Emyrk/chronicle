// Fetches caller-supplied images (background, site icon, author avatar) on the
// server so a bad URL can never reach Satori: every hop is checked against
// public-IP rules and connects only to an address that passed them, the
// download is bounded in time and size, and the bytes are sniffed so only
// formats Satori can decode get through. Anything else falls back to "no
// image" instead of failing the whole render.
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

const DNS_TIMEOUT_MS = 2000;
// How long a DoH provider has to itself before the next one is asked as well.
const DNS_HEDGE_MS = 300;
const DNS_CACHE_TTL_MS = 10 * 60 * 1000;
const DNS_CACHE_MAX_ENTRIES = 256;
const FETCH_TIMEOUT_MS = 4000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 3;
// Leaving WebP/AVIF out lets content-negotiating CDNs (Unsplash, Ghost, imgix)
// answer with a format Satori can decode.
const ACCEPT_HEADER = 'image/png,image/jpeg,image/gif,image/svg+xml;q=0.9,*/*;q=0.1';
// node:http sends none, and some image hosts refuse requests without one.
const USER_AGENT = 'ogis (+https://github.com/bunizao/ogis)';

export type RemoteImageRejection =
  | 'missing'
  | 'truncated'
  | 'invalid-url'
  | 'unsupported-protocol'
  | 'credentials'
  | 'unsupported-port'
  | 'blocked-host'
  | 'unresolvable-host'
  | 'non-public-host'
  | 'fetch-failed'
  | 'too-large'
  | 'unsupported-format';

export type RemoteImage = {
  url: string;
  host: string;
  dataUrl: string | null;
  rejection: RemoteImageRejection | null;
};

type HostnameResolver = (hostname: string) => Promise<string[]>;

export type RemoteImageDeps = {
  resolveHostname: HostnameResolver;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
};

type DnsCacheEntry = { expiresAt: number; ips: string[] };

const dnsCache = new Map<string, DnsCacheEntry>();

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value < 0 || value > 255) return null;
    numbers.push(value);
  }
  return numbers;
}

function isPublicIpv4(ip: string): boolean {
  const parts = parseIpv4(ip);
  if (!parts) return false;

  const [a, b, c] = parts;
  if (a === 0) return false;
  if (a === 10) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

function ipv4ToHextets(ip: string): number[] | null {
  const parts = parseIpv4(ip);
  if (!parts) return null;
  return [(parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]];
}

function parseIpv6(ip: string): number[] | null {
  const normalized = ip.toLowerCase();
  if (normalized.includes('%')) return null;

  const pieces = normalized.split('::');
  if (pieces.length > 2) return null;

  const left = pieces[0] ? pieces[0].split(':') : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(':') : [];

  const collect = (parts: string[]) => {
    const hextets: number[] = [];
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!part) return null;

      if (part.includes('.')) {
        if (index !== parts.length - 1) return null;
        const ipv4Hextets = ipv4ToHextets(part);
        if (!ipv4Hextets) return null;
        hextets.push(...ipv4Hextets);
        continue;
      }

      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      hextets.push(parseInt(part, 16));
    }
    return hextets;
  };

  const leftHextets = collect(left);
  const rightHextets = collect(right);
  if (!leftHextets || !rightHextets) return null;

  const total = leftHextets.length + rightHextets.length;
  if (pieces.length === 1) return total === 8 ? leftHextets : null;
  if (total > 8) return null;
  return [...leftHextets, ...new Array(8 - total).fill(0), ...rightHextets];
}

function isPublicIpv6(ip: string): boolean {
  const parts = parseIpv6(ip);
  if (!parts) return false;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = parts;
  if (parts.every(part => part === 0)) return false;
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && h6 === 0 && h7 === 1) {
    return false;
  }
  if ((h0 & 0xfe00) === 0xfc00) return false;
  if ((h0 & 0xffc0) === 0xfe80) return false;
  if ((h0 & 0xff00) === 0xff00) return false;
  if (h0 === 0x2001 && h1 === 0x0db8) return false;
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) {
    const ipv4 = `${h6 >> 8}.${h6 & 0xff}.${h7 >> 8}.${h7 & 0xff}`;
    return isPublicIpv4(ipv4);
  }
  return true;
}

function isPublicIp(ip: string): boolean {
  return isPublicIpv4(ip) || isPublicIpv6(ip);
}

function isBlockedHostname(hostname: string): boolean {
  return !hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local');
}

// Public DNS-over-HTTPS resolvers that all speak Google's JSON API. AliDNS and
// DNSPod answer from mainland China, where dns.google is blocked.
const DOH_RESOLVERS = [
  'https://dns.google/resolve',
  'https://cloudflare-dns.com/dns-query',
  'https://dns.alidns.com/resolve',
  'https://doh.pub/dns-query',
];

// One provider's answer. NXDOMAIN and a name without records of this type are
// answers too; an unreachable provider or a failed lookup (SERVFAIL) throws.
async function queryResolver(
  resolver: string,
  hostname: string,
  recordType: 'A' | 'AAAA',
  signal: AbortSignal
): Promise<string[]> {
  const response = await fetch(`${resolver}?name=${encodeURIComponent(hostname)}&type=${recordType}`, {
    headers: { accept: 'application/dns-json' },
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(DNS_TIMEOUT_MS)]),
  });
  if (!response.ok) throw new Error(`${resolver} answered ${response.status}`);

  const data = (await response.json()) as {
    Status?: number;
    Answer?: { data?: string }[];
  };
  if (data.Status === 3) return [];
  if (data.Status !== 0) throw new Error(`${resolver} failed with status ${data.Status}`);

  const entries = (data.Answer ?? [])
    .map(answer => answer.data)
    .filter((value): value is string => typeof value === 'string');
  return recordType === 'A' ? entries.filter(entry => parseIpv4(entry)) : entries.filter(entry => parseIpv6(entry));
}

// Providers are asked in order. Each gets DNS_HEDGE_MS to itself before the
// next joins in, a failure hands over at once, and the first answer wins. A
// blocked provider costs a fraction of a second instead of a timeout.
async function fetchDnsRecords(hostname: string, recordType: 'A' | 'AAAA'): Promise<string[]> {
  const done = new AbortController();
  const attempts: Promise<string[]>[] = [];
  try {
    for (const resolver of DOH_RESOLVERS) {
      attempts.push(queryResolver(resolver, hostname, recordType, done.signal));
      const headStart = new Promise<null>(resolve => setTimeout(resolve, DNS_HEDGE_MS, null));
      const answer = await Promise.race([Promise.any(attempts), headStart]).catch(() => null);
      if (answer) return answer;
    }
    return await Promise.any(attempts);
  } catch {
    return [];
  } finally {
    done.abort();
  }
}

export async function resolveHostnameOverHttps(hostname: string): Promise<string[]> {
  const now = Date.now();
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiresAt > now) {
    dnsCache.delete(hostname);
    dnsCache.set(hostname, cached);
    return cached.ips;
  }
  if (cached) dnsCache.delete(hostname);

  const [ipv4Records, ipv6Records] = await Promise.all([
    fetchDnsRecords(hostname, 'A'),
    fetchDnsRecords(hostname, 'AAAA'),
  ]);
  const ips = [...ipv4Records, ...ipv6Records];

  if (ips.length > 0) {
    while (dnsCache.size >= DNS_CACHE_MAX_ENTRIES) {
      const oldestHostname = dnsCache.keys().next().value;
      if (!oldestHostname) break;
      dnsCache.delete(oldestHostname);
    }
    dnsCache.set(hostname, { expiresAt: now + DNS_CACHE_TTL_MS, ips });
  }
  return ips;
}

// The socket's own DNS lookup, through the same resolver and public-IP rule as
// the URL check. fetch() would resolve the name again with the system resolver,
// and a hostile DNS server can answer that second lookup with a private address
// (DNS rebinding). Within the cache TTL this returns the very addresses checked.
export function publicOnlyLookup(resolveHostname: HostnameResolver): LookupFunction {
  return (hostname, options, callback) => {
    resolveHostname(normalizeHostname(hostname)).then(
      ips => {
        if (!ips.length || !ips.every(isPublicIp)) {
          callback(new Error(`${hostname} has no public address`), '');
          return;
        }
        const addresses = ips.map(address => ({ address, family: isIP(address) }));
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      },
      error => callback(error, '')
    );
  };
}

// A GET through node:http(s) with the given lookup, wrapped as a fetch Response.
// Redirects come back as they are, like fetch's `redirect: 'manual'`.
export function requestWithLookup(url: string, init: RequestInit, lookup: LookupFunction): Promise<Response> {
  const request = url.startsWith('https:') ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    request(url, { headers: init.headers as Record<string, string>, signal: init.signal ?? undefined, lookup }, response => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const status = response.statusCode ?? 502;
      // @types/node types web streams apart from the DOM ones; at runtime they are the same class.
      const body = status === 204 || status === 304 ? null : (Readable.toWeb(response) as unknown as ReadableStream);
      resolve(new Response(body, { status, headers }));
    })
      .on('error', reject)
      .end();
  });
}

const lookupPublic = publicOnlyLookup(resolveHostnameOverHttps);

// Exported so tests can spy on the transport instead of opening sockets.
export const remoteImageDeps: RemoteImageDeps = {
  resolveHostname: resolveHostnameOverHttps,
  fetch: (url, init) => requestWithLookup(url, init, lookupPublic),
};

type UrlCheck = { url: URL; rejection: null } | { url: null; rejection: RemoteImageRejection };

function reject(rejection: RemoteImageRejection): UrlCheck {
  return { url: null, rejection };
}

export async function checkPublicImageUrl(
  value: string,
  resolveHostname: HostnameResolver = resolveHostnameOverHttps
): Promise<UrlCheck> {
  if (!value) return reject('missing');
  if (value.endsWith('…') || value.endsWith('...') || value.length < 20) {
    return reject('truncated');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return reject('invalid-url');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return reject('unsupported-protocol');
  if (parsed.username || parsed.password) return reject('credentials');
  if (parsed.port && !['80', '443'].includes(parsed.port)) return reject('unsupported-port');

  const hostname = normalizeHostname(parsed.hostname);
  if (isBlockedHostname(hostname)) return reject('blocked-host');
  if (parseIpv4(hostname)) {
    return isPublicIpv4(hostname) ? { url: parsed, rejection: null } : reject('non-public-host');
  }
  if (parseIpv6(hostname)) {
    return isPublicIpv6(hostname) ? { url: parsed, rejection: null } : reject('non-public-host');
  }

  const ips = await resolveHostname(hostname);
  if (!ips.length) return reject('unresolvable-host');
  if (!ips.every(isPublicIp)) return reject('non-public-host');
  return { url: parsed, rejection: null };
}

async function readCapped(body: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// Satori decodes PNG, JPEG, GIF and SVG; trust the bytes, not the URL extension.
export function sniffImageType(bytes: Uint8Array, contentType: string): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';

  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart().toLowerCase();
  if (contentType.includes('image/svg+xml') || head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return 'image/svg+xml';
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function downloadImage(
  url: URL,
  deps: RemoteImageDeps
): Promise<{ dataUrl: string } | { rejection: RemoteImageRejection }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await deps.fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: ACCEPT_HEADER, 'user-agent': USER_AGENT },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return { rejection: 'fetch-failed' };
        // Every redirect target must pass the same public-host checks.
        const next = await checkPublicImageUrl(new URL(location, current).toString(), deps.resolveHostname);
        if (!next.url) return { rejection: next.rejection };
        current = next.url;
        continue;
      }

      if (!response.ok || !response.body) return { rejection: 'fetch-failed' };
      if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
        return { rejection: 'too-large' };
      }

      const bytes = await readCapped(response.body, MAX_IMAGE_BYTES);
      if (!bytes) return { rejection: 'too-large' };

      const type = sniffImageType(bytes, response.headers.get('content-type') ?? '');
      if (!type) return { rejection: 'unsupported-format' };
      return { dataUrl: `data:${type};base64,${toBase64(bytes)}` };
    }
    return { rejection: 'fetch-failed' };
  } catch {
    return { rejection: 'fetch-failed' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadRemoteImage(
  value: string | null,
  deps: RemoteImageDeps = remoteImageDeps
): Promise<RemoteImage> {
  const url = value ?? '';
  const check = await checkPublicImageUrl(url, deps.resolveHostname);
  if (!check.url) return { url, host: '', dataUrl: null, rejection: check.rejection };

  const host = check.url.hostname;
  const result = await downloadImage(check.url, deps);
  if ('rejection' in result) return { url, host, dataUrl: null, rejection: result.rejection };
  return { url, host, dataUrl: result.dataUrl, rejection: null };
}

// Ghost and other CMSes sometimes leave Unsplash query params unencoded, so they
// arrive as top-level params of the OG request. Put them back on the image URL.
export function reconstructImageUrl(searchParams: URLSearchParams): string {
  const rawImage = searchParams.get('image') ?? '';

  let parsed: URL;
  try {
    parsed = new URL(rawImage);
    if (parsed.hostname !== 'images.unsplash.com') return rawImage;
  } catch {
    return rawImage;
  }

  const knownParams = ['crop', 'cs', 'fit', 'fm', 'ixid', 'ixlib', 'q', 'w', 'h'];
  for (const param of knownParams) {
    const value = searchParams.get(param);
    if (value) parsed.searchParams.set(param, value);
  }
  return parsed.toString();
}
