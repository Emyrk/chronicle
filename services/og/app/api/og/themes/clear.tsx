// Clear-time card (template=clear) for a qualified fast clear on
// /instances/{idOrSlug}. api/og.go (clearCardParams) writes every value into
// the signed URL.
import {
  chromeParams,
  COLORS,
  Footer,
  formatDuration,
  Header,
  intParam,
  listParam,
  loadKitFonts,
  loadNameFonts,
  markImage,
  param,
  SANS,
  SERIF,
} from './kit';
import { fitFontSize, FILL } from './shared';
import type { ThemeContext, ThemeDefinition, ThemeFont, ThemeProps } from './types';

const TIMER_GOLD = '#e6c46c';
const DELTA_GREEN = '#4ade80';
const SPLIT_SHADES = ['#9a8558', '#7f6d48'];
// More splits than this → label every other boss, counted back from the last.
const MAX_LABELS = 8;

export interface Split {
  name: string;
  secs: number;
}

// `name:secs` items with a positive duration; at most 20 splits.
export function splitEntries(context: ThemeContext): Split[] {
  return listParam(context, 'splits', { maxItems: 20, maxLength: 32 }).flatMap(item => {
    const [name = '', secs = ''] = item.split(':');
    const value = /^\d{1,6}$/.test(secs.trim()) ? Number(secs.trim()) : 0;
    const label = Array.from(name.trim()).slice(0, 16).join('');
    return label && value > 0 ? [{ name: label, secs: value }] : [];
  });
}

// Which split indexes carry a label: all of them up to MAX_LABELS, else every
// other one counted back from the last, so the final boss is always named.
export function labelledSplits(count: number): boolean[] {
  return Array.from({ length: count }, (_, index) => count <= MAX_LABELS || (count - 1 - index) % 2 === 0);
}

// `−1:04` for a negative delta in seconds; '' for zero or positive.
export function formatDelta(seconds: number | null): string {
  return seconds !== null && seconds < 0 ? `−${formatDuration(-seconds)}` : '';
}

function Splits({ splits }: { splits: Split[] }) {
  const labelled = labelledSplits(splits.length);
  const last = splits.length - 1;
  // A label spans its own segment and the unlabelled one after it, so the
  // label cells line up with the segments.
  const cells: Array<{ name: string; grow: number; isLast: boolean }> = [];
  splits.forEach((split, index) => {
    if (labelled[index]) cells.push({ name: split.name, grow: split.secs, isLast: index === last });
    else if (cells.length > 0) cells[cells.length - 1].grow += split.secs;
    else cells.push({ name: '', grow: split.secs, isLast: false });
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', height: 22, gap: 4 }}>
        {splits.map((split, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              flexGrow: split.secs,
              flexBasis: 0,
              height: '100%',
              borderRadius: 2,
              background: index === last ? TIMER_GOLD : SPLIT_SHADES[index % 2],
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, fontSize: 19, color: COLORS.muted }}>
        {cells.map((cell, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              flexGrow: cell.grow,
              flexBasis: 0,
              minWidth: 0,
              overflow: 'hidden',
              justifyContent: cell.isLast && cells.length > 1 ? 'flex-end' : 'flex-start',
              color: cell.isLast ? TIMER_GOLD : COLORS.muted,
            }}
          >
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

async function render(_props: ThemeProps, context: ThemeContext): Promise<React.ReactElement> {
  const { host, product } = chromeParams(context);
  const guild = param(context, 'guild', 32);
  const raid = param(context, 'raid', 48) || 'Raid';
  const realm = param(context, 'realm', 32);
  const ms = intParam(context, 'ms', { min: 0, max: 7 * 86400 * 1000 }) ?? 0;
  const score = intParam(context, 'score', { min: 0, max: 100 });
  const rank = intParam(context, 'rank', { min: 1, max: 999999 });
  const of = intParam(context, 'of', { min: 1, max: 999999 });
  const realmRank = intParam(context, 'realmrank', { min: 1, max: 9999 });
  const delta = formatDelta(intParam(context, 'delta', { min: -86400, max: 86400 }));
  const wipes = intParam(context, 'wipes', { min: 0, max: 999 });
  const players = intParam(context, 'players', { min: 0, max: 999 });
  const splits = splitEntries(context);
  const markSrc = await markImage();

  const timer = formatDuration(Math.floor(ms / 1000)) || '0:00';
  // `h:mm:ss` is two characters wider than `mm:ss`; both fill the left column.
  const timerSize = fitFontSize(timer, [[5, 200], [Infinity, 150]]);

  // No realm rank (or one outside the board) → the time-parse percentile.
  const pill = realmRank !== null && realm ? `#${realmRank} on ${realm}` : score !== null ? `Top ${Math.max(1, 100 - score)}%` : '';
  const clears = `${of} clears`;
  const standing =
    of === null || score === null
      ? ''
      : realmRank === null && rank !== null
        ? `#${rank} of ${clears}`
        : `Faster than ${score}% of ${clears}`;
  const meta = [
    product,
    splits.length > 0 ? `${splits.length} ${splits.length === 1 ? 'boss' : 'bosses'}` : '',
    wipes !== null ? `${wipes} ${wipes === 1 ? 'wipe' : 'wipes'}` : '',
    players !== null ? `${players} raiders` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const name = guild ? `<${guild}>` : raid;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: SANS, color: COLORS.foreground, background: COLORS.background }}>
      <div style={{ ...FILL, backgroundImage: 'radial-gradient(circle at 22% 38%, rgba(196, 166, 110, 0.2) 0%, rgba(32, 32, 32, 0) 52%)' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 8, display: 'flex', background: COLORS.goldHi }} />

      <div style={{ ...FILL, flexDirection: 'column', justifyContent: 'space-between', padding: '46px 64px 40px 72px' }}>
        <Header markSrc={markSrc} chip={`Speedrun · ${raid}`} chipStyle={{ color: COLORS.goldHi, borderColor: COLORS.gold }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 48, marginTop: -8 }}>
          <span style={{ display: 'flex', flexShrink: 0, fontSize: timerSize, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color: TIMER_GOLD }}>
            {timer}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, minWidth: 0 }}>
            {pill ? (
              <div style={{ display: 'flex', padding: '8px 18px', borderRadius: 4, background: TIMER_GOLD, color: '#1b1813', fontSize: 34, fontWeight: 700 }}>
                {pill}
              </div>
            ) : null}
            {standing ? <span style={{ fontSize: 28, color: COLORS.foreground }}>{standing}</span> : null}
            {delta ? (
              <span style={{ fontSize: 28, fontWeight: 600, color: DELTA_GREEN }}>{`${delta} vs. previous record`}</span>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
            <span
              style={{
                display: 'block',
                lineClamp: 1,
                maxWidth: 720,
                fontFamily: SERIF,
                fontSize: fitFontSize(name, [[18, 50], [Infinity, 46]]),
                fontWeight: 700,
                lineHeight: 1.1,
              }}
            >
              {name}
            </span>
            {meta ? <span style={{ display: 'flex', flexShrink: 0, fontSize: 24, color: COLORS.muted, paddingBottom: 6 }}>{meta}</span> : null}
          </div>
          {splits.length > 0 ? <Splits splits={splits} /> : null}
        </div>

        <Footer host={`${host}/leaderboards/speedruns`} cta="Can your guild beat it?" />
      </div>
    </div>
  );
}

// Cyrillic and CJK guild, realm or raid names load their fonts before the
// render (kit loadNameFonts), so next/og never fetches one while drawing.
async function loadFonts(context: ThemeContext): Promise<ThemeFont[]> {
  const text = [param(context, 'guild', 32), param(context, 'realm', 32), param(context, 'raid', 48)].join('');
  const [kit, names] = await Promise.all([loadKitFonts(), loadNameFonts(text)]);
  return [...kit, ...names];
}

export const clearTheme: ThemeDefinition = {
  loadFonts,
  render,
  fontFamily: SANS,
};
