import { afterEach, describe, expect, test, vi } from 'vitest';
import { ImageResponse } from 'next/og';
import { BRAND_TITLE, brandStats, brandTheme, formatCount } from '../../app/api/og/themes/brand';
import { SERIF } from '../../app/api/og/themes/kit';
import type { ThemeContext, ThemeProps } from '../../app/api/og/themes/types';

const context = (query = ''): ThemeContext => ({ searchParams: new URLSearchParams(query) });
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

// The handler's props; the brand card reads only its own params.
const props: ThemeProps = {
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

const FULL =
  'template=brand&title=Every+pull,+every+parse,+every+wipe.&excerpt=Free+raid+log+analysis+for+WoW+Forever' +
  '&stat1=12480:raids+this+month&stat2=1900000:parses+ranked&host=forever.chronicleclassic.com&product=WoW+Forever';

// Every text node and every style in the rendered tree, flattened.
type Node = { type?: unknown; props?: { children?: unknown; style?: React.CSSProperties } };
function walk(node: unknown, visit: (node: Node) => void) {
  if (Array.isArray(node)) return node.forEach(child => walk(child, visit));
  if (!node || typeof node !== 'object') return;
  const { type, props } = node as Node;
  // Expand kit components (Footer) the way Satori does.
  if (typeof type === 'function') return walk(type(props), visit);
  visit(node as Node);
  walk((node as Node).props?.children, visit);
}
async function tree(query: string) {
  const texts: string[] = [];
  const styles: React.CSSProperties[] = [];
  walk(await brandTheme.render(props, context(query)), node => {
    const children = node.props?.children;
    for (const child of [children].flat()) if (typeof child === 'string') texts.push(child);
    if (node.props?.style) styles.push(node.props.style);
  });
  return { texts, styles, titleSize: styles.find(style => style.fontFamily === SERIF)?.fontSize };
}

function spyNetwork() {
  const spy = vi.spyOn(globalThis, 'fetch');
  return () =>
    spy.mock.calls
      .map(([input]) => String(input instanceof Request ? input.url : input))
      .filter(url => !url.startsWith('data:'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('brand stats', () => {
  test('formats counts', () => {
    expect(formatCount('0')).toBe('0');
    expect(formatCount('12480')).toBe('12,480');
    expect(formatCount('99999')).toBe('99,999');
    expect(formatCount('125000')).toBe('125K');
    expect(formatCount('1900000')).toBe('1.9M');
    expect(formatCount('1.9M')).toBe('1.9M');
  });

  test('reads count:label pairs and drops incomplete ones', () => {
    expect(brandStats(context(FULL))).toEqual([
      { value: '12,480', label: 'raids this month' },
      { value: '1.9M', label: 'parses ranked' },
    ]);
    expect(brandStats(context('stat1=12:a:b'))).toEqual([{ value: '12', label: 'a:b' }]);
    expect(brandStats(context('stat1=12&stat2=:label'))).toEqual([]);
    expect(brandStats(context('stat2=5:wipes'))).toEqual([{ value: '5', label: 'wipes' }]);
    expect(brandStats(context())).toEqual([]);
  });
});

describe('brand card', () => {
  test('full params fill every slot', async () => {
    const { texts } = await tree(FULL);
    expect(texts).toEqual(
      expect.arrayContaining([
        BRAND_TITLE,
        'Free raid log analysis for WoW Forever',
        '12,480',
        'raids this month',
        '1.9M',
        'parses ranked',
        'forever.chronicleclassic.com',
        'Upload your first log',
      ])
    );
  });

  test('no params (the signature fallback) draws the defaults and no pill row', async () => {
    const { texts } = await tree('template=brand');
    expect(texts).toEqual([
      BRAND_TITLE,
      'Free raid log analysis for World of Warcraft',
      'chronicleclassic.com',
      'Upload your first log',
    ]);
  });

  test('product without an excerpt names the product', async () => {
    const { texts } = await tree('product=WoW+Forever');
    expect(texts).toContain('Free raid log analysis for WoW Forever');
  });

  test('no stats hides the pill row; one stat draws one pill', async () => {
    expect((await tree('title=Hi')).texts).not.toContain('raids this month');
    const { texts } = await tree('stat2=40:guilds');
    expect(texts).toContain('40');
    expect(texts).toContain('guilds');
  });

  test('the hero stays legible at 400px wide', async () => {
    expect((await tree('')).titleSize).toBe(66);
    const long = 'A much longer headline that keeps on going well past the usual length of a tagline';
    expect((await tree(`title=${encodeURIComponent(long)}`)).titleSize).toBeGreaterThanOrEqual(46);
  });

  test.each([
    ['full', FULL],
    ['empty', ''],
  ])('renders a %s card in Satori with no network call', async (_name, query) => {
    const networkCalls = spyNetwork();
    const ctx = context(query);
    const response = new ImageResponse(await brandTheme.render(props, ctx), {
      width: 1200,
      height: 630,
      fonts: await brandTheme.loadFonts(ctx),
    });
    const png = new Uint8Array(await response.arrayBuffer());
    expect([...png.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(networkCalls()).toEqual([]);
  });
});
