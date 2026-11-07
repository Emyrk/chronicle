import { afterEach, describe, expect, test, vi } from 'vitest';
import { ImageResponse } from 'next/og';
import { themes } from '../../app/api/og/themes';
import { DEFAULT_GUILD_ACCENT, formatSince, readProgression } from '../../app/api/og/themes/guild';
import type { ThemeContext, ThemeProps } from '../../app/api/og/themes/types';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNwSJgARwzEcQDpQxMBLJSVHwAAAABJRU5ErkJggg==';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

const FULL_QUERY =
  'template=guild&name=Nightfall&product=WoW+Forever&members=62&since=2025-03&accent=5F8FA6' +
  '&prog=MC:10:10,BWL:8:8,AQ40:7:9,Naxx:4:15&best=2092&bestraid=MC&tag=Raiding&host=forever.chronicleclassic.com&v=1';

const context = (query: string): ThemeContext => ({ searchParams: new URLSearchParams(query) });

// The handler validates `accent` and fetches `icon`; the card sees the results.
const props = (overrides: Partial<ThemeProps> = {}): ThemeProps => ({
  title: 'Untitled',
  site: 'Blog',
  excerpt: '',
  author: '',
  date: '',
  tag: '',
  readingTime: '',
  accent: '#5f8fa6',
  imageSrc: null,
  iconSrc: null,
  avatarSrc: null,
  ...overrides,
});

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

// Calls function components so the JSON shows what Satori will draw.
function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== 'object' || !('props' in node)) return node;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (typeof element.type === 'function') return expand((element.type as (p: unknown) => unknown)(element.props));
  return { type: element.type, props: { ...element.props, children: expand(element.props.children) } };
}

async function renderGuild(query: string, overrides: Partial<ThemeProps> = {}) {
  const ctx = context(query);
  const tree = await themes.guild.render(props(overrides), ctx);
  const response = new ImageResponse(tree, { width: 1200, height: 630, fonts: await themes.guild.loadFonts(ctx) });
  const png = new Uint8Array(await response.arrayBuffer());
  return { json: JSON.stringify(expand(tree)), png };
}

describe('guild card', () => {
  test('renders the full card with no network call', async () => {
    const networkCalls = spyNetwork();
    const { json, png } = await renderGuild(FULL_QUERY);
    expect([...png.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(networkCalls()).toEqual([]);
    for (const text of ['"<Nightfall>"', 'Guild · Raiding', 'WoW Forever · 62 members · since Mar 2025', 'Naxx', '4/15', '34:52', 'Best MC clear', 'forever.chronicleclassic.com', 'See our raids']) {
      expect(json).toContain(text);
    }
  });

  test('the guild name reads <Name>; no name stays a bare placeholder', async () => {
    expect((await renderGuild('name=Nightfall')).json).toContain('"<Nightfall>"');
    const { json } = await renderGuild('members=3');
    expect(json).toContain('"Guild"');
    expect(json).not.toContain('<Guild>');
  });

  test('hero name stays at least 46px, even for the longest names', async () => {
    for (const name of ['Nightfall', 'A'.repeat(32)]) {
      const { json } = await renderGuild(`name=${name}`);
      const sizes = [...json.matchAll(/"fontSize":(\d+)/g)].map(match => Number(match[1]));
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(46);
      expect(json).toMatch(/"fontSize":(4[6-9]|[5-9]\d),"fontWeight":700,"lineHeight":1.08/);
    }
  });

  test('no logo: monogram of the first letter on the accent colour', async () => {
    const { json } = await renderGuild(FULL_QUERY);
    expect(json).toContain('"children":"N"');
    expect(json).toContain('linear-gradient(160deg');
    expect(json).not.toContain(PNG);
  });

  test('logo: drawn instead of the monogram', async () => {
    const { json, png } = await renderGuild(FULL_QUERY, { iconSrc: PNG });
    expect([...png.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(json).toContain(PNG);
    expect(json).not.toContain('"children":"N"');
  });

  test('no progression: only raids logged, without aggregate player scores', async () => {
    const networkCalls = spyNetwork();
    const { json, png } = await renderGuild(
      'name=Nightfall&raids=47&top=Thalendris:mage:99,Grimtusk:warrior:80&avg=69'
    );
    expect([...png.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(networkCalls()).toEqual([]);
    expect(json).toContain('47');
    expect(json).toContain('raids logged');
    expect(json).not.toContain('Thalendris');
    expect(json).not.toContain('Grimtusk');
    expect(json).not.toContain('Top parse avg');
    expect(json).not.toContain('/15');
  });

  test('progression wins over the activity fallback', async () => {
    const { json } = await renderGuild(`${FULL_QUERY}&raids=47&top=Thalendris:mage:99`);
    expect(json).not.toContain('raids logged');
    expect(json).not.toContain('Thalendris');
  });

  test('no accent: Chronicle primary blue', async () => {
    const { json, png } = await renderGuild('name=Nightfall', { accent: null });
    expect([...png.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(json).toContain(`"background":"${DEFAULT_GUILD_ACCENT}"`);
  });

  test('bare card: only a name still renders', async () => {
    const { json, png } = await renderGuild('', { accent: null });
    expect([...png.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(json).toContain('"children":"Guild"');
    expect(json).toContain('chronicleclassic.com');
  });
});

describe('guild params', () => {
  test('progression is capped at 4 raids; bad items dropped; down capped at total', () => {
    const rows = readProgression(context('prog=MC:12:10,BWL:x:8,ZG:0:0,AQ40:7:9,Naxx:4:15,ES:1:4,Kara:1:1'));
    expect(rows).toEqual([
      { label: 'MC', down: 10, total: 10 },
      { label: 'AQ40', down: 7, total: 9 },
      { label: 'Naxx', down: 4, total: 15 },
      { label: 'ES', down: 1, total: 4 },
    ]);
    expect(readProgression(context('prog=MC:1:10,BWL:1:8,ZG:1:8,AQ40:1:9,Naxx:1:15'))).toHaveLength(4);
  });

  test.each([
    ['2025-03', 'Mar 2025'],
    ['2024-12', 'Dec 2024'],
    ['2025-13', ''],
    ['2025', ''],
    ['', ''],
  ])('since %s is "%s"', (value, text) => {
    expect(formatSince(value)).toBe(text);
  });
});
