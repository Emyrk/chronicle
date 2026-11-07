// Path segments the OG handler answers to under /api/<key>.
//
// `og` is always public: Ghost themes and social crawlers fetch it without any
// server-side signing step. Older versions also offered HMAC-signed endpoints,
// but with `og` public those signatures protected nothing, so they are gone.
// The aliases below only keep previously published URLs working.

type EnvironmentMap = Record<string, string | undefined>;

export const DEFAULT_OG_ROUTE_KEY = 'og';

const ROUTE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

// Reproduces the path older versions derived from OG_SECRET (FNV-style hash).
export function deriveLegacyRouteKey(secret: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < secret.length; i += 1) {
    const c = secret.charCodeAt(i);
    h1 ^= c;
    h2 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hash = `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`.toLowerCase();
  return `og_${hash.slice(0, 12).padEnd(12, '0')}`;
}

export function resolveOgRouteKeys(env: EnvironmentMap = process.env): Set<string> {
  const keys = new Set([DEFAULT_OG_ROUTE_KEY]);

  const customPath = (env.OG_API_PATH ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (ROUTE_KEY_PATTERN.test(customPath)) keys.add(customPath);

  const legacySecret = (env.OG_SECRET ?? '').trim();
  if (legacySecret) keys.add(deriveLegacyRouteKey(legacySecret));

  return keys;
}
