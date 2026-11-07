import { afterEach, describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';
import { config, proxy } from '../proxy';

const originalApiOnly = process.env.OG_API_ONLY;

afterEach(() => {
  if (originalApiOnly === undefined) {
    delete process.env.OG_API_ONLY;
  } else {
    process.env.OG_API_ONLY = originalApiOnly;
  }
});

function matchProxyPaths(pathnames: string[]): boolean[] {
  const matcher = new RegExp(`^${config.matcher}$`);
  return pathnames.map(pathname => matcher.test(pathname));
}

describe('proxy matcher', () => {
  test('skips API and Next asset paths', () => {
    expect(matchProxyPaths(['/api/og', '/api/custom-key', '/_next/static/app.js'])).toEqual([false, false, false]);
  });

  // The OG routes read fonts and images from disk, so none of public/ has to stay reachable.
  test('keeps frontend paths and public files behind API-only mode', () => {
    expect(matchProxyPaths(['/', '/favicon.ico', '/docs', '/fonts/inter/latin-400-normal.ttf', '/default-bg.jpg'])).toEqual([
      true, true, true, true, true,
    ]);
  });
});

describe('API-only proxy behavior', () => {
  test('returns 404 for frontend routes when API-only mode is enabled', () => {
    process.env.OG_API_ONLY = 'true';

    const response = proxy(new NextRequest('https://example.com/docs'));

    expect(response.status).toBe(404);
  });

  test('allows frontend routes when API-only mode is disabled', () => {
    process.env.OG_API_ONLY = 'false';

    const response = proxy(new NextRequest('https://example.com/docs'));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
