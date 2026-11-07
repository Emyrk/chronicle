import { afterEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

afterEach(() => {
  vi.doUnmock('../../app/api/og/handler');
  vi.resetModules();
});

describe('route wiring', () => {
  test('/api/og forwards request to handleOgGet with legacy key', async () => {
    const calls: Array<{ request: NextRequest; routeKey: string }> = [];
    const response = new Response('ok', { status: 201 });

    vi.doMock('../../app/api/og/handler', () => ({
      handleOgGet: (request: NextRequest, routeKey: string) => {
        calls.push({ request, routeKey });
        return response;
      },
    }));

    const route = await import('../../app/api/og/route');
    const request = new NextRequest('https://example.com/api/og?title=hello');
    const result = await route.GET(request);

    expect(result).toBe(response);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.routeKey).toBe('og');
    expect(calls[0]?.request.url).toBe(request.url);
  });

  test('/api/[ogKey] forwards dynamic key to handleOgGet', async () => {
    const calls: Array<{ request: NextRequest; routeKey: string }> = [];
    const response = new Response('ok', { status: 202 });

    vi.doMock('../../app/api/og/handler', () => ({
      handleOgGet: (request: NextRequest, routeKey: string) => {
        calls.push({ request, routeKey });
        return response;
      },
    }));

    const route = await import('../../app/api/[ogKey]/route');
    const request = new NextRequest('https://example.com/api/custom-key?title=hello');
    const result = await route.GET(request, {
      params: Promise.resolve({ ogKey: 'custom-key' }),
    });

    expect(result).toBe(response);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.routeKey).toBe('custom-key');
    expect(calls[0]?.request.url).toBe(request.url);
  });
});
