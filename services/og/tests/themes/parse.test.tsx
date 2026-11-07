import { readFile } from 'node:fs/promises';
import { isValidElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ImageResponse } from 'next/og';
import { themes } from '../../app/api/og/themes';
import { classColor, parseColor, UNKNOWN_CLASS_COLOR } from '../../app/api/og/themes/kit';
import { formatMetric, parseCardData } from '../../app/api/og/themes/parse';
import type { ThemeContext, ThemeProps } from '../../app/api/og/themes/types';

const context = (query: string): ThemeContext => ({ searchParams: new URLSearchParams(query) });
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

// The ticket's params contract (#1666).
const FULL = new URLSearchParams({
  template: 'parse',
  player: 'Thalendris',
  class: 'mage',
  spec: 'Fire',
  boss: 'Ragnaros',
  raid: 'Molten Core',
  guild: 'Nightfall',
  product: 'WoW Forever',
  score: '99',
  rank: '3',
  of: '1412',
  metric: 'dps',
  value: '1284.6',
  dur: '134',
  host: 'forever.chronicleclassic.com',
  v: '1',
});

function query(changes: Record<string, string | null>): string {
  const q = new URLSearchParams(FULL);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) q.delete(key);
    else q.set(key, value);
  }
  return q.toString();
}

// What serviceog sends without a parse (none, or below 75): the boss kill, no player.
const BOSS_KILL = new URLSearchParams({
  template: 'parse',
  boss: 'Ragnaros',
  raid: 'Molten Core',
  guild: 'Nightfall',
  product: 'WoW Forever',
  dur: '134',
  top: 'Grimtusk:warrior:1300',
  heal: 'Lightwell:priest:900',
  host: 'forever.chronicleclassic.com',
}).toString();
const HEALER = query({ player: 'Lightwell', class: 'priest', spec: 'Holy', metric: 'hps', value: '900', score: '80', rank: '12', of: '300' });

// Calls function components so the JSON holds the drawn host elements.
function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  if (typeof node.type === 'function') return expand((node.type as (p: unknown) => unknown)(props));
  return { type: node.type, props: { ...props, children: expand(props.children) } };
}

async function tree(q: string): Promise<string> {
  return JSON.stringify(expand(await themes.parse.render({} as ThemeProps, context(q))));
}

function texts(json: string): string[] {
  return [...json.matchAll(/"children":(?:"([^"]*)"|(\d+))/g)].map(m => m[1] ?? m[2]);
}

// next/og fetches its own wasm from a data: URL; anything else is the network.
function spyNetwork() {
  const spy = vi.spyOn(globalThis, 'fetch');
  return () =>
    spy.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input)).filter(url => !url.startsWith('data:'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderPng(q: string): Promise<Uint8Array> {
  const response = new ImageResponse(await themes.parse.render({} as ThemeProps, context(q)), {
    width: 1200,
    height: 630,
    fonts: await themes.parse.loadFonts(context(q)),
  });
  return new Uint8Array(await response.arrayBuffer());
}

describe('parse card', () => {
  test('renders the full contract without touching the network', async () => {
    const network = spyNetwork();
    expect(Array.from((await renderPng(FULL.toString())).subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(network()).toEqual([]);

    const json = await tree(FULL.toString());
    const shown = texts(json);
    for (const text of ['Thalendris', 'Fire Mage · <Nightfall>', 'Ragnaros', 'Molten Core · WoW Forever', '99', 'Parse', '1,284.6', 'DPS', '2:14', 'Kill time', '#3', '/ 1,412', 'Rank', 'Boss parse', 'forever.chronicleclassic.com']) {
      expect(shown).toContain(text);
    }
    // The ring: track + arc in the 99 tier colour; the class bar in mage blue.
    expect(json).toContain('"strokeDasharray"');
    expect(json).toContain(`"stroke":"${parseColor(99)}"`);
    expect(json).toContain(`"width":12,"height":630,"display":"flex","background":"${classColor('mage')}"`);
    expect(shown).not.toContain('#1 in raid');
  });

  test('ring colour follows the score tiers', async () => {
    for (const score of [100, 99, 95, 75]) {
      expect(await tree(query({ score: String(score) }))).toContain(`"stroke":"${parseColor(score)}"`);
    }
  });

  test('fallback: no parse shows the boss kill with its top DPS and HPS', async () => {
    const network = spyNetwork();
    expect(Array.from((await renderPng(BOSS_KILL)).subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(network()).toEqual([]);

    const json = await tree(BOSS_KILL);
    const shown = texts(json);
    for (const text of ['Boss kill', 'Ragnaros', '<Nightfall>', 'Molten Core · WoW Forever', '2:14', 'Kill time', 'Top damage', 'Grimtusk', '1,300', 'dps', 'Top healing', 'Lightwell', '900', 'hps', 'See the full fight']) {
      expect(shown).toContain(text);
    }
    expect(json).not.toContain('strokeDasharray');
    expect(shown).not.toContain('Parse');
    expect(shown).not.toContain('Rank');
  });

  test('fallback: stray player params are ignored without a parse', async () => {
    const shown = texts(await tree(query({ score: null, rank: null, of: null, raidrank: '18', top: 'Grimtusk:warrior:1300' })));
    expect(shown).not.toContain('Thalendris');
    expect(shown).not.toContain('1,284.6');
    expect(shown.some(text => text.includes('in raid'))).toBe(false);
    expect(shown).toContain('Grimtusk');
  });

  test('fallback: a boss kill with no ranked players still renders', async () => {
    const q = 'template=parse&boss=Ragnaros&dur=134';
    const shown = texts(await tree(q));
    expect(shown).toContain('Ragnaros');
    expect(shown).not.toContain('Top damage');
    expect(Array.from((await renderPng(q)).subarray(0, 4))).toEqual(PNG_SIGNATURE);
  });

  test('healers read HPS', async () => {
    expect(Array.from((await renderPng(HEALER)).subarray(0, 4))).toEqual(PNG_SIGNATURE);
    const shown = texts(await tree(HEALER));
    expect(shown).toContain('HPS');
    expect(shown).toContain('900');
    expect(shown).not.toContain('DPS');
  });

  test('unknown class draws the grey bar', async () => {
    const json = await tree(query({ class: 'tinker' }));
    expect(json).toContain(`"background":"${UNKNOWN_CLASS_COLOR}"`);
    expect(json).toContain('Fire Tinker');
    expect(await tree(query({ class: null }))).toContain(`"background":"${UNKNOWN_CLASS_COLOR}"`);
  });

  test('minimal params render', async () => {
    const network = spyNetwork();
    expect(Array.from((await renderPng('player=Solo')).subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(Array.from((await renderPng('')).subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(network()).toEqual([]);
  });

  test('hero text stays legible at 400px wide (>= 46px at 1200)', async () => {
    for (const player of ['Thal', 'Thalendrisxxx', 'Averylongname', 'x'.repeat(20)]) {
      for (const q of [query({ player }), query({ player, score: null })]) {
        const sizes = [...(await tree(q)).matchAll(/"fontSize":(\d+)/g)].map(m => Number(m[1]));
        expect(Math.max(...sizes)).toBeGreaterThanOrEqual(46);
      }
    }
    // The name steps down 96 → 80 → 64, never below 46.
    const nameSize = async (player: string) => Number((await tree(query({ player }))).match(/"fontSize":(\d+),"fontWeight":700,"lineHeight":1.1/)![1]);
    expect(await nameSize('Thalendris')).toBe(96);
    expect(await nameSize('Thalendrisxxxx')).toBe(80);
    expect(await nameSize('x'.repeat(20))).toBe(64);
  });

  test('params are validated', () => {
    expect(formatMetric('1284.6')).toBe('1,284.6');
    expect(formatMetric('900')).toBe('900');
    expect(formatMetric('0')).toBeNull();
    expect(formatMetric('abc')).toBeNull();
    // A rank past the sample, or half a rank, draws no rank.
    expect(parseCardData(context(query({ rank: '5000' }))).rank).toBeNull();
    expect(parseCardData(context(query({ of: null }))).rank).toBeNull();
    expect(parseCardData(context(query({ score: '250' }))).score).toBe(100);
    expect(parseCardData(context(query({ metric: 'HPS' }))).metric).toBe('HPS');
    expect(parseCardData(context(query({ metric: 'nope' }))).metric).toBe('DPS');
  });

  // fonts.googleapis.cn answers with the bundled 月光 subset; every other
  // request (next/og's own Google fallback included) is recorded and refused.
  async function mockFontNetwork() {
    const realFetch = globalThis.fetch;
    const fixture = (weight: number) => readFile(new URL(`../fixtures/noto-sans-sc-yueguang-${weight}.ttf`, import.meta.url));
    const [regular, bold] = await Promise.all([fixture(400), fixture(700)]);
    const css = [400, 700]
      .map(weight => `@font-face { font-weight: ${weight}; src: url(https://fonts.gstatic.cn/l/font?kit=${weight}) format('truetype'); }`)
      .join('\n');
    const hosts: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('data:')) return realFetch(input, init);
      const { hostname, searchParams } = new URL(url);
      hosts.push(hostname);
      if (hostname === 'fonts.googleapis.cn') return new Response(css);
      if (hostname === 'fonts.gstatic.cn') return new Response(new Uint8Array(searchParams.get('kit') === '700' ? bold : regular));
      return new Response('offline', { status: 503 });
    }) as typeof fetch);
    return hosts;
  }

  test.each([
    ['CJK', query({ player: '月光' }), ['fonts.googleapis.cn', 'fonts.gstatic.cn', 'fonts.gstatic.cn']],
    ['Cyrillic', query({ player: 'Лунный', guild: 'Северный' }), []],
  ])('%s names render bold without Google’s main font domains', async (_label, q, expectedHosts) => {
    const hosts = await mockFontNetwork();
    const fonts = await themes.parse.loadFonts(context(q));
    expect(fonts.some(font => !['Inter', 'Libre Baskerville'].includes(font.name) && font.weight === 700)).toBe(true);
    const response = new ImageResponse(await themes.parse.render({} as ThemeProps, context(q)), { width: 1200, height: 630, fonts });
    expect(Array.from(new Uint8Array(await response.arrayBuffer()).subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(hosts.filter(host => host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com')).toEqual([]);
    expect(hosts.sort()).toEqual(expectedHosts);
  });
});
