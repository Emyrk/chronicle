import { afterEach, describe, expect, test, vi } from 'vitest';
import { ImageResponse } from 'next/og';
import { themes } from '../../app/api/og/themes';
import { publicImage } from '../../app/api/og/themes/public-files';
import type { ThemeContext, ThemeProps } from '../../app/api/og/themes/types';
import { OG_THEMES } from '../../app/lib/og-themes';

// 4x4 opaque PNG; enough for Satori to decode and lay out every <img>.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNwSJgARwzEcQDpQxMBLJSVHwAAAABJRU5ErkJggg==';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

const context = (query = ''): ThemeContext => ({
  searchParams: new URLSearchParams(query),
});

const minimal: ThemeProps = {
  title: 'Untitled',
  site: 'Blog',
  excerpt: '',
  author: '',
  date: '',
  tag: '',
  readingTime: '',
  accent: null,
  imageSrc: null,
  iconSrc: null,
  avatarSrc: null,
};

const full: ThemeProps = {
  title: 'How we cut our edge render times by sixty percent without touching the renderer at all',
  site: 'buxx.me',
  excerpt: 'Do not go gentle into that good night. Old age should burn and rave at close of day; rage, rage against the dying of the light.',
  author: 'bunizao',
  date: 'Jan 5, 2026',
  tag: 'Engineering',
  readingTime: '5 min read',
  accent: '#3366ff',
  imageSrc: PNG,
  iconSrc: PNG,
  avatarSrc: PNG,
};

let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

function mockFontFetch(handler: (url: string) => Response) {
  const requested: string[] = [];
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    requested.push(url);
    return handler(url);
  }) as typeof fetch);
  return requested;
}

afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = null;
});

describe('theme registry', () => {
  test('every advertised theme has a renderer', () => {
    expect(Object.keys(themes).sort()).toEqual(OG_THEMES.map(theme => theme.key).sort());
  });
});

describe('starfield', () => {
  test.each(['modern'] as const)('%s draws it only when there is no cover', async key => {
    const starfield = await publicImage('default-bg.jpg');
    const tree = async (props: ThemeProps) => JSON.stringify(await themes[key].render(props, context()));

    expect(await tree(minimal)).toContain(starfield);
    expect(await tree({ ...minimal, imageSrc: PNG })).not.toContain(starfield);
  });
});

describe('font loading', () => {
  test.each(Object.keys(themes) as Array<keyof typeof themes>)('%s reads every cut from disk', async key => {
    const requested = mockFontFetch(() => new Response(new ArrayBuffer(8)));
    const fonts = await themes[key].loadFonts(context());

    expect(requested).toEqual([]);
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) expect(font.data.byteLength).toBeGreaterThan(1000);
  });
});

describe('rendering', () => {
  for (const key of Object.keys(themes) as Array<keyof typeof themes>) {
    for (const [label, props] of [
      ['minimal', minimal],
      ['full', full],
    ] as const) {
      test(`${key} renders a PNG with ${label} props`, async () => {
        const response = new ImageResponse(await themes[key].render(props, context()), {
          width: 1200,
          height: 630,
          fonts: await themes[key].loadFonts(context()),
        });
        const bytes = new Uint8Array(await response.arrayBuffer());

        expect(Array.from(bytes.subarray(0, 4))).toEqual(PNG_SIGNATURE);
      });
    }
  }
});
