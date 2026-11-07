import { afterEach, describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../../app/api/debug/route';

const originalDebugFlag = process.env.OG_ENABLE_DEBUG;

afterEach(() => {
  process.env.OG_ENABLE_DEBUG = originalDebugFlag;
});

type Described = { url: string; host: string; accepted: boolean; rejection: string | null } | null;

describe('/api/debug', () => {
  test('returns 404 unless OG_ENABLE_DEBUG=true', async () => {
    process.env.OG_ENABLE_DEBUG = 'false';
    const response = await GET(new NextRequest('https://example.com/api/debug?icon=https://example.com/a.png'));

    expect(response.status).toBe(404);
  });

  test('explains why the icon was rejected', async () => {
    process.env.OG_ENABLE_DEBUG = 'true';
    const response = await GET(new NextRequest('https://example.com/api/debug?icon=http://192.168.1.5/private.png&q=80'));
    const body = (await response.json()) as { icon: Described; allParams: Record<string, string> };

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.icon).toEqual({
      url: 'http://192.168.1.5/private.png',
      host: '',
      accepted: false,
      rejection: 'non-public-host',
    });
    expect(body.allParams.q).toBe('80');
  });

  test('reports a protocol rejection, and no icon when none is given', async () => {
    process.env.OG_ENABLE_DEBUG = 'true';
    const rejected = (await (await GET(new NextRequest('https://example.com/api/debug?icon=ftp://files.example.com/icon.png'))).json()) as { icon: Described };
    expect(rejected.icon?.rejection).toBe('unsupported-protocol');

    const none = (await (await GET(new NextRequest('https://example.com/api/debug?image=https://example.com/a.png'))).json()) as { icon: Described };
    expect(none.icon).toBeNull();
  });
});
