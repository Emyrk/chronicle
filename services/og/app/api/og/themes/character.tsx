// Character card for /armory/{realm}/{player}: a class emblem on the left,
// name, level line, guild and realm, three stats and up to three boss pills.
//
//   name, class, spec, race, level, guild, realm
//   parse, ilvl, kills, best=Ragnaros:99,Nefarian:97,C'Thun:88   (with parses)
//   ilvl, raids, seen=Nov 2026                               (without parses)
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
  markImage,
  param,
  parseColor,
  SANS,
  SERIF,
} from './kit';
import { fitFontSize } from './shared';
import type { ThemeContext, ThemeDefinition, ThemeProps } from './types';

const PANEL = 400;
const MAX_BEST = 3;
const PARSE_LABEL = 'Best avg parse';

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

// parse · ilvl · kills with a parse; ilvl · raids logged · last seen without.
export function characterStats(context: ThemeContext): Stat[] {
  const raw = param(context, 'parse', 6);
  const parse = /^\d{1,3}(\.\d)?$/.test(raw) ? Math.min(100, Number(raw)) : null;
  const ilvl = intParam(context, 'ilvl', { min: 0, max: 999 });
  const stats: Stat[] = [];
  if (parse !== null) {
    stats.push({ value: raw.includes('.') ? parse.toFixed(1) : String(parse), label: PARSE_LABEL, color: parseColor(parse) });
    if (ilvl !== null) stats.push({ value: String(ilvl), label: 'Item level' });
    const kills = intParam(context, 'kills', { min: 0, max: 999_999 });
    if (kills !== null) stats.push({ value: kills.toLocaleString('en-US'), label: 'Boss kills' });
    return stats;
  }
  if (ilvl !== null) stats.push({ value: String(ilvl), label: 'Item level' });
  const raids = intParam(context, 'raids', { min: 0, max: 999 });
  if (raids !== null) stats.push({ value: String(raids), label: 'Raids logged' });
  const seen = param(context, 'seen', 14);
  if (seen) stats.push({ value: seen, label: 'Last seen' });
  return stats;
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
  const level = intParam(context, 'level', { min: 1, max: 999 });
  const guild = param(context, 'guild', 32);
  const realm = param(context, 'realm', 32);
  const color = classColor(className);
  const stats = characterStats(context);
  // Pills only go with a parse; without one the card shows activity instead.
  const hasParse = stats[0]?.label === PARSE_LABEL;
  const best = hasParse ? parseBest(listParam(context, 'best', { maxItems: MAX_BEST, maxLength: 40 })) : [];
  const markSrc = await markImage();

  const initial = (Array.from(name)[0] ?? '?').toUpperCase();
  const emblemLabel = [spec, titleCase(className)].filter(Boolean).join(' ');
  const levelLine = [level !== null ? `Level ${level}` : '', race, titleCase(className)].filter(Boolean).join(' ');
  const guildLine = [guild ? `<${guild}>` : '', realm].filter(Boolean).join(' · ');
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
      {/* Emblem panel: a class-colour ring and initial. A later `image=` could carry a model render here. */}
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
            width: 240,
            height: 240,
            borderRadius: 999,
            border: `6px solid ${color}`,
            backgroundImage: 'radial-gradient(circle at 50% 35%, #3a2a1c 0%, #1c1611 75%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontFamily: SERIF, fontSize: 130, fontWeight: 700, lineHeight: 1, color }}>{initial}</span>
        </div>
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
        <Header markSrc={markSrc} chip="Armory" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ ...ONE_LINE, fontFamily: SERIF, fontSize: nameSize, fontWeight: 700, lineHeight: 1.1, color }}>{name}</span>
          {levelLine ? <span style={{ ...ONE_LINE, fontSize: 30 }}>{levelLine}</span> : null}
          {guildLine ? <span style={{ ...ONE_LINE, fontSize: 28, color: COLORS.muted }}>{guildLine}</span> : null}
        </div>

        {stats.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 34 }}>
            {stats.map((stat, index) => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'stretch', gap: 34 }}>
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

export const characterTheme: ThemeDefinition = {
  loadFonts: loadKitFonts,
  render,
  fontFamily: SANS,
};
