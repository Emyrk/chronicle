// Character card for /armory/{realm}/{player}: a class emblem on the left,
// name, level line, guild, three stats and up to three boss pills.
//
//   name, class, spec, race, gender (male|female, default male), level, guild
//   mastery=43.9, peak=53.9, renown=524                      (career ratings)
//   ilvl, logs, seen=Nov 2026                                (history)
//   parse, ilvl, kills, best=Ragnaros:99,...                 (unreleased parse design)
//
// Every stat is optional; the emblem needs only class + name's initial.
import {
  chromeParams,
  classColor,
  COLORS,
  Footer,
  Header,
  intParam,
  listParam,
  loadKitFonts,
  loadNameFonts,
  headerLogoImage,
  param,
  parseColor,
  classIconFile,
  raceIconFile,
  SANS,
  SERIF,
  specIconFile,
} from './kit';
import { publicImage } from './public-files';
import { fitFontSize } from './shared';
import type { ThemeContext, ThemeDefinition, ThemeFont, ThemeProps } from './types';

const PANEL = 400;
const MAX_BEST = 3;
const PARSE_LABEL = 'Best avg parse';

// Rating accents, matching the site's Mastery / Peak / Renown colours.
const RATING_COLORS = { mastery: '#72aac6', peak: '#e2b25a', renown: '#b394e6' } as const;

// One line, clipped with an ellipsis (Satori needs display block and a single string child).
const ONE_LINE: React.CSSProperties = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

// `#rrggbb` → rgba() at `alpha`.
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function titleCase(text: string): string {
  return text.replace(/\b\p{L}/gu, letter => letter.toUpperCase());
}

interface Stat {
  value: string;
  label: string;
  color?: string;
}

interface Boss {
  name: string;
  score: number;
}

// `Name:score` items; the score is after the last ':' so names may hold one.
export function parseBest(items: string[]): Boss[] {
  const bosses: Boss[] = [];
  for (const item of items) {
    const split = item.lastIndexOf(':');
    const name = item.slice(0, split).trim();
    const raw = item.slice(split + 1).trim();
    if (split <= 0 || !name || !/^\d{1,3}$/.test(raw)) continue;
    bosses.push({ name, score: Math.min(100, Number(raw)) });
  }
  return bosses.slice(0, MAX_BEST);
}

// A 0–100 rating with at most one decimal, or null.
function ratingParam(context: ThemeContext, key: string): number | null {
  const raw = param(context, key, 6);
  return /^\d{1,3}(\.\d)?$/.test(raw) ? Math.min(100, Number(raw)) : null;
}

// Characters with career ratings show Mastery · Peak · Renown for their top
// spec; others show the history card (ilvl · logs seen · last seen). Supplying
// a parse still renders the preserved parse design for review, but Chronicle
// does not select it.
export function characterStats(context: ThemeContext): Stat[] {
  const mastery = ratingParam(context, 'mastery');
  if (mastery !== null) {
    const ratings: Stat[] = [{ value: mastery.toFixed(1), label: 'Mastery', color: RATING_COLORS.mastery }];
    const peak = ratingParam(context, 'peak');
    if (peak !== null) ratings.push({ value: peak.toFixed(1), label: 'Peak', color: RATING_COLORS.peak });
    const renown = intParam(context, 'renown', { min: 0, max: 9_999_999 });
    if (renown !== null) ratings.push({ value: renown.toLocaleString('en-US'), label: 'Renown', color: RATING_COLORS.renown });
    return ratings;
  }
  const raw = param(context, 'parse', 6);
  const parse = /^\d{1,3}(\.\d)?$/.test(raw) ? Math.min(100, Number(raw)) : null;
  const ilvl = intParam(context, 'ilvl', { min: 0, max: 999 });
  const stats: Stat[] = [];
  if (parse !== null) {
    stats.push({ value: raw.includes('.') ? parse.toFixed(1) : String(parse), label: PARSE_LABEL, color: parseColor(Math.round(parse)) });
    if (ilvl !== null) stats.push({ value: String(ilvl), label: 'Item level' });
    const kills = intParam(context, 'kills', { min: 0, max: 999_999 });
    if (kills !== null) stats.push({ value: kills.toLocaleString('en-US'), label: 'Boss kills' });
    return stats;
  }
  if (ilvl !== null) stats.push({ value: String(ilvl), label: 'Item level' });
  const logs = intParam(context, 'logs', { min: 0, max: 999_999 });
  if (logs !== null) stats.push({ value: logs.toLocaleString('en-US'), label: 'Logs seen' });
  const seen = param(context, 'seen', 14);
  if (seen) stats.push({ value: seen, label: 'Last seen' });
  return stats;
}

interface IconTile {
  src: string;
  border: string;
}

// Race, class and spec icons we know, in that order; any of them may be missing.
async function iconTiles(race: string, gender: string, className: string, spec: string, color: string): Promise<IconTile[]> {
  const files: [string | null, string][] = [
    [raceIconFile(race, gender), COLORS.border],
    [classIconFile(className), color],
    [spec ? specIconFile(className, spec) : null, color],
  ];
  return Promise.all(
    files.filter((entry): entry is [string, string] => entry[0] !== null).map(async ([file, border]) => ({ src: await publicImage(file), border }))
  );
}

const TILE = 76;

function Tile({ tile }: { tile: IconTile }) {
  return (
    <div style={{ display: 'flex', padding: 3, borderRadius: 10, border: `3px solid ${tile.border}`, background: '#141414' }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={tile.src} width={TILE} height={TILE} style={{ width: TILE, height: TILE, borderRadius: 6 }} />
    </div>
  );
}

function StatBlock({ stat }: { stat: Stat }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: Array.from(stat.value).length > 6 ? 44 : 56, fontWeight: 700, lineHeight: '59px', color: stat.color ?? COLORS.foreground }}>{stat.value}</span>
      <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.muted }}>
        {stat.label}
      </span>
    </div>
  );
}

function Pill({ boss }: { boss: Boss }) {
  const color = parseColor(boss.score);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexShrink: 1,
        minWidth: 0,
        gap: 10,
        padding: '8px 14px',
        borderRadius: 4,
        background: withAlpha(color, 0.12),
        border: `2px solid ${withAlpha(color, 0.55)}`,
        fontSize: 22,
      }}
    >
      <span style={{ ...ONE_LINE, flexShrink: 1, minWidth: 0, color: COLORS.foreground }}>{boss.name}</span>
      <span style={{ flexShrink: 0, fontWeight: 700, color }}>{boss.score}</span>
    </div>
  );
}

async function render(_props: ThemeProps, context: ThemeContext): Promise<React.ReactElement> {
  const { host } = chromeParams(context);
  const name = param(context, 'name', 20) || 'Unknown';
  const className = param(context, 'class', 20);
  const spec = param(context, 'spec', 20);
  const race = param(context, 'race', 20);
  const gender = param(context, 'gender', 10);
  const level = intParam(context, 'level', { min: 1, max: 999 });
  const guild = param(context, 'guild', 32);
  const color = classColor(className);
  const stats = characterStats(context);
  // Pills only go with a parse; without one the card shows activity instead.
  const hasParse = stats[0]?.label === PARSE_LABEL;
  const best = hasParse ? parseBest(listParam(context, 'best', { maxItems: MAX_BEST, maxLength: 40 })) : [];
  const [logoSrc, tiles] = await Promise.all([headerLogoImage(), iconTiles(race, gender, className, spec, color)]);

  const initial = (Array.from(name)[0] ?? '?').toUpperCase();
  const emblemLabel = [spec, titleCase(className)].filter(Boolean).join(' ');
  const levelLine = [level !== null ? `Level ${level}` : '', race, titleCase(className)].filter(Boolean).join(' ');
  const guildLine = guild ? `<${guild}>` : '';
  const nameSize = fitFontSize(name, [
    [12, 92],
    [15, 76],
    [18, 62],
    [Infinity, 50],
  ]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        fontFamily: SANS,
        color: COLORS.foreground,
        background: COLORS.background,
      }}
    >
      {/* Emblem panel: a class-colour ring and initial, then whichever race/class/spec icons we know. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: PANEL,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 22,
          backgroundImage: `linear-gradient(180deg, ${withAlpha(color, 0.32)} 0%, ${withAlpha(color, 0.08)} 70%, ${withAlpha(color, 0.02)} 100%)`,
          borderRight: `2px solid ${withAlpha(color, 0.45)}`,
        }}
      >
        <div
          style={{
            width: tiles.length > 0 ? 210 : 240,
            height: tiles.length > 0 ? 210 : 240,
            borderRadius: 999,
            border: `6px solid ${color}`,
            backgroundImage: 'radial-gradient(circle at 50% 35%, #3a2a1c 0%, #1c1611 75%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontFamily: SERIF, fontSize: tiles.length > 0 ? 112 : 130, fontWeight: 700, lineHeight: 1, color }}>{initial}</span>
        </div>
        {tiles.length > 0 ? (
          <div style={{ display: 'flex', gap: 14 }}>
            {tiles.map(tile => (
              <Tile key={tile.src} tile={tile} />
            ))}
          </div>
        ) : null}
        {emblemLabel ? (
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color }}>
            {emblemLabel}
          </span>
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: PANEL,
          width: 1200 - PANEL,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '50px 64px 42px 60px',
        }}
      >
        <Header logoSrc={logoSrc} chip="Armory" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ ...ONE_LINE, fontFamily: SERIF, fontSize: nameSize, fontWeight: 700, lineHeight: 1.1, color }}>{name}</span>
          {levelLine ? <span style={{ ...ONE_LINE, fontSize: 30 }}>{levelLine}</span> : null}
          {guildLine ? <span style={{ ...ONE_LINE, fontSize: 28, color: COLORS.muted }}>{guildLine}</span> : null}
        </div>

        {stats.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 28 }}>
            {stats.map((stat, index) => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'stretch', gap: 28 }}>
                {index > 0 ? <div style={{ width: 2, background: COLORS.rule }} /> : null}
                <StatBlock stat={stat} />
              </div>
            ))}
          </div>
        ) : null}

        {best.length > 0 ? (
          <div style={{ display: 'flex', gap: 12 }}>
            {best.map(boss => (
              <Pill key={boss.name} boss={boss} />
            ))}
          </div>
        ) : null}

        <Footer host={`${host}/armory`} cta="Look up any character" />
      </div>
    </div>
  );
}

// Cyrillic and CJK names need fonts beyond the latin kit cuts (loadNameFonts).
async function loadFonts(context: ThemeContext): Promise<ThemeFont[]> {
  const text = [param(context, 'name', 20), param(context, 'guild', 32)].join('');
  const [kit, names] = await Promise.all([loadKitFonts(), loadNameFonts(text)]);
  return [...kit, ...names];
}

export const characterTheme: ThemeDefinition = {
  loadFonts,
  render,
  fontFamily: SANS,
};
