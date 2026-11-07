import { describe, expect, test } from 'vitest';
import vectorFile from '../fixtures/og-sig-vectors.json';
import { canonicalOgParams, signOgParams, verifyOgSignature } from '../../app/lib/og-signature';

type Vector = { key: string; params: Record<string, string>; sig: string };
const vectors = vectorFile as unknown as Vector[];

// The same vectors back the Go signer's test (api/og.go, ogImageURL).
describe('shared vectors', () => {
  test.each(vectors)('signs $params.template as $sig', ({ key, params, sig }) => {
    const searchParams = new URLSearchParams(params);
    expect(signOgParams(key, searchParams)).toBe(sig);
    searchParams.set('sig', sig);
    expect(verifyOgSignature(searchParams, key)).toBe(true);
  });
});

describe('canonical form', () => {
  test('sorts keys, uses decoded first values and skips sig', () => {
    const searchParams = new URLSearchParams('b=2&a=x%20y&b=3&sig=zz');
    expect(canonicalOgParams(searchParams)).toBe('a\nx y\nb\n2\n');
  });

  test('ignores param order in the URL', () => {
    const [vector] = vectors;
    const reversed = new URLSearchParams(Object.entries(vector.params).reverse());
    expect(signOgParams(vector.key, reversed)).toBe(vector.sig);
  });
});

describe('verifyOgSignature', () => {
  const [vector] = vectors;
  const signed = (extra: Record<string, string> = {}) =>
    new URLSearchParams({ ...vector.params, sig: vector.sig, ...extra });

  test('accepts anything when no key is set', () => {
    expect(verifyOgSignature(new URLSearchParams('title=hi'), undefined)).toBe(true);
    expect(verifyOgSignature(new URLSearchParams('title=hi'), '')).toBe(true);
  });

  test('rejects a missing, wrong or truncated sig', () => {
    expect(verifyOgSignature(new URLSearchParams(vector.params), vector.key)).toBe(false);
    expect(verifyOgSignature(signed({ sig: '0'.repeat(32) }), vector.key)).toBe(false);
    expect(verifyOgSignature(signed({ sig: vector.sig.slice(0, 31) }), vector.key)).toBe(false);
    expect(verifyOgSignature(signed({ sig: vector.sig.toUpperCase() }), vector.key)).toBe(false);
  });

  test('rejects a tampered or added param', () => {
    expect(verifyOgSignature(signed({ spec: 'Frost' }), vector.key)).toBe(false);
    expect(verifyOgSignature(signed({ title: 'injected' }), vector.key)).toBe(false);
  });

  test('rejects the right sig under another key', () => {
    expect(verifyOgSignature(signed(), 'other-key')).toBe(false);
  });
});
