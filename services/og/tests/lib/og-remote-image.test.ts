import { afterEach, describe, expect, test, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo, LookupFunction } from 'node:net';
import {
  checkPublicImageUrl,
  loadRemoteImage,
  publicOnlyLookup,
  reconstructImageUrl,
  requestWithLookup,
  resolveHostnameOverHttps,
  sniffImageType,
  type RemoteImageDeps,
} from '../../app/lib/og-remote-image';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP_BYTES = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');

const publicDns = async () => ['93.184.216.34'];

function deps(
  routes: Record<string, () => Response>,
  resolveHostname: RemoteImageDeps['resolveHostname'] = publicDns
): RemoteImageDeps & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    resolveHostname,
    fetch: async url => {
      requested.push(url);
      const route = routes[url];
      if (!route) throw new Error(`unexpected fetch ${url}`);
      return route();
    },
  };
}

describe('checkPublicImageUrl', () => {
  test.each([
    ['', 'missing'],
    ['https://a.co/…', 'truncated'],
    ['ftp://files.example.com/image.png', 'unsupported-protocol'],
    ['https://user:pass@cdn.example.com/a.png', 'credentials'],
    ['https://cdn.example.com:8080/a.png', 'unsupported-port'],
    ['http://localhost/image.png', 'blocked-host'],
    ['http://printer.local/image.png', 'blocked-host'],
    ['http://192.168.1.5/private.png', 'non-public-host'],
    ['http://169.254.169.254/latest/meta-data', 'non-public-host'],
    ['http://[fd00::1]/private.png', 'non-public-host'],
    ['http://[::ffff:127.0.0.1]/private.png', 'non-public-host'],
  ])('rejects %s as %s', async (value, rejection) => {
    const result = await checkPublicImageUrl(value, publicDns);
    expect(result.rejection).toBe(rejection as never);
  });

  test('rejects hostnames that resolve to private addresses', async () => {
    const result = await checkPublicImageUrl('https://internal.example.com/a.png', async () => ['10.0.0.2']);
    expect(result.rejection).toBe('non-public-host');
  });

  test('rejects hostnames that do not resolve', async () => {
    const result = await checkPublicImageUrl('https://nowhere.example.com/a.png', async () => []);
    expect(result.rejection).toBe('unresolvable-host');
  });

  test('accepts public hosts', async () => {
    const result = await checkPublicImageUrl('https://cdn.example.com/hero.png', publicDns);
    expect(result.rejection).toBeNull();
    expect(result.url?.hostname).toBe('cdn.example.com');
  });
});

describe('loadRemoteImage', () => {
  test('returns a data URL typed from the bytes, not the extension', async () => {
    const image = await loadRemoteImage(
      'https://cdn.example.com/photo.jpg',
      deps({ 'https://cdn.example.com/photo.jpg': () => new Response(PNG_BYTES) })
    );

    expect(image.rejection).toBeNull();
    expect(image.host).toBe('cdn.example.com');
    expect(image.dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('rejects formats Satori cannot decode', async () => {
    const image = await loadRemoteImage(
      'https://cdn.example.com/photo.png',
      deps({ 'https://cdn.example.com/photo.png': () => new Response(WEBP_BYTES) })
    );

    expect(image.dataUrl).toBeNull();
    expect(image.rejection).toBe('unsupported-format');
  });

  test('follows redirects to public hosts', async () => {
    const image = await loadRemoteImage(
      'https://github.com/someone.png',
      deps({
        'https://github.com/someone.png': () =>
          new Response(null, { status: 302, headers: { location: 'https://avatars.example.com/u/1' } }),
        'https://avatars.example.com/u/1': () => new Response(PNG_BYTES),
      })
    );

    expect(image.rejection).toBeNull();
    expect(image.dataUrl).not.toBeNull();
  });

  test('refuses to follow a redirect into a private network', async () => {
    const context = deps({
      'https://cdn.example.com/a.png': () =>
        new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/admin.png' } }),
    });
    const image = await loadRemoteImage('https://cdn.example.com/a.png', context);

    expect(image.rejection).toBe('non-public-host');
    expect(context.requested).toEqual(['https://cdn.example.com/a.png']);
  });

  test('rejects oversized responses', async () => {
    const image = await loadRemoteImage(
      'https://cdn.example.com/huge.png',
      deps({
        'https://cdn.example.com/huge.png': () =>
          new Response(PNG_BYTES, { headers: { 'content-length': String(50 * 1024 * 1024) } }),
      })
    );

    expect(image.rejection).toBe('too-large');
  });

  test('turns network errors and bad statuses into fetch-failed', async () => {
    const notFound = await loadRemoteImage(
      'https://cdn.example.com/missing.png',
      deps({ 'https://cdn.example.com/missing.png': () => new Response('nope', { status: 404 }) })
    );
    const thrown = await loadRemoteImage('https://cdn.example.com/boom.png', deps({}));

    expect(notFound.rejection).toBe('fetch-failed');
    expect(thrown.rejection).toBe('fetch-failed');
  });
});

describe('resolveHostnameOverHttps', () => {
  afterEach(() => vi.restoreAllMocks());

  type Provider = (type: string, signal: AbortSignal) => Response | Promise<Response>;

  // Routes each DoH request to its provider by hostname; a provider that isn't
  // listed is unreachable. Returns the providers asked, in order.
  function mockDns(providers: Record<string, Provider>) {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(url.hostname);
      const provider = providers[url.hostname];
      if (!provider) throw new TypeError('fetch failed');
      return provider(url.searchParams.get('type') ?? '', init!.signal!);
    }) as typeof fetch);
    return () => [...new Set(calls)];
  }

  const answers: Provider = type =>
    Response.json({ Status: 0, Answer: type === 'A' ? [{ data: '93.184.216.34' }] : [] });

  test('falls through failing providers to the next one at once', async () => {
    const asked = mockDns({
      'cloudflare-dns.com': () => new Response('busy', { status: 503 }),
      'dns.alidns.com': () => Response.json({ Status: 2 }),
      'doh.pub': answers,
    });
    expect(await resolveHostnameOverHttps('fallback.example.com')).toEqual(['93.184.216.34']);
    expect(asked()).toEqual(['dns.google', 'cloudflare-dns.com', 'dns.alidns.com', 'doh.pub']);
  });

  test('asks the next provider while a slow one is still pending', async () => {
    let abandoned = 0;
    const asked = mockDns({
      'dns.google': (_type, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => {
            abandoned += 1;
            reject(signal.reason);
          })
        ),
      'cloudflare-dns.com': answers,
    });
    expect(await resolveHostnameOverHttps('slow.example.com')).toEqual(['93.184.216.34']);
    expect(asked()).toEqual(['dns.google', 'cloudflare-dns.com']);
    expect(abandoned).toBe(2);
  });

  test('takes NXDOMAIN as the answer', async () => {
    const asked = mockDns({ 'dns.google': () => Response.json({ Status: 3 }) });
    expect(await resolveHostnameOverHttps('missing.example.com')).toEqual([]);
    expect(asked()).toEqual(['dns.google']);
  });

  test('resolves nothing when no provider answers', async () => {
    mockDns({});
    expect(await resolveHostnameOverHttps('offline.example.com')).toEqual([]);
  });
});

describe('connection pinning', () => {
  // Calls the lookup the way net.connect does: with `all` under autoSelectFamily, without otherwise.
  function lookup(ips: string[], all: boolean) {
    return new Promise((resolve, reject) =>
      publicOnlyLookup(async () => ips)('img.example.com', { all }, (error, address, family) =>
        error ? reject(error) : resolve(all ? address : { address, family })
      )
    );
  }

  test('answers with the public addresses the check saw', async () => {
    const ips = ['93.184.216.34', '2606:4700::6810:84e5'];
    expect(await lookup(ips, true)).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700::6810:84e5', family: 6 },
    ]);
    expect(await lookup(ips, false)).toEqual({ address: '93.184.216.34', family: 4 });
  });

  test('refuses a name with any private address', async () => {
    await expect(lookup(['93.184.216.34', '10.0.0.1'], true)).rejects.toThrow('no public address');
    await expect(lookup([], false)).rejects.toThrow('no public address');
  });

  test('stops DNS rebinding between the check and the connection', async () => {
    // Public when the URL is checked, loopback when the socket connects.
    const answers = [['93.184.216.34'], ['127.0.0.1']];
    const rebinding = async () => answers.shift() ?? [];
    const result = await loadRemoteImage('http://rebind.example.com/cover.png', {
      resolveHostname: rebinding,
      fetch: (url, init) => requestWithLookup(url, init, publicOnlyLookup(rebinding)),
    });

    expect(answers).toEqual([]);
    expect(result.rejection).toBe('fetch-failed');
  });

  test('connects to the looked-up address and leaves redirects alone', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/moved') response.writeHead(302, { location: '/cover.png' }).end();
      else response.writeHead(200, { 'content-type': 'image/png' }).end(PNG_BYTES);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://img.example.com:${(server.address() as AddressInfo).port}`;
    const toServer: LookupFunction = (_hostname, options, callback) =>
      options.all ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4);

    try {
      const image = await requestWithLookup(`${base}/cover.png`, {}, toServer);
      expect(image.headers.get('content-type')).toBe('image/png');
      expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG_BYTES);

      const moved = await requestWithLookup(`${base}/moved`, {}, toServer);
      expect(moved.status).toBe(302);
      expect(moved.headers.get('location')).toBe('/cover.png');
    } finally {
      server.close();
    }
  });
});

describe('sniffImageType', () => {
  test('recognises svg by content type or markup', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(sniffImageType(svg, '')).toBe('image/svg+xml');
    expect(sniffImageType(new TextEncoder().encode('<x/>'), 'image/svg+xml')).toBe('image/svg+xml');
    expect(sniffImageType(new TextEncoder().encode('<html>'), 'text/html')).toBeNull();
  });
});

describe('reconstructImageUrl', () => {
  test('moves stray Unsplash params back onto the image URL', () => {
    const params = new URLSearchParams('image=https://images.unsplash.com/photo-1&crop=entropy&q=80&title=Hi');
    expect(reconstructImageUrl(params)).toBe('https://images.unsplash.com/photo-1?crop=entropy&q=80');
  });

  test('leaves other hosts untouched', () => {
    const params = new URLSearchParams('image=https://cdn.example.com/a.png&q=80');
    expect(reconstructImageUrl(params)).toBe('https://cdn.example.com/a.png');
  });
});
