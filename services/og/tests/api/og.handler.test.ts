import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { createElement } from 'react';
import { themes } from '../../app/api/og/themes';
import * as remoteImage from '../../app/lib/og-remote-image';
import type { ThemeContext, ThemeFont, ThemeProps } from '../../app/api/og/themes/types';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const GEIST: ThemeFont = {
  name: 'Geist',
  data: await readFile('public/fonts/geist/latin-400-normal.ttf'),
  weight: 400,
  style: 'normal',
};

const state = {
  renders: [] as Array<{ theme: string; props: ThemeProps; context: ThemeContext }>,
};

// Spy on the real theme objects rather than mocking the module, so the
// handler under test still imports the real registry.
function stubThemes() {
  for (const [theme, definition] of Object.entries(themes)) {
    vi.spyOn(definition, 'loadFonts').mockImplementation(async () => [GEIST]);
    vi.spyOn(definition, 'render').mockImplementation((props, context) => {
      state.renders.push({ theme, props, context });
      return createElement('div', { style: { display: 'flex' } }, props.site);
    });
  }
}

// resolveOgRouteKeys() runs at module load, so env changes need a fresh handler
// instance. Its imports are pinned to the instances this file spies on.
async function loadHandler(env: Record<string, string> = {}) {
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  vi.resetModules();
  vi.doMock('../../app/api/og/themes', () => ({ themes }));
  vi.doMock('../../app/lib/og-remote-image', () => remoteImage);
  return import('../../app/api/og/handler');
}

async function render(url: string, routeKey = 'og', env?: Record<string, string>) {
  const { handleOgGet } = await loadHandler(env);
  const response: Response = await handleOgGet(new NextRequest(url), routeKey);
  return { response, rendered: state.renders.at(-1) };
}

// Public DNS for every host, and a PNG for any image. Returns the global fetch spy.
function mockNetwork() {
  vi.spyOn(remoteImage.remoteImageDeps, 'fetch').mockImplementation(async () => new Response(PNG_BYTES));
  return vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname === 'dns.google') {
      const ips = url.searchParams.get('type') === 'A' ? ['93.184.216.34'] : [];
      return Response.json({ Status: 0, Answer: ips.map(data => ({ data })) });
    }
    return new Response(PNG_BYTES);
  }) as typeof fetch);
}

// PNG stores width and height as big-endian u32s in the IHDR chunk.
async function pngSize(response: Response) {
  const view = new DataView(await response.arrayBuffer());
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

beforeEach(() => {
  state.renders = [];
  delete process.env.OG_API_PATH;
  delete process.env.OG_SECRET;
  stubThemes();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OG_API_PATH;
  delete process.env.OG_SECRET;
});

describe('route keys', () => {
  test('serves the default og path', async () => {
    const { response, rendered } = await render('https://example.com/api/og?title=Hello');
    expect(response.status).toBe(200);
    expect(rendered?.theme).toBe('modern');
  });

  test('returns 404 for unknown paths', async () => {
    const { response } = await render('https://example.com/api/other?title=Hello', 'other');
    expect(response.status).toBe(404);
    expect(state.renders).toHaveLength(0);
  });

  test('serves OG_API_PATH as an alias', async () => {
    const { response } = await render('https://example.com/api/custom?title=Hello', 'custom', {
      OG_API_PATH: 'custom',
    });
    expect(response.status).toBe(200);
  });

  test('keeps legacy OG_SECRET paths working and ignores old signature params', async () => {
    const { response } = await render(
      'https://example.com/api/og_fqc4xxjzrnmx?title=Hello&sig=stale&exp=1',
      'og_fqc4xxjzrnmx',
      { OG_SECRET: 'abc123' }
    );
    expect(response.status).toBe(200);
  });
});

describe('themes', () => {
  test.each(['modern', 'chronicle'])('selects %s when requested', async theme => {
    const { rendered } = await render(`https://example.com/api/og?theme=${theme}`);
    expect(rendered?.theme).toBe(theme);
  });

  test('accepts template as an alias for theme', async () => {
    const { rendered } = await render('https://example.com/api/og?template=chronicle');
    expect(rendered?.theme).toBe('chronicle');
  });

  test('prefers theme over template', async () => {
    const { rendered } = await render('https://example.com/api/og?theme=modern&template=chronicle');
    expect(rendered?.theme).toBe('modern');
  });

  test('falls back to modern for unknown theme names', async () => {
    const { rendered } = await render('https://example.com/api/og?theme=vaporwave');
    expect(rendered?.theme).toBe('modern');
  });
});

describe('text', () => {
  test('uses defaults for missing title and site', async () => {
    const { rendered } = await render('https://example.com/api/og');
    expect(rendered?.props.title).toBe('Untitled');
    expect(rendered?.props.site).toBe('Blog');
    expect(rendered?.props.excerpt).toBe('');
  });

  test('normalizes typographic quotes, dashes, ellipses and odd spaces', async () => {
    const { rendered } = await render(
      'https://example.com/api/og?title=%E2%80%9CHello%E2%80%9D%E2%80%94World%E2%80%A6&site=%E2%80%98My%20Site%E2%80%99&excerpt=Line%E2%80%89Break'
    );
    expect(rendered?.props.title).toBe('"Hello" — World...');
    expect(rendered?.props.site).toBe("'My Site'");
    expect(rendered?.props.excerpt).toBe('Line Break');
  });

  test('keeps single hyphens intact', async () => {
    const { rendered } = await render(
      'https://example.com/api/og?title=state-of-the-art&excerpt=Pause%20%E2%80%94%20resume'
    );
    expect(rendered?.props.title).toBe('state-of-the-art');
    expect(rendered?.props.excerpt).toBe('Pause — resume');
  });

  test('caps long fields by code point without splitting emoji', async () => {
    const title = encodeURIComponent('🚀'.repeat(300));
    const { rendered } = await render(`https://example.com/api/og?title=${title}&tag=${'x'.repeat(100)}`);
    expect(Array.from(rendered?.props.title ?? '')).toHaveLength(200);
    expect(rendered?.props.title.endsWith('🚀')).toBe(true);
    expect(rendered?.props.tag).toHaveLength(40);
  });

  test('passes tag and reading time through', async () => {
    const { rendered } = await render('https://example.com/api/og?tag=Essay&reading=5%20min%20read');
    expect(rendered?.props.tag).toBe('Essay');
    expect(rendered?.props.readingTime).toBe('5 min read');
  });
});

describe('accent', () => {
  test.each([
    ['ff0', '#ffff00'],
    ['%2312ABef', '#12abef'],
    ['red', null],
    ['', null],
  ])('reads %s as %s', async (value, expected) => {
    const { rendered } = await render(`https://example.com/api/og?accent=${value}`);
    expect(rendered?.props.accent).toBe(expected);
  });
});

describe('images', () => {
  test('embeds accepted images as data URLs', async () => {
    mockNetwork();
    const { rendered } = await render(
      'https://example.com/api/og?image=https://cdn.example.com/hero.png&icon=https://cdn.example.com/icon.png&avatar=https://cdn.example.com/me.png'
    );
    expect(rendered?.props.imageSrc?.startsWith('data:image/png;base64,')).toBe(true);
    expect(rendered?.props.iconSrc?.startsWith('data:image/png;base64,')).toBe(true);
    expect(rendered?.props.avatarSrc?.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('drops rejected images and still renders', async () => {
    const { response, rendered } = await render('https://example.com/api/og?image=http://192.168.1.5/p.png');
    expect(response.status).toBe(200);
    expect(rendered?.props.imageSrc).toBeNull();
  });
});

describe('response', () => {
  test('renders a 1200x630 PNG with long-lived CDN caching', async () => {
    const { response } = await render('https://example.com/api/og?title=Hello');
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'
    );
    expect(await pngSize(response)).toEqual({ width: 1200, height: 630 });
  });

  test('fetches CJK glyphs unless the theme draws them itself', async () => {
    const network = mockNetwork();
    const fontHosts = () => network.mock.calls.map(([input]) => new URL(String(input)).hostname);

    await render('https://example.com/api/og?theme=modern&title=%E4%BD%A0%E5%A5%BD');
    expect(fontHosts()).toEqual(['fonts.googleapis.cn']);

    network.mockClear();
    // Neither bundled theme draws CJK itself, so fake one that does.
    themes.modern.coversCjk = () => true;
    try {
      await render('https://example.com/api/og?theme=modern&title=%E4%BD%A0%E5%A5%BD');
    } finally {
      delete themes.modern.coversCjk;
    }
    expect(fontHosts()).toEqual([]);
  });
});
