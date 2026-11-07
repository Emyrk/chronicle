import { afterEach, describe, expect, test, vi } from 'vitest';
import { ImageResponse } from 'next/og';
import { characterStats, characterTheme, parseBest } from '../../app/api/og/themes/character';
import { listParam } from '../../app/api/og/themes/kit';
import type { ThemeContext, ThemeProps } from '../../app/api/og/themes/types';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

const props: ThemeProps = {
  title: 'Untitled',
  site: 'Chronicle',
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

const IDENTITY = 'name=Moonbrew&class=druid&spec=Feral&race=Night+Elf&level=60&guild=Nightfall&realm=Nordanaar&host=forever.chronicleclassic.com';
const FULL = `${IDENTITY}&parse=96.4&ilvl=71&kills=212&best=${encodeURIComponent("Ragnaros:99,Nefarian:97,C'Thun:88")}`;
const NO_PARSES = `${IDENTITY}&ilvl=71&raids=4&seen=${encodeURIComponent('Nov 2026')}`;
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
  test('with parses: parse · ilvl · kills and the boss pills', async () => {
    expect(labels(FULL)).toEqual(['Best avg parse', 'Item level', 'Boss kills']);
    const json = await tree(FULL);
    for (const text of ['Moonbrew', 'Level 60 Night Elf Druid', '<Nightfall> · Nordanaar', 'Feral Druid', '96.4', 'Ragnaros', "C'Thun", 'forever.chronicleclassic.com/armory']) {
      expect(json).toContain(text);
    }
  });

  test('no parses: ilvl · raids logged · last seen, no pills', async () => {
    // Stray parse-only params are ignored without a parse.
    const query = `${NO_PARSES}&kills=212&best=Ragnaros:99`;
    expect(labels(query)).toEqual(['Item level', 'Raids logged', 'Last seen']);
    const json = await tree(query);
    expect(json).toContain('Nov 2026');
    expect(json).not.toContain('Ragnaros');
    expect(json).not.toContain('Boss kills');
  });

  test('no gear: item level is dropped', () => {
    expect(labels(NO_GEAR)).toEqual(['Best avg parse', 'Boss kills']);
    expect(labels(`${IDENTITY}&raids=2`)).toEqual(['Raids logged']);
  });

  test('class and initial alone still draw the emblem', async () => {
    expect(labels(MINIMAL)).toEqual([]);
    const json = await tree(MINIMAL);
    expect(json).toContain('"M"');
    expect(json).toContain('#FF7D0A');
    expect(json).not.toContain('Level');
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
    ['no parses', NO_PARSES],
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
});
