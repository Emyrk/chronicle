import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ImageResponse } from 'next/og';
import { characterStats, characterTheme, parseBest } from '../../app/api/og/themes/character';
import { classIconFile, listParam, parseColor, raceIconFile, specIconFile } from '../../app/api/og/themes/kit';
import type { ThemeContext, ThemeProps } from '../../app/api/og/themes/types';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

const props: ThemeProps = {
  accent: null,
  iconSrc: null,
};

const IDENTITY = 'name=Moonbrew&class=druid&spec=Feral&race=Night+Elf&level=60&guild=Nightfall&host=forever.chronicleclassic.com';
const FULL = `${IDENTITY}&parse=96.4&ilvl=71&kills=212&best=${encodeURIComponent("Ragnaros:99,Nefarian:97,C'Thun:88")}`;
const HISTORY = `${IDENTITY}&ilvl=71&logs=14&seen=${encodeURIComponent('Nov 2026')}`;
const NO_GEAR = `${IDENTITY}&parse=96.4&kills=212&best=Ragnaros:99`;
const MINIMAL = 'name=Moonbrew&class=druid';

const context = (query: string): ThemeContext => ({ searchParams: new URLSearchParams(query) });
const tree = async (query: string) => JSON.stringify(await characterTheme.render(props, context(query)));
const labels = (query: string) => characterStats(context(query)).map(stat => stat.label);

// next/og fetches its own wasm from a data: URL; anything else is the network
// (e.g. a font fetched for a glyph the bundled cuts lack).
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

describe('character card', () => {
  test('unreleased performance style: parse · ilvl · kills and boss pills', async () => {
    expect(labels(FULL)).toEqual(['Best avg parse', 'Item level', 'Boss kills']);
    const json = await tree(FULL);
    for (const text of ['Moonbrew', 'Level 60 Night Elf Druid', '<Nightfall>', 'Feral Druid', '96.4', 'Ragnaros', "C'Thun", 'forever.chronicleclassic.com/armory']) {
      expect(json).toContain(text);
    }
  });

  test('released history style: ilvl · logs seen · last seen, no pills', async () => {
    // Stray performance-only params are ignored without a parse.
    const query = `${HISTORY}&kills=212&best=Ragnaros:99`;
    expect(labels(query)).toEqual(['Item level', 'Logs seen', 'Last seen']);
    const json = await tree(query);
    expect(json).toContain('Nov 2026');
    expect(json).not.toContain('Ragnaros');
    expect(json).not.toContain('Boss kills');
  });

  test('no gear: item level is dropped', () => {
    expect(labels(NO_GEAR)).toEqual(['Best avg parse', 'Boss kills']);
    expect(labels(`${IDENTITY}&logs=2`)).toEqual(['Logs seen']);
  });

  test('class and initial alone still draw the emblem', async () => {
    expect(labels(MINIMAL)).toEqual([]);
    const json = await tree(MINIMAL);
    expect(json).toContain('"M"');
    expect(json).toContain('#FF7D0A');
    expect(json).not.toContain('Level');
  });

  test('race, class and spec icons are drawn only when known', async () => {
    const pngs = async (query: string) => (await tree(query)).match(/"src":"data:image\/png;base64/g)?.length ?? 0;
    // One `src` per icon tile (the header mark goes in as `markSrc`).
    expect(await pngs(IDENTITY)).toBe(3);
    expect(await pngs('name=Moonbrew&class=warrior')).toBe(1);
    expect(await pngs('name=Moonbrew&class=bard&spec=Feral&race=Draenei')).toBe(0);

    expect(raceIconFile('Night Elf')).toBe('icons/race_night_elf.png');
    expect(raceIconFile('Undead')).toBe('icons/race_forsaken.png');
    expect(raceIconFile('Blood Elf')).toBe('icons/race_blood_elf.png');
    expect(raceIconFile('Night Elf', 'female')).toBe('icons/race_night_elf_female.png');
    expect(raceIconFile('Undead', 'Female')).toBe('icons/race_forsaken_female.png');
    expect(raceIconFile('Human', 'unknown')).toBe('icons/race_human.png');
    expect(raceIconFile('Goblin', 'female')).toBe('icons/race_goblin.png');
    expect(classIconFile('DRUID')).toBe('icons/class_druid.png');
    expect(specIconFile('druid', 'Feral')).toBe('icons/spec_druid_feral.png');
    expect(specIconFile('hunter', 'Beast Mastery')).toBe('icons/spec_hunter_beastmastery.png');
    expect(specIconFile('mage', 'Holy')).toBeNull();
  });

  test('best is capped at three and skips malformed items', () => {
    const query = `best=${encodeURIComponent('A:1,B:x,C:3,Lord: Kri:250,D:4,E:5')}`;
    expect(parseBest(listParam(context(query), 'best', { maxItems: 10, maxLength: 40 }))).toEqual([
      { name: 'A', score: 1 },
      { name: 'C', score: 3 },
      { name: 'Lord: Kri', score: 100 },
    ]);
  });

  test.each([
    ['full', FULL],
    ['history', HISTORY],
    ['no gear', NO_GEAR],
    ['minimal', MINIMAL],
    ['long name, unknown class', 'name=Abcdefghijklmnopqrst&class=bard&level=1'],
  ])('renders a PNG from disk only: %s', async (_label, query) => {
    const network = spyNetwork();
    const response = new ImageResponse(await characterTheme.render(props, context(query)), {
      width: 1200,
      height: 630,
      fonts: await characterTheme.loadFonts(context(query)),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(Array.from(bytes.subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(network()).toEqual([]);
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
    ['CJK', 'name=%E6%9C%88%E5%85%89&class=mage&level=60', ['fonts.googleapis.cn', 'fonts.gstatic.cn', 'fonts.gstatic.cn']],
    ['Cyrillic', `name=${encodeURIComponent('Лунный')}&class=priest&guild=${encodeURIComponent('Северный')}`, []],
  ])('%s names render bold without Google’s main font domains', async (_label, query, expectedHosts) => {
    const hosts = await mockFontNetwork();
    const fonts = await characterTheme.loadFonts(context(query));
    // A bold cut that covers the script, beyond the latin kit fonts.
    expect(fonts.some(font => !['Inter', 'Libre Baskerville'].includes(font.name) && font.weight === 700)).toBe(true);

    const response = new ImageResponse(await characterTheme.render(props, context(query)), { width: 1200, height: 630, fonts });
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(Array.from(bytes.subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(hosts.filter(host => host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com')).toEqual([]);
    expect(hosts.sort()).toEqual(expectedHosts);
  });

  test('parse colour follows the rounded score, like the page', () => {
    const [parse] = characterStats(context('parse=94.6'));
    expect(parse.value).toBe('94.6');
    expect(parse.color).toBe(parseColor(95));
    expect(parse.color).not.toBe(parseColor(94));
  });
});
