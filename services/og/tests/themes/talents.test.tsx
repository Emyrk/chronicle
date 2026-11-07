import { afterEach, describe, expect, test, vi } from 'vitest';
import { ImageResponse } from 'next/og';
import { talentCardModel, talentsTheme } from '../../app/api/og/themes/talents';
import type { ThemeContext, ThemeProps } from '../../app/api/og/themes/types';

const context = (query = ''): ThemeContext => ({ searchParams: new URLSearchParams(query) });
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const props = {} as ThemeProps;

const FULL =
  'template=talents&class=mage&spec=Fire&points=17-34-0&product=WoW+Forever&keys=Combustion,Ignite,Arcane+Concentration&host=forever.chronicleclassic.com&v=1';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('talentCardModel', () => {
  test('full build', () => {
    const model = talentCardModel(context(FULL));
    expect(model.title).toBe('Fire Mage');
    expect(model.color).toBe('#69CCF0');
    expect(model.chip).toBe('Talent build · WoW Forever');
    expect(model.split).toBe('17 / 34 / 0');
    expect(model.keys).toEqual(['Combustion', 'Ignite', 'Arcane Concentration']);
    expect(model.trees).toEqual([
      { name: 'Arcane', points: 17 },
      { name: 'Fire', points: 34 },
      { name: 'Frost', points: 0 },
    ]);
    expect(model.lead).toBe(1);
  });

  test('no build: "<Class> Talent Calculator" with empty trees', () => {
    const model = talentCardModel(context('class=mage&product=WoW+Forever'));
    expect(model.title).toBe('Mage Talent Calculator');
    expect(model.chip).toBe('Talent calculator · WoW Forever');
    expect(model.split).toBe('');
    expect(model.trees.map(tree => tree.points)).toEqual([null, null, null]);
    expect(model.lead).toBe(-1);
  });

  test('pet: "Hunter Pet" with one bar', () => {
    const model = talentCardModel(context('class=pet&points=16'));
    expect(model.title).toBe('Hunter Pet');
    expect(model.color).toBe('#ABD473');
    expect(model.split).toBe('16 points');
    expect(model.trees).toEqual([{ name: 'Pet', points: 16 }]);
  });

  test.each(['class=mage&points=0-0-0', 'class=mage&spec=Unknown&points=0-0-0'])('unknown spec: class name alone (%s)', query => {
    const model = talentCardModel(context(query));
    expect(model.title).toBe('Mage');
    expect(model.split).toBe('0 / 0 / 0');
    expect(model.lead).toBe(-1);
  });

  test('no or unknown class: generic calculator, no trees', () => {
    for (const query of ['', 'class=gnomelord&points=5-0-5']) {
      const model = talentCardModel(context(query));
      expect(model.title).toBe('Talent Calculator');
      expect(model.trees).toEqual([]);
    }
  });

  test('malformed points are treated as no build', () => {
    expect(talentCardModel(context('class=mage&points=17-x-0')).title).toBe('Mage Talent Calculator');
    expect(talentCardModel(context('class=mage&points=1-2-3-4')).split).toBe('');
  });

  test('hero text stays at least 46px at 1200 wide', async () => {
    for (const query of [FULL, 'class=hunter&spec=Beast+Mastery&points=31-20-0', 'class=deathknight']) {
      const tree = JSON.stringify(await talentsTheme.render(props, context(query)));
      const sizes = [...tree.matchAll(/"fontSize":(\d+)/g)].map(m => Number(m[1]));
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(46);
    }
  });
});

describe('render', () => {
  test.each([
    ['full', FULL],
    ['no build', 'class=mage&host=forever.chronicleclassic.com'],
    ['pet', 'class=pet&points=16'],
    ['unknown spec', 'class=mage&points=0-0-0'],
    ['long name', 'class=hunter&spec=Beast+Mastery&points=31-20-0&keys=Bestial+Wrath,The+Beast+Within'],
    ['empty', ''],
  ])('%s renders a PNG without a network call', async (_label, query) => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const ctx = context(query);
    const response = new ImageResponse(await talentsTheme.render(props, ctx), {
      width: 1200,
      height: 630,
      fonts: await talentsTheme.loadFonts(ctx),
    });
    const png = new Uint8Array(await response.arrayBuffer());
    expect([...png.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    const urls = spy.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input));
    expect(urls.filter(url => !url.startsWith('data:'))).toEqual([]);
  });
});
