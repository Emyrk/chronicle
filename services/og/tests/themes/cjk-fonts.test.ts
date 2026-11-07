import { afterEach, describe, expect, test, vi } from 'vitest';
import { loadCjkFonts } from '../../app/api/og/themes/cjk-fonts';

const CSS = `@font-face {
  font-family: 'Noto Sans SC';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.cn/l/font?kit=regular) format('truetype');
}
@font-face {
  font-family: 'Noto Sans SC';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.gstatic.cn/l/font?kit=bold) format('truetype');
}`;

// Serves the stylesheet above and an 8-byte font for every file it lists.
function mockGoogleFonts(css: () => Response = () => new Response(CSS)) {
  const requested: URL[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requested.push(url);
    return url.hostname === 'fonts.googleapis.cn' ? css() : new Response(new ArrayBuffer(8));
  }) as typeof fetch);
  return requested;
}

afterEach(() => vi.restoreAllMocks());

describe('loadCjkFonts', () => {
  test('fetches nothing for latin text', async () => {
    const requested = mockGoogleFonts();
    expect(await loadCjkFonts('Hello, world')).toEqual([]);
    expect(requested).toEqual([]);
  });

  test('loads a regular and a bold subset of the CJK characters only', async () => {
    const requested = mockGoogleFonts();
    const fonts = await loadCjkFonts('Next.js 你好，你好');

    expect(requested[0].searchParams.get('family')).toBe('Noto Sans SC:wght@400;700');
    expect(requested[0].searchParams.get('text')).toBe('你好，');
    expect(requested.slice(1).map(url => url.searchParams.get('kit'))).toEqual(['regular', 'bold']);
    expect(fonts.map(font => `${font.name} ${font.weight}`)).toEqual(['Noto Sans SC 400', 'Noto Sans SC 700']);
  });

  test.each([
    ['東京の夜', 'Noto Sans JP'],
    ['서울의 밤', 'Noto Sans KR'],
    ['如何重建', 'Noto Sans SC'],
  ])('%s is set in %s', async (text, family) => {
    const requested = mockGoogleFonts();
    await loadCjkFonts(text);
    expect(requested[0].searchParams.get('family')).toBe(`${family}:wght@400;700`);
  });

  test('leaves the glyphs to next/og when the China domain fails', async () => {
    mockGoogleFonts(() => new Response('unavailable', { status: 503 }));
    expect(await loadCjkFonts('你好')).toEqual([]);
  });
});
