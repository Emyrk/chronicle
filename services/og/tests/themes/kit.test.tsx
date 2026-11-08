import { afterEach, describe, expect, test, vi } from 'vitest';
import { ImageResponse } from 'next/og';
import {
  ART_SLUGS,
  artImage,
  artSlug,
  chromeParams,
  classColor,
  COLORS,
  Footer,
  formatDuration,
  Header,
  headerLogoImage,
  intParam,
  listParam,
  loadKitFonts,
  markImage,
  param,
  parseColor,
  SANS,
  UNKNOWN_CLASS_COLOR,
  wordmarkImage,
} from '../../app/api/og/themes/kit';
import type { ThemeContext } from '../../app/api/og/themes/types';

const context = (query = ''): ThemeContext => ({ searchParams: new URLSearchParams(query) });
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

// next/og fetches its own wasm from a data: URL; anything else is the network.
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

describe('param', () => {
  test('cleans and caps by code point', () => {
    expect(param(context('guild=%E2%80%9CNightfall%E2%80%9D'), 'guild', 40)).toBe('"Nightfall"');
    expect(param(context(`name=${encodeURIComponent('🔥'.repeat(10))}`), 'name', 4)).toBe('🔥'.repeat(4));
    expect(param(context(), 'missing', 10)).toBe('');
  });

  test('keeps reserved characters that arrive decoded', () => {
    expect(param(context('guild=%3CNightfall%3E%20%26%20Co'), 'guild', 40)).toBe('<Nightfall> & Co');
  });
});

describe('intParam', () => {
  test.each([
    ['n=42', 42],
    ['n=-7', -7],
    ['n=%2012%20', 12],
    ['n=4.5', null],
    ['n=1e3', null],
    ['n=abc', null],
    ['n=', null],
    ['', null],
  ])('reads %s as %s', (query, expected) => {
    expect(intParam(context(query), 'n')).toBe(expected);
  });

  test('clamps to the given range', () => {
    expect(intParam(context('n=250'), 'n', { min: 0, max: 100 })).toBe(100);
    expect(intParam(context('n=-3'), 'n', { min: 0, max: 100 })).toBe(0);
  });
});

describe('listParam', () => {
  test('splits, trims, drops empties and caps items and length', () => {
    const query = `top=${encodeURIComponent('Thalendris:mage:1284, ,Grimtusk:warrior:1201,abcdefghijkl,extra')}`;
    expect(listParam(context(query), 'top', { maxItems: 3, maxLength: 24 })).toEqual([
      'Thalendris:mage:1284',
      'Grimtusk:warrior:1201',
      'abcdefghijkl',
    ]);
    expect(listParam(context(query), 'top', { maxItems: 1, maxLength: 5 })).toEqual(['Thale']);
    expect(listParam(context(), 'top', { maxItems: 3, maxLength: 20 })).toEqual([]);
  });
});

describe('chromeParams', () => {
  test('reads host and product, with a default host', () => {
    expect(chromeParams(context('host=forever.chronicleclassic.com&product=WoW%20Forever'))).toEqual({
      host: 'forever.chronicleclassic.com',
      product: 'WoW Forever',
    });
    expect(chromeParams(context())).toEqual({ host: 'chronicleclassic.com', product: '' });
  });
});

describe('tables', () => {
  test.each([
    ['warrior', '#C79C6E'],
    ['Mage', '#69CCF0'],
    ['rogue', '#FFF569'],
    ['priest', '#FFFFFF'],
    ['warlock', '#9482C9'],
    ['hunter', '#ABD473'],
    ['shaman', '#0070DE'],
    ['PALADIN', '#F58CBA'],
    ['druid', '#FF7D0A'],
    ['deathknight', UNKNOWN_CLASS_COLOR],
    ['constructor', UNKNOWN_CLASS_COLOR],
    ['', UNKNOWN_CLASS_COLOR],
  ])('class %s is %s', (name, color) => {
    expect(classColor(name)).toBe(color);
  });

  test.each([
    [100, '#fbbf24'],
    [99, '#f472b6'],
    [98.9, '#fb923c'],
    [95, '#fb923c'],
    [94, '#c084fc'],
    [75, '#c084fc'],
    [50, '#60a5fa'],
    [25, '#4ade80'],
    [24, '#a1a1aa'],
    [0, '#a1a1aa'],
  ])('parse %s is %s', (score, color) => {
    expect(parseColor(score)).toBe(color);
  });

  test.each([
    [0, '0:00'],
    [9, '0:09'],
    [134, '2:14'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [6720.9, '1:52:00'],
    [-1, ''],
    [Number.NaN, ''],
  ])('duration %s is %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe('art', () => {
  test('slugs instance names', () => {
    expect(artSlug('Molten Core')).toBe('molten-core');
    expect(artSlug("Temple of Ahn'Qiraj")).toBe('temple-of-ahnqiraj');
    expect(artSlug("Onyxia's Lair")).toBe('onyxias-lair');
    expect(artSlug("Zul'Gurub")).toBe('zulgurub');
  });

  test('every slug resolves to a bundled JPEG without a network call', async () => {
    const networkCalls = spyNetwork();
    for (const slug of ART_SLUGS) {
      const src = await artImage(context(`art=${slug}`));
      expect(src?.startsWith('data:image/jpeg;base64,'), slug).toBe(true);
    }
    expect(networkCalls()).toEqual([]);
  });

  test('unknown, missing and path-like slugs are null', async () => {
    const networkCalls = spyNetwork();
    expect(await artImage(context('art=stormwind'))).toBeNull();
    expect(await artImage(context('art=..%2Fdefault-bg'))).toBeNull();
    expect(await artImage(context('art=constructor'))).toBeNull();
    expect(await artImage(context('art=https://example.com/x.jpg'))).toBeNull();
    expect(await artImage(context())).toBeNull();
    expect(networkCalls()).toEqual([]);
  });

  test('logos load as PNG data URLs', async () => {
    expect((await headerLogoImage()).startsWith('data:image/png;base64,')).toBe(true);
    expect((await markImage()).startsWith('data:image/png;base64,')).toBe(true);
    expect((await wordmarkImage()).startsWith('data:image/png;base64,')).toBe(true);
  });
});

describe('chrome', () => {
  test('renders header, footer and art in Satori with no network call', async () => {
    const networkCalls = spyNetwork();
    const ctx = context('art=molten-core&host=forever.chronicleclassic.com');
    const [fonts, logoSrc, art] = await Promise.all([loadKitFonts(ctx), headerLogoImage(), artImage(ctx)]);
    const { host } = chromeParams(ctx);

    const response = new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', background: COLORS.background, fontFamily: SANS, color: COLORS.foreground }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={art!} width={770} height={630} style={{ position: 'absolute', top: 0, left: 430, width: 770, height: 630, objectFit: 'cover' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '50px 64px 42px 72px' }}>
            <Header logoSrc={logoSrc} chip="Raid report · Nov 6" />
            <span style={{ fontSize: 40, color: classColor('mage') }}>Thalendris {formatDuration(134)}</span>
            <Footer host={host} cta="See the full log" />
          </div>
        </div>
      ),
      { width: 1200, height: 630, fonts }
    );
    const png = new Uint8Array(await response.arrayBuffer());
    expect([...png.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(networkCalls()).toEqual([]);
  });
});
