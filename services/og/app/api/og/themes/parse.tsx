// Parse card (template=parse) for /s/{code} shares of one player on one boss
// kill. api/og.go (parseCardParams) writes every value into the signed URL.
//
//   player, class, spec, boss, raid, guild, metric (dps|hps), value, dur
//   score, rank, of        the boss parse; without score the card leads with
//   raidrank               value and the raid rank (the DPS-hero fallback)
import {
  chromeParams,
  classColor,
  COLORS,
  Footer,
  formatDuration,
  Header,
  intParam,
  loadKitFonts,
  loadNameFonts,
  markImage,
  param,
  parseColor,
  SANS,
  SERIF,
} from './kit';
import { fitFontSize, FILL } from './shared';
import type { ThemeContext, ThemeDefinition, ThemeFont, ThemeProps } from './types';

const BAR = 12;
const RING = 280;
const RING_STROKE = 20;

// One line, clipped with an ellipsis (Satori needs display block and a single string child).
const ONE_LINE: React.CSSProperties = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

const LABEL: React.CSSProperties = { fontSize: 21, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.muted };

// `#rrggbb` → rgba() at `alpha`.
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function titleCase(text: string): string {
  return text.replace(/\b\p{L}/gu, letter => letter.toUpperCase());
}

// `1284.6` → `1,284.6`; `900` → `900`. Not a positive number → null.
export function formatMetric(raw: string): string | null {
  if (!/^\d{1,9}(\.\d)?$/.test(raw) || Number(raw) <= 0) return null;
  const [whole, tenth] = raw.split('.');
  return tenth ? `${thousands(Number(whole))}.${tenth}` : thousands(Number(whole));
}

export interface ParseCardData {
  player: string;
  className: string;
  spec: string;
  boss: string;
  raid: string;
  guild: string;
  metric: 'DPS' | 'HPS';
  value: string | null;
  duration: string;
  score: number | null;
  rank: number | null;
  of: number | null;
  raidRank: number | null;
}

export function parseCardData(context: ThemeContext): ParseCardData {
  const rank = intParam(context, 'rank', { min: 1, max: 9_999_999 });
  const of = intParam(context, 'of', { min: 1, max: 9_999_999 });
  const dur = intParam(context, 'dur', { min: 1, max: 86_400 });
  return {
    player: param(context, 'player', 20) || 'Unknown',
    className: param(context, 'class', 20),
    spec: param(context, 'spec', 20),
    boss: param(context, 'boss', 40),
    raid: param(context, 'raid', 48),
    guild: param(context, 'guild', 32),
    metric: param(context, 'metric', 3).toLowerCase() === 'hps' ? 'HPS' : 'DPS',
    value: formatMetric(param(context, 'value', 12)),
    duration: dur !== null ? formatDuration(dur) : '',
    score: intParam(context, 'score', { min: 0, max: 100 }),
    // `#3 / 1,412` needs both halves, and never a rank past the sample.
    rank: rank !== null && of !== null && rank <= of ? rank : null,
    of: rank !== null && of !== null && rank <= of ? of : null,
    raidRank: intParam(context, 'raidrank', { min: 1, max: 999 }),
  };
}

// The parse ring: a faint track and the score's share of the circle in its
// tier colour, drawn as SVG (resvg rasterises stroke-dasharray), with the
// score centred over it.
function Ring({ score }: { score: number }) {
  const color = parseColor(score);
  const r = (RING - RING_STROKE) / 2;
  const c = RING / 2;
  const circumference = 2 * Math.PI * r;
  const arc = (Math.min(100, Math.max(0, score)) / 100) * circumference;
  return (
    <div style={{ display: 'flex', position: 'relative', width: RING, height: RING }}>
      <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255, 255, 255, 0.09)" strokeWidth={RING_STROKE} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${arc.toFixed(1)} ${circumference.toFixed(1)}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: RING,
          height: RING,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 120, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color }}>{String(score)}</span>
        <span style={{ ...LABEL, marginTop: 4 }}>Parse</span>
      </div>
    </div>
  );
}

// The DPS-hero fallback's right column: the metric value and the raid rank.
function MetricHero({ data }: { data: ParseCardData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      <span style={{ fontSize: 104, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em' }}>{data.value ?? ''}</span>
      <span style={LABEL}>{data.metric}</span>
      {data.raidRank !== null ? (
        <div
          style={{
            display: 'flex',
            marginTop: 14,
            padding: '8px 18px',
            borderRadius: 4,
            border: `2px solid ${withAlpha(COLORS.goldHi, 0.55)}`,
            background: withAlpha(COLORS.goldHi, 0.12),
            fontSize: 28,
            fontWeight: 700,
            color: COLORS.goldHi,
          }}
        >
          {`#${data.raidRank} in raid`}
        </div>
      ) : null}
    </div>
  );
}

interface StatItem {
  key: string;
  label: string;
  node: React.ReactNode;
}

function StatRow({ stats }: { stats: StatItem[] }) {
  return (
    <div style={{ display: 'flex', gap: 30, alignItems: 'stretch' }}>
      {stats.flatMap((stat, index) => [
        index > 0 ? <div key={`rule-${stat.key}`} style={{ width: 2, background: COLORS.rule }} /> : null,
        <div key={stat.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {stat.node}
          <span style={LABEL}>{stat.label}</span>
        </div>,
      ])}
    </div>
  );
}

const STAT_VALUE: React.CSSProperties = { fontSize: 50, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' };

function stats(data: ParseCardData, hasParse: boolean): StatItem[] {
  const out: StatItem[] = [];
  if (hasParse && data.value) {
    out.push({ key: 'value', label: data.metric, node: <span style={STAT_VALUE}>{data.value}</span> });
  }
  if (data.duration) {
    out.push({ key: 'dur', label: 'Kill time', node: <span style={STAT_VALUE}>{data.duration}</span> });
  }
  if (hasParse && data.rank !== null && data.of !== null) {
    // Two spans in a flex row: Satori has no inline text flow.
    out.push({
      key: 'rank',
      label: 'Rank',
      node: (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={STAT_VALUE}>{`#${thousands(data.rank)}`}</span>
          <span style={{ fontSize: 30, fontWeight: 600, color: COLORS.muted }}>{`/ ${thousands(data.of)}`}</span>
        </div>
      ),
    });
  }
  return out;
}

async function render(_props: ThemeProps, context: ThemeContext): Promise<React.ReactElement> {
  const { host, product } = chromeParams(context);
  const data = parseCardData(context);
  const color = classColor(data.className);
  const hasParse = data.score !== null;
  const markSrc = await markImage();

  const nameSize = fitFontSize(data.player, [
    [10, 96],
    [14, 80],
    [Infinity, 64],
  ]);
  const specLine = [[data.spec, titleCase(data.className)].filter(Boolean).join(' '), data.guild ? `<${data.guild}>` : ''].filter(Boolean).join(' · ');
  const meta = [data.raid, product].filter(Boolean).join(' · ');
  const row = stats(data, hasParse);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: SANS, color: COLORS.foreground, background: COLORS.background }}>
      <div style={{ ...FILL, backgroundImage: `radial-gradient(circle at 84% 48%, ${withAlpha(color, 0.18)} 0%, rgba(32, 32, 32, 0) 50%)` }} />
      {/* The class bar: an absolute div with an explicit width. */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: BAR, height: 630, display: 'flex', background: color }} />

      <div style={{ ...FILL, flexDirection: 'column', justifyContent: 'space-between', padding: '50px 64px 42px 72px' }}>
        <Header markSrc={markSrc} chip={hasParse ? 'Boss parse' : 'Boss kill'} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26, width: 700 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ ...ONE_LINE, fontFamily: SERIF, fontSize: nameSize, fontWeight: 700, lineHeight: 1.1, color }}>{data.player}</span>
              {specLine ? <span style={{ ...ONE_LINE, fontSize: 28 }}>{specLine}</span> : null}
              {data.boss ? (
                <span style={{ ...ONE_LINE, fontFamily: SERIF, fontSize: 46, lineHeight: 1.15, color: COLORS.goldHi, marginTop: 6 }}>{data.boss}</span>
              ) : null}
              {meta ? <span style={{ ...ONE_LINE, fontSize: 24, color: COLORS.muted }}>{meta}</span> : null}
            </div>
            {row.length > 0 ? <StatRow stats={row} /> : null}
          </div>
          {hasParse ? <Ring score={data.score!} /> : data.value ? <MetricHero data={data} /> : null}
        </div>

        <Footer host={host} cta="See the full parse" />
      </div>
    </div>
  );
}

// Cyrillic and CJK names need fonts beyond the latin kit cuts (loadNameFonts).
async function loadFonts(context: ThemeContext): Promise<ThemeFont[]> {
  const text = ['player', 'guild', 'realm', 'boss', 'raid'].map(key => param(context, key, 48)).join('');
  const [kit, names] = await Promise.all([loadKitFonts(), loadNameFonts(text)]);
  return [...kit, ...names];
}

export const parseTheme: ThemeDefinition = {
  loadFonts,
  render,
  fontFamily: SANS,
};
