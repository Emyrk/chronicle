import { readFile } from 'node:fs/promises';
import { isValidElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ImageResponse } from 'next/og';
import { themes } from '../../app/api/og/themes';
import { formatDelta, labelledSplits, splitEntries } from '../../app/api/og/themes/clear';
import type { ThemeContext, ThemeProps } from '../../app/api/og/themes/types';

const context = (query: string): ThemeContext => ({ searchParams: new URLSearchParams(query) });
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

// The ticket's params contract (#1668).
const FULL = new URLSearchParams({
  template: 'clear',
  guild: 'Nightfall',
  raid: 'Molten Core',
  realm: 'Nordanaar',
  product: 'WoW Forever',
  ms: '2092000',
  score: '98',
  rank: '6',
  of: '318',
  realmrank: '1',
  delta: '-64',
  wipes: '0',
  players: '40',
  splits: 'Lucifron:212,Magmadar:188,Gehennas:141,Garr:236,Shazzrah:120,Geddon:195,Sulfuron:160,Golemagg:244,Majordomo:301,Ragnaros:295',
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

// Calls function components so the JSON holds the drawn host elements.
function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  if (typeof node.type === 'function') return expand((node.type as (p: unknown) => unknown)(props));
  return { type: node.type, props: { ...props, children: expand(props.children) } };
}

async function tree(q: string): Promise<string> {
  return JSON.stringify(expand(await themes.clear.render({} as ThemeProps, context(q))));
}

function texts(json: string): string[] {
  return [...json.matchAll(/"children":(?:"([^"]*)"|(\d+))/g)].map(m => m[1] ?? m[2]);
}

function spyNetwork() {
  const spy = vi.spyOn(globalThis, 'fetch');
  return () =>
    spy.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input)).filter(url => !url.startsWith('data:'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderPng(q: string): Promise<Uint8Array> {
  const response = new ImageResponse(await themes.clear.render({} as ThemeProps, context(q)), {
    width: 1200,
    height: 630,
    fonts: await themes.clear.loadFonts(context(q)),
  });
  return new Uint8Array(await response.arrayBuffer());
}

describe('clear card', () => {
  test('renders the full contract without touching the network', async () => {
    const network = spyNetwork();
    const bytes = await renderPng(FULL.toString());
    expect(Array.from(bytes.subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(network()).toEqual([]);

    const json = await tree(FULL.toString());
    const shown = texts(json);
    for (const text of [
      'Speedrun · Molten Core',
      '34:52',
      '#1 on Nordanaar',
      'Faster than 98% of 318 clears',
      '−1:04 vs. previous record',
      '<Nightfall>',
      'WoW Forever · 10 bosses · 0 wipes · 40 raiders',
      'Ragnaros',
      'forever.chronicleclassic.com/leaderboards/speedruns',
      'Can your guild beat it?',
    ]) {
      expect(shown).toContain(text);
    }
    expect(json).toContain('"fontSize":200');
  });

  test('more than 8 splits labels every other boss, ending on the last', async () => {
    const shown = texts(await tree(FULL.toString()));
    for (const name of ['Magmadar', 'Garr', 'Geddon', 'Golemagg', 'Ragnaros']) expect(shown).toContain(name);
    for (const name of ['Lucifron', 'Gehennas', 'Shazzrah', 'Sulfuron', 'Majordomo']) expect(shown).not.toContain(name);

    const eight = 'A:10,B:10,C:10,D:10,E:10,F:10,G:10,H:10';
    const all = texts(await tree(query({ splits: eight })));
    for (const name of 'ABCDEFGH') expect(all).toContain(name);
  });

  test('split segments grow with their duration', async () => {
    const json = await tree(query({ splits: 'Onyxia:300,Extra:100' }));
    expect(json).toContain('"flexGrow":300');
    expect(json).toContain('"flexGrow":100');
  });

  test('fallback: no realm rank shows the Top N% pill and the server rank', async () => {
    const network = spyNetwork();
    const q = query({ realmrank: null, delta: null });
    const shown = texts(await tree(q));
    expect(shown).toContain('Top 2%');
    expect(shown).toContain('#6 of 318 clears');
    expect(shown).not.toContain('#1 on Nordanaar');
    expect(shown.some(text => text.includes('previous record'))).toBe(false);
    expect(Array.from((await renderPng(q)).subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(network()).toEqual([]);
    expect(texts(await tree(query({ realmrank: null, score: '100' })))).toContain('Top 1%');
  });

  test('fallback: an hour or more draws h:mm:ss smaller', async () => {
    const q = query({ ms: String((3600 + 23 * 60 + 7) * 1000) });
    const json = await tree(q);
    expect(texts(json)).toContain('1:23:07');
    expect(json).toContain('"fontSize":150');
    expect(json).not.toContain('"fontSize":200');
    expect(Array.from((await renderPng(q)).subarray(0, 4))).toEqual(PNG_SIGNATURE);
  });

  test('fallback: no guild, splits, wipes or players', async () => {
    const q = query({ guild: null, splits: null, wipes: null, players: null });
    const shown = texts(await tree(q));
    expect(shown.filter(text => text === 'Molten Core')).toHaveLength(1);
    expect(shown.some(text => text.includes('bosses'))).toBe(false);
    expect(Array.from((await renderPng(q)).subarray(0, 4))).toEqual(PNG_SIGNATURE);
  });

  test('hero text stays legible at 400px wide (>= 46px at 1200)', async () => {
    for (const ms of ['2092000', String(5 * 3600 * 1000)]) {
      for (const guild of ['Nightfall', 'x'.repeat(32)]) {
        const json = await tree(query({ ms, guild }));
        const sizes = [...json.matchAll(/"fontSize":(\d+)/g)].map(m => Number(m[1]));
        expect(Math.max(...sizes)).toBeGreaterThanOrEqual(46);
        // The guild line itself stays at 46 or more.
        expect(json).toMatch(/"fontSize":(4[6-9]|50)[,}][^}]*"fontWeight":700/);
      }
    }
  });

  test('renders with nothing but a template', async () => {
    expect(Array.from((await renderPng('template=clear')).subarray(0, 4))).toEqual(PNG_SIGNATURE);
  });

  // fonts.googleapis.cn answers with the bundled 月光 subset; every other
  // request (next/og's own Google fallback included) is refused.
  test('a CJK guild loads its font from the China domain, not at render time', async () => {
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

    const q = query({ guild: '月光' });
    const fonts = await themes.clear.loadFonts(context(q));
    expect(fonts.some(font => font.name === 'Noto Sans SC' && font.weight === 700)).toBe(true);
    const fetchedBeforeRender = hosts.length;
    const response = new ImageResponse(await themes.clear.render({} as ThemeProps, context(q)), { width: 1200, height: 630, fonts });
    expect(Array.from(new Uint8Array(await response.arrayBuffer()).subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(hosts.length).toBe(fetchedBeforeRender);
    expect(hosts.sort()).toEqual(['fonts.googleapis.cn', 'fonts.gstatic.cn', 'fonts.gstatic.cn']);
  });
});

describe('clear params', () => {
  test('splits drop malformed items and cap names at 16 characters', () => {
    expect(splitEntries(context('splits=A:10,B:x,C:0,:5,Averyveryverylongname:7'))).toEqual([
      { name: 'A', secs: 10 },
      { name: 'Averyveryverylon', secs: 7 },
    ]);
  });

  test('labelledSplits', () => {
    expect(labelledSplits(3)).toEqual([true, true, true]);
    expect(labelledSplits(9)).toEqual([true, false, true, false, true, false, true, false, true]);
    expect(labelledSplits(10)).toEqual([false, true, false, true, false, true, false, true, false, true]);
  });

  test('formatDelta', () => {
    expect(formatDelta(-64)).toBe('−1:04');
    expect(formatDelta(-3700)).toBe('−1:01:40');
    expect(formatDelta(0)).toBe('');
    expect(formatDelta(12)).toBe('');
    expect(formatDelta(null)).toBe('');
  });
});
