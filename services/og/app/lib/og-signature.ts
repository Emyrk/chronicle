import { createHmac, timingSafeEqual } from 'node:crypto';

// Signed card URLs. The Go server (api/og.go, ogImageURL) signs every image URL
// it writes into a page, so the service only draws text Chronicle vouched for.
// The scheme must match the Go side byte for byte; both test against
// tests/fixtures/og-sig-vectors.json.
//
//   canonical = for each key except `sig`, sorted ascending, first value only:
//               key + "\n" + value + "\n"   (decoded, no URL encoding)
//   sig       = first 32 chars of lowercase hex HMAC-SHA256(key, canonical)

export const SIG_PARAM = 'sig';
const SIG_LENGTH = 32;

export function canonicalOgParams(searchParams: URLSearchParams): string {
  const keys = [...new Set(searchParams.keys())].filter(key => key !== SIG_PARAM);
  // Code-unit order, which equals Go's byte order for the ASCII keys we use.
  keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return keys.map(key => `${key}\n${searchParams.get(key)}\n`).join('');
}

export function signOgParams(key: string, searchParams: URLSearchParams): string {
  return createHmac('sha256', key).update(canonicalOgParams(searchParams)).digest('hex').slice(0, SIG_LENGTH);
}

// True when the request may be rendered as asked: either signing is off (no
// key, e.g. local dev) or `sig` matches.
export function verifyOgSignature(
  searchParams: URLSearchParams,
  key: string | undefined = process.env.OG_SIGNING_KEY
): boolean {
  if (!key) return true;
  const given = Buffer.from(searchParams.get(SIG_PARAM) ?? '');
  const expected = Buffer.from(signOgParams(key, searchParams));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
