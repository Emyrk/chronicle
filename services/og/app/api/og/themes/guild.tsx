// Guild card for /g/{guildId}: logo or monogram, name, progression bars and
// two headline stats. Every value comes from the signed params api/og.go writes:
//   name, realm, product, members, since (YYYY-MM), accent, tag, host,
//   prog=MC:10:10,BWL:8:8 (short:down:total, at most 4), best (seconds),
//   bestraid, avg, and when there is no progression raids + top=name:class:score.
// `icon` (the guild logo) is fetched by the handler through the SSRF pipeline;
// any failure, WebP included, leaves iconSrc null and the monogram shows.
import { Img, fitFontSize } from './shared';
import {
  chromeParams,
  classColor,
  COLORS,
  Footer,
  formatDuration,
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
import type { ThemeContext, ThemeDefinition, ThemeProps } from './types';

// Chronicle's primary blue (frontend --primary), used when no accent is given.
export const DEFAULT_GUILD_ACCENT = '#5f8fa6';
const BACKGROUND = '#1f2124';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Mixes a `#rrggbb` colour toward black (amount < 0) or white (amount > 0).
function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const channels = [1, 3, 5].map(i => {
    const value = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(value + (target - value) * t)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// `2025-03` → `Mar 2025`; anything else → ''.
export function formatSince(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return '';
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${match[1]}` : '';
}

export interface ProgressionRow {
  label: string;
  down: number;
  total: number;
}

// `short:down:total` items; malformed ones are dropped and down is capped at total.
export function readProgression(context: ThemeContext): ProgressionRow[] {
  return listParam(context, 'prog', { maxItems: 12, maxLength: 32 })
    .flatMap(item => {
    const [label, down, total] = item.split(':');
    const d = Number(down);
    const t = Number(total);
    if (!label || !Number.isInteger(d) || !Number.isInteger(t) || t <= 0 || t > 99 || d < 0) return [];
    return [{ label: label.trim(), down: Math.min(d, t), total: t }];
    })
    .slice(0, 4);
}

export interface TopParser {
  name: string;
  className: string;
  score: number | null;
}

export function readTopParsers(context: ThemeContext): TopParser[] {
  return listParam(context, 'top', { maxItems: 3, maxLength: 48 }).flatMap(item => {
    const [name, className = '', score = ''] = item.split(':');
    if (!name?.trim()) return [];
    const value = /^\d{1,3}$/.test(score) ? Math.min(100, Number(score)) : null;
    return [{ name: name.trim().slice(0, 24), className, score: value }];
  });
}

function Monogram({ name, accent }: { name: string; accent: string }) {
  const letter = (Array.from(name.trim())[0] ?? 'G').toUpperCase();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        backgroundImage: `linear-gradient(160deg, ${shade(accent, -0.45)}, ${shade(accent, -0.78)})`,
      }}
    >
      <span style={{ fontFamily: SERIF, fontSize: 110, fontWeight: 700, lineHeight: 1, color: shade(accent, 0.75) }}>
        {letter}
      </span>
    </div>
  );
}

// Fixed pixel columns: Satori collapses flexGrow/percent widths in these rows.
const PROG_LABEL_WIDTH = 230;
const PROG_BAR_WIDTH = 264;
const PROG_COUNT_WIDTH = 90;

function ProgressionBars({ rows, accent }: { rows: ProgressionRow[]; accent: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 620 }}>
      {rows.map(row => {
        const complete = row.down === row.total;
        const color = complete ? COLORS.goldHi : accent;
        return (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ display: 'flex', width: PROG_LABEL_WIDTH, flexShrink: 0, fontSize: 26, color: COLORS.foreground, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {row.label}
            </div>
            <div style={{ display: 'flex', width: PROG_BAR_WIDTH, flexShrink: 0, height: 14, borderRadius: 3, background: 'rgba(255, 255, 255, 0.07)' }}>
              <div style={{ display: 'flex', width: Math.round((row.down / row.total) * PROG_BAR_WIDTH), height: 14, borderRadius: 3, background: color }} />
            </div>
            <div
              style={{
                display: 'flex',
                width: PROG_COUNT_WIDTH,
                flexShrink: 0,
                justifyContent: 'flex-end',
                fontSize: 28,
                fontWeight: 700,
                color: complete ? COLORS.goldHi : COLORS.foreground,
              }}
            >
              {`${row.down}/${row.total}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// No progression: raids logged over the top three parsers.
function Activity({ raids, top }: { raids: number | null; top: TopParser[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 620 }}>
      {raids ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontSize: 44, fontWeight: 700, color: COLORS.foreground }}>{raids.toLocaleString('en-US')}</span>
          <span style={{ fontSize: 24, color: COLORS.muted }}>{raids === 1 ? 'raid logged' : 'raids logged'}</span>
        </div>
      ) : null}
      {top.map((parser, index) => (
        <div key={`${parser.name}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ width: 28, fontSize: 24, color: COLORS.muted }}>{`${index + 1}.`}</span>
          <span style={{ width: 300, fontSize: 28, fontWeight: 600, color: classColor(parser.className), overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {parser.name}
          </span>
          {parser.score !== null ? (
            <span style={{ fontSize: 28, fontWeight: 700, color: parseColor(parser.score) }}>{String(parser.score)}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.05, color: color ?? COLORS.foreground }}>{value}</span>
      <span style={{ fontSize: 21, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.muted }}>{label}</span>
    </div>
  );
}

async function render(props: ThemeProps, context: ThemeContext): Promise<React.ReactElement> {
  const { host, product } = chromeParams(context);
  const accent = props.accent ?? DEFAULT_GUILD_ACCENT;
  const name = param(context, 'name', 32) || 'Guild';
  const realm = param(context, 'realm', 40);
  const tag = param(context, 'tag', 24);
  const members = intParam(context, 'members', { min: 0, max: 99999 });
  const since = formatSince(param(context, 'since', 7));
  const prog = readProgression(context);
  const raids = intParam(context, 'raids', { min: 0, max: 999999 });
  const top = prog.length > 0 ? [] : readTopParsers(context);
  const best = intParam(context, 'best', { min: 1, max: 24 * 3600 });
  const bestRaid = param(context, 'bestraid', 12);
  const avg = intParam(context, 'avg', { min: 0, max: 100 });
  const markSrc = await markImage();

  const subline = [
    realm,
    product,
    members ? `${members.toLocaleString('en-US')} ${members === 1 ? 'raider' : 'raiders'}` : '',
    since ? `raiding since ${since}` : '',
  ].filter(Boolean);
  const nameSize = fitFontSize(name, [
    [12, 88],
    [16, 72],
    [22, 58],
    [Infinity, 50],
  ]);
  const hasBody = prog.length > 0 || top.length > 0 || Boolean(raids);
  const hasStats = best !== null || avg !== null;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: SANS, color: COLORS.foreground, background: BACKGROUND }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          display: 'flex',
          backgroundImage: `radial-gradient(circle at 12% 30%, ${rgba(accent, 0.3)} 0%, ${rgba(accent, 0.05)} 40%, rgba(31, 33, 36, 0) 65%)`,
        }}
      />
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 8, display: 'flex', background: accent }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '50px 64px 42px 72px',
        }}
      >
        <Header
          markSrc={markSrc}
          chip={tag ? `Guild · ${tag}` : 'Guild'}
          chipStyle={{ borderColor: shade(accent, -0.45), color: shade(accent, 0.5) }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <div
            style={{
              display: 'flex',
              width: 190,
              height: 190,
              flexShrink: 0,
              overflow: 'hidden',
              borderRadius: 14,
              border: `3px solid ${accent}`,
              background: BACKGROUND,
            }}
          >
            {props.iconSrc ? <Img src={props.iconSrc} width={184} height={184} /> : <Monogram name={name} accent={accent} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 834 }}>
            <div style={{ display: 'block', lineClamp: 2, textWrap: 'pretty', fontFamily: SERIF, fontSize: nameSize, fontWeight: 700, lineHeight: 1.08 }}>
              {name}
            </div>
            {subline.length > 0 ? (
              <div style={{ display: 'block', lineClamp: 2, fontSize: 28, lineHeight: 1.3, color: COLORS.muted }}>{subline.join(' · ')}</div>
            ) : null}
          </div>
        </div>

        {hasBody || hasStats ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 48 }}>
            {prog.length > 0 ? <ProgressionBars rows={prog} accent={accent} /> : hasBody ? <Activity raids={raids} top={top} /> : null}
            {hasStats ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {best !== null ? <Stat value={formatDuration(best)} label={bestRaid ? `Best ${bestRaid} clear` : 'Best clear'} /> : null}
                {avg !== null ? <Stat value={String(avg)} label="Avg parse" color={parseColor(avg)} /> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <Footer host={host} cta="See our raids" />
      </div>
    </div>
  );
}

export const guildTheme: ThemeDefinition = {
  loadFonts: loadKitFonts,
  render,
  fontFamily: SANS,
};
