import { isValidElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ImageResponse } from 'next/og';
import { themes } from '../../app/api/og/themes';
import { artImage } from '../../app/api/og/themes/kit';
import { compEntries, killTimeParseScores, shortDate, topEntries } from '../../app/api/og/themes/raid';
import type { ThemeContext, ThemeProps } from '../../app/api/og/themes/types';

const context = (query: string): ThemeContext => ({ searchParams: new URLSearchParams(query) });
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

// The ticket's params contract (#1665).
const FULL = new URLSearchParams({
  template: 'raid',
  guild: 'Nightfall',
  raid: 'Molten Core',
  product: 'WoW Forever',
  date: '2026-11-06',
  players: '40',
  kills: '10',
  bosses: '10',
  dur: '6727',
  wipes: '0',
  killparses: '72,81,95,76,88,64,91,83,99,77',
  killavg: '83',
  top: 'Thalendris:mage:1284,Grimtusk:warrior:1201,Vexxa:warlock:1166,Shadowstep:rogue:1122,Kaelyn:hunter:1043',
  heal: 'Aeloria:priest:812',
  comp: 'warrior:5,rogue:6,mage:6,warlock:5,hunter:4,priest:8,druid:3,paladin:3',
  art: 'molten-core',
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
  return JSON.stringify(expand(await themes.raid.render({} as ThemeProps, context(q))));
}

// Text nodes in the rendered tree.
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
  const response = new ImageResponse(await themes.raid.render({} as ThemeProps, context(q)), {
    width: 1200,
    height: 630,
    fonts: await themes.raid.loadFonts(context(q)),
  });
  return new Uint8Array(await response.arrayBuffer());
}

describe('raid card', () => {
  test('renders the full contract without touching the network', async () => {
    const network = spyNetwork();
    const bytes = await renderPng(FULL.toString());
    expect(Array.from(bytes.subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(network()).toEqual([]);

    const json = await tree(FULL.toString());
    const shown = texts(json);
    for (const text of ['<Nightfall>', 'Molten Core', 'Raid report · Nov 6', '10/10', '1:52:07', 'Clear', '83', 'avg', 'Kill time parse', 'Top damage', 'Thalendris', '1,284', 'dps', 'Top healing', 'Aeloria', '812', 'hps', 'forever.chronicleclassic.com']) {
      expect(shown).toContain(text);
    }
    // Only the top damage dealer is drawn.
    expect(shown).not.toContain('Grimtusk');
    expect(json).toContain((await artImage(context(FULL.toString())))!);
  });

  test('hero text stays legible at 400px wide (>= 46px at 1200)', async () => {
    for (const guild of ['Nightfall', 'Knights of the Ebon Twilight', 'x'.repeat(40)]) {
      const json = await tree(query({ guild }));
      const sizes = [...json.matchAll(/"fontSize":(\d+)/g)].map(m => Number(m[1]));
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(46);
    }
  });

  test('top damage and healing each draw alone when the other is missing', async () => {
    const damageOnly = texts(await tree(query({ heal: null })));
    expect(damageOnly).toContain('Top damage');
    expect(damageOnly).not.toContain('Top healing');

    const q = query({ top: null });
    const healingOnly = texts(await tree(q));
    expect(healingOnly).toContain('Top healing');
    expect(healingOnly).toContain('Aeloria');
    expect(healingOnly).not.toContain('Top damage');
    expect(Array.from((await renderPng(q)).subarray(0, 4))).toEqual(PNG_SIGNATURE);
  });

  test('long leaders stay inside the right-hand panel', async () => {
    const q = query({ top: 'Averyveryverylon:mage:999999999', heal: 'Averyveryverylon:priest:999999999' });
    const json = await tree(q);
    expect(json).not.toContain('"width":320');
    expect(texts(json)).toContain('999,999,999');
    expect(Array.from((await renderPng(q)).subarray(0, 4))).toEqual(PNG_SIGNATURE);
  });

  test('fallback: no art draws the gold glow', async () => {
    const network = spyNetwork();
    const json = await tree(query({ art: null }));
    expect(json).not.toContain('data:image/jpeg');
    expect(json).toContain('radial-gradient(circle at 88% 30%');
    expect(texts(json)).toContain('Top damage');
    expect(await tree(query({ art: 'not-a-raid' }))).toContain('radial-gradient(circle at 88% 30%');
    expect(Array.from((await renderPng(query({ art: null }))).subarray(0, 4))).toEqual(PNG_SIGNATURE);
    expect(network()).toEqual([]);
  });

  test('fallback: no ranked bosses or kill parses drops those panels and shows wipes', async () => {
    const q = query({ top: null, heal: null, killparses: null, killavg: null, raid: 'Karazhan Crypts', art: null, kills: '4', bosses: '6', dur: '9660', wipes: '3', players: '10' });
    const shown = texts(await tree(q));
    expect(shown).not.toContain('Top damage');
    expect(shown).not.toContain('Top healing');
    expect(shown).not.toContain('Kill time parse');
    for (const text of ['4/6', 'Bosses', '2:41:00', 'Duration', '3', 'Wipes']) expect(shown).toContain(text);
    expect(Array.from((await renderPng(q)).subarray(0, 4))).toEqual(PNG_SIGNATURE);
  });

  test('fallback: no guild makes the raid the headline with a PUG chip', async () => {
    const q = query({ guild: null });
    const shown = texts(await tree(q));
    expect(shown).toContain('PUG · Nov 6');
    expect(shown).not.toContain('Raid report · Nov 6');
    expect(shown.filter(text => text === 'Molten Core')).toHaveLength(1);
    expect(Array.from((await renderPng(q)).subarray(0, 4))).toEqual(PNG_SIGNATURE);
  });

  test('renders with nothing but a host', async () => {
    expect(Array.from((await renderPng('template=raid')).subarray(0, 4))).toEqual(PNG_SIGNATURE);
  });
});

describe('raid params', () => {
  test('top is capped at 5 entries and names at 16 characters', () => {
    const top = Array.from({ length: 7 }, (_, i) => `Averyveryverylongname${i}:mage:${1000 - i}`).join(',');
    const entries = topEntries(context(`top=${encodeURIComponent(top)}`));
    expect(entries).toHaveLength(5);
    expect(entries[0]).toEqual({ name: 'Averyveryverylon', className: 'mage', dps: 1000 });
  });

  test('top, heal and comp drop malformed items', () => {
    expect(topEntries(context('top=A:mage:x,B:rogue:0,:mage:5,C:warrior:12'))).toEqual([{ name: 'C', className: 'warrior', dps: 12 }]);
    expect(topEntries(context('heal=A:priest:x,B:druid:640'), 'heal')).toEqual([{ name: 'B', className: 'druid', dps: 640 }]);
    expect(compEntries(context('comp=warrior:5,mage:x,priest:0,druid:3'))).toEqual([
      { className: 'warrior', count: 5 },
      { className: 'druid', count: 3 },
    ]);
  });

  test('kill-time parse scores are bounded and malformed entries are dropped', () => {
    const scores = Array.from({ length: 22 }, (_, index) => String(index)).join(',');
    expect(killTimeParseScores(context(`killparses=${scores}`))).toHaveLength(20);
    expect(killTimeParseScores(context('killparses=64,-1,101,nope,95'))).toEqual([64, 95]);
  });

  test('shortDate', () => {
    expect(shortDate('2026-11-06')).toBe('Nov 6');
    expect(shortDate('2026-13-01')).toBe('');
    expect(shortDate('yesterday')).toBe('');
  });
});
