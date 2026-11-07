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
    const response = await GET(new NextRequest('https://example.com/api/debug?image=https://example.com/a.png'));

    expect(response.status).toBe(404);
  });

  test('explains why each image param was rejected', async () => {
    process.env.OG_ENABLE_DEBUG = 'true';
    const response = await GET(
      new NextRequest(
        'https://example.com/api/debug?image=http://192.168.1.5/private.png&icon=ftp://files.example.com/icon.png'
      )
    );
    const body = (await response.json()) as { image: Described; icon: Described; avatar: Described };

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.image).toEqual({
      url: 'http://192.168.1.5/private.png',
      host: '',
      accepted: false,
      rejection: 'non-public-host',
    });
    expect(body.icon?.rejection).toBe('unsupported-protocol');
    expect(body.avatar).toBeNull();
  });

  test('reports the reconstructed Unsplash URL', async () => {
    process.env.OG_ENABLE_DEBUG = 'true';
    const response = await GET(
      new NextRequest('https://example.com/api/debug?image=http://images.unsplash.com.local/photo-1&q=80')
    );
    const body = (await response.json()) as { image: Described; allParams: Record<string, string> };

    expect(body.image?.rejection).toBe('blocked-host');
    expect(body.allParams.q).toBe('80');
  });
});
