// Leaderboard hub card (template=leaderboard) for /leaderboards routes.
// api serviceog writes every value into the signed URL: up to three boards
// (`b1`..`b3` titles, `r1`..`r3` rows). One board draws as a tall list; two
// or three draw side by side. Rows carry no rank numbers, like the hub boards.
// `spread` swaps the boards for per-spec parse-tier bars (Parsing), and
// `awards` adds a Renown-per-boss bar under the content (Rulesets).
import {
  artImage,
  chromeParams,
  classColor,
  COLORS,
  Footer,
  formatDuration,
  Header,
  headerLogoImage,
  listParam,
  parseColor,
  loadKitFonts,
  loadNameFonts,
  param,
  SANS,
  SERIF,
} from './kit';
import { FILL, fitFontSize } from './shared';
import type { ThemeContext, ThemeDefinition, ThemeFont, ThemeProps } from './types';

// Value colours: the hub's rating accents (Ratings/ratingThemes.ts), gold for
// emerald for times, plain otherwise. Peak and Mastery are not parses, so no parse tiers.
const TONES = {
  peak: '#e2b25a',
  mastery: '#72aac6',
  renown: '#b394e6',
  gold: COLORS.goldHi,
  // Whole seconds, drawn as h:mm:ss / m:ss (a ':' would split the row).
  // Emerald like the hub's clock icons, so times never read as Peak gold.
  time: '#6ee7b7',
  plain: COLORS.foreground,
} as const;

export type Tone = keyof typeof TONES;

export interface BoardRow {
  name: string;
  // Player class for a class-coloured name; `guild` draws `<Name>`; '' is plain.
  kind: string;
  value: string;
  tone: Tone;
  // Small muted text under the name (spec, guild, boss).
  sub: string;
}

export interface Board {
  title: string;
  rows: BoardRow[];
}

const MAX_BOARDS = 3;

// `name:kind:value:tone:sub` items. Rows need a name and a value.
export function boardRows(context: ThemeContext, key: string, maxItems: number): BoardRow[] {
  return listParam(context, key, { maxItems, maxLength: 120 }).flatMap(item => {
    const [name = '', kind = '', value = '', tone = '', sub = ''] = item.split(':').map(part => part.trim());
    const cleanName = Array.from(name).slice(0, 28).join('');
    const seconds = tone === 'time' && /^\d{1,6}$/.test(value) ? Number(value) : null;
    const cleanValue = seconds !== null ? formatDuration(seconds) : Array.from(value).slice(0, 12).join('');
    if (!cleanName || !cleanValue) return [];
    return [
      {
        name: cleanName,
        kind: kind.toLowerCase().slice(0, 16),
        value: cleanValue,
        tone: Object.hasOwn(TONES, tone) ? (tone as Tone) : 'plain',
        sub: Array.from(sub).slice(0, 32).join(''),
      },
    ];
  });
}

// Boards with at least one row, in b1..b3 order. A lone board lists five rows.
export function boards(context: ThemeContext): Board[] {
  const titled = Array.from({ length: MAX_BOARDS }, (_, index) => ({
    title: param(context, `b${index + 1}`, 32),
    key: `r${index + 1}`,
  })).filter(board => board.title);
  const perBoard = titled.length === 1 ? 5 : 3;
  return titled
    .map(board => ({ title: board.title, rows: boardRows(context, board.key, perBoard) }))
    .filter(board => board.rows.length > 0);
}

function valueColor(row: BoardRow): string {
  return TONES[row.tone];
}

// The hub's GuildTag colour (Tailwind amber-500).
const GUILD_COLOR = '#f59e0b';

function nameColor(row: BoardRow): string {
  if (row.kind === 'guild') return GUILD_COLOR;
  if (row.kind === '') return COLORS.foreground;
  return classColor(row.kind);
}

function displayName(row: BoardRow): string {
  return row.kind === 'guild' ? `<${row.name}>` : row.name;
}

function Row({ row, size, first }: { row: BoardRow; size: 'lg' | 'sm'; first: boolean }) {
  const large = size === 'lg';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: large ? '12px 0' : '10px 0',
        borderTop: first ? 'none' : `2px solid ${COLORS.rule}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flexShrink: 1 }}>
        <span
          style={{
            display: 'block',
            lineClamp: 1,
            fontSize: large ? 34 : 27,
            fontWeight: 600,
            lineHeight: 1.15,
            color: nameColor(row),
          }}
        >
          {displayName(row)}
        </span>
        {row.sub ? (
          <span style={{ display: 'block', lineClamp: 1, fontSize: large ? 21 : 18, color: COLORS.muted, marginTop: 2 }}>{row.sub}</span>
        ) : null}
      </div>
      <span
        style={{
          display: 'flex',
          flexShrink: 0,
          fontSize: large ? 38 : 30,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: valueColor(row),
        }}
      >
        {row.value}
      </span>
    </div>
  );
}

function BoardColumn({ board }: { board: Board }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 0,
        padding: '18px 24px 8px',
        border: `2px solid ${COLORS.border}`,
        borderRadius: 6,
        background: 'rgba(38, 38, 38, 0.82)',
      }}
    >
      {/* Raid names as titles (hub landing) can run long; keep them on one line. */}
      <span
        style={{
          display: 'block',
          lineClamp: 1,
          fontSize: fitFontSize(board.title, [[16, 19], [20, 16], [Infinity, 14]]),
          fontWeight: 600,
          letterSpacing: board.title.length > 16 ? '0.06em' : '0.12em',
          textTransform: 'uppercase',
          color: COLORS.goldHi,
          marginBottom: 6,
        }}
      >
        {board.title}
      </span>
      {board.rows.map((row, index) => (
        <Row key={index} row={row} size="sm" first={index === 0} />
      ))}
    </div>
  );
}

function Art({ src }: { src: string }) {
  return (
    <div style={{ ...FILL, overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={src} width={1300} height={866} style={{ position: 'absolute', left: -50, top: -140, width: 1300, height: 866, objectFit: 'cover' }} />
      <div
        style={{
          ...FILL,
          backgroundImage: 'linear-gradient(180deg, rgba(32, 32, 32, 0.78) 0%, rgba(32, 32, 32, 0.9) 45%, #202020 78%)',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- parsing spreads

// The parse tier floors a spread row carries, in order (Leaderboards/Parsing).
export const SPREAD_FLOORS = [25, 50, 75, 95, 99, 100] as const;

export interface SpreadRow {
  label: string;
  className: string;
  // DPS at each SPREAD_FLOORS tier, ascending.
  cutoffs: number[];
}

// `label:class:c25:c50:c75:c95:c99:c100` items: a spec and the DPS each parse
// tier takes. Rows with missing or descending cutoffs are dropped.
export function spreadRows(context: ThemeContext): SpreadRow[] {
  return listParam(context, 'spread', { maxItems: 5, maxLength: 120 }).flatMap(item => {
    const [label = '', className = '', ...values] = item.split(':').map(part => part.trim());
    const cutoffs = values.map(value => (/^\d{1,6}$/.test(value) ? Number(value) : NaN));
    const valid = cutoffs.length === SPREAD_FLOORS.length && cutoffs.every((value, index) => Number.isFinite(value) && (index === 0 || value >= cutoffs[index - 1]));
    const name = Array.from(label).slice(0, 28).join('');
    return name && valid ? [{ label: name, className: className.toLowerCase().slice(0, 16), cutoffs }] : [];
  });
}

// Content width (1200 − 72 − 64) less the label and value columns and gaps.
const SPREAD_LABEL_WIDTH = 300;
const SPREAD_VALUE_WIDTH = 100;
const SPREAD_BAR_WIDTH = 1064 - SPREAD_LABEL_WIDTH - SPREAD_VALUE_WIDTH - 2 * 20;

function Spreads({ title, rows }: { title: string; rows: SpreadRow[] }) {
  const top = Math.max(...rows.map(row => row.cutoffs[row.cutoffs.length - 1]), 1);
  // Start the axis a little under the lowest 25 floor so the grey run below
  // the first tier doesn't fill most of every bar.
  const start = Math.max(0, Math.min(...rows.map(row => row.cutoffs[0])) * 0.8);
  const px = (value: number) => Math.max(0, Math.round(((value - start) / (top - start || 1)) * SPREAD_BAR_WIDTH));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLORS.goldHi }}>
        <span>{title}</span>
        <span>95+ parse</span>
      </div>
      {rows.map((row, index) => {
        // Grey up to the 25 floor, then each tier's colour up to the next floor.
        const edges = [start, ...row.cutoffs];
        return (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ display: 'block', lineClamp: 1, width: SPREAD_LABEL_WIDTH, flexShrink: 0, fontSize: 24, fontWeight: 600, color: classColor(row.className) }}>{row.label}</span>
            <div style={{ display: 'flex', width: SPREAD_BAR_WIDTH, flexShrink: 0, height: 20, borderRadius: 3, overflow: 'hidden', background: 'rgba(255, 255, 255, 0.04)' }}>
              {edges.slice(1).map((edge, tier) => (
                <div
                  key={tier}
                  style={{
                    display: 'flex',
                    flexShrink: 0,
                    width: px(edge) - px(edges[tier]),
                    height: '100%',
                    background: parseColor(tier === 0 ? 0 : SPREAD_FLOORS[tier - 1]),
                    opacity: tier === 0 ? 0.35 : 0.9,
                  }}
                />
              ))}
            </div>
            <span style={{ display: 'flex', justifyContent: 'flex-end', width: SPREAD_VALUE_WIDTH, flexShrink: 0, fontSize: 28, fontWeight: 700, color: parseColor(95) }}>
              {row.cutoffs[3].toLocaleString('en-US')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- renown split

export interface Award {
  name: string;
  points: number;
}

// `boss:points` items in progression order; at most 25.
export function awardEntries(context: ThemeContext): Award[] {
  return listParam(context, 'awards', { maxItems: 25, maxLength: 48 }).flatMap(item => {
    const [name = '', points = ''] = item.split(':').map(part => part.trim());
    const value = /^\d{1,5}$/.test(points) ? Number(points) : 0;
    const label = Array.from(name).slice(0, 24).join('');
    return label && value > 0 ? [{ name: label, points: value }] : [];
  });
}

// Bosses worth at least this share of the clear are named under the bar.
const AWARD_LABEL_SHARE = 0.1;

function Awards({ awards }: { awards: Award[] }) {
  const total = awards.reduce((sum, award) => sum + award.points, 0);
  const top = Math.max(...awards.map(award => award.points));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLORS.goldHi }}>
        <span>Renown per boss</span>
        <span style={{ color: TONES.renown }}>{`${total.toLocaleString('en-US')} per clear`}</span>
      </div>
      <div style={{ display: 'flex', height: 22, gap: 4 }}>
        {awards.map((award, index) => (
          <div
            key={index}
            style={{ display: 'flex', flexGrow: award.points, flexBasis: 0, borderRadius: 2, background: TONES.renown, opacity: award.points === top ? 1 : 0.45 }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, fontSize: 19, color: COLORS.muted }}>
        {awards.map((award, index) => (
          <div key={index} style={{ display: 'flex', flexGrow: award.points, flexBasis: 0, minWidth: 0, overflow: 'hidden', justifyContent: index === awards.length - 1 ? 'flex-end' : 'flex-start' }}>
            {award.points / total >= AWARD_LABEL_SHARE ? (
              <span style={{ whiteSpace: 'nowrap', color: TONES.renown }}>{`${award.name} ${award.points}`}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

async function render(_props: ThemeProps, context: ThemeContext): Promise<React.ReactElement> {
  const { host, product } = chromeParams(context);
  const raid = param(context, 'raid', 48);
  const view = param(context, 'view', 40);
  const chip = param(context, 'chip', 40) || 'Leaderboards';
  const path = param(context, 'path', 80);
  const list = boards(context);
  const spread = spreadRows(context);
  const spreadTitle = param(context, 'spreadtitle', 48) || 'DPS by parse tier';
  const awards = awardEntries(context);
  const [logoSrc, artSrc] = await Promise.all([headerLogoImage(), artImage(context)]);

  const headline = raid || 'Raid Leaderboards';
  const meta = [view, product].filter(Boolean).join(' · ');
  const single = list.length === 1 && spread.length === 0;
  const footerHost = `${host}${path.startsWith('/') ? path : '/leaderboards'}`;

  const title = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: single ? 470 : 1060 }}>
      <div
        style={{
          display: 'block',
          lineClamp: 2,
          textWrap: 'pretty',
          fontFamily: SERIF,
          fontSize: fitFontSize(headline, single ? [[12, 72], [18, 60], [Infinity, 50]] : [[20, 72], [30, 60], [Infinity, 50]]),
          fontWeight: 700,
          lineHeight: 1.08,
        }}
      >
        {headline}
      </div>
      {single ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 28 }}>
          {view ? <span style={{ color: COLORS.goldHi }}>{view}</span> : null}
          {product ? <span style={{ color: COLORS.muted }}>{product}</span> : null}
        </div>
      ) : meta ? (
        <div style={{ display: 'flex', fontSize: 28, color: COLORS.goldHi }}>{meta}</div>
      ) : null}
    </div>
  );

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: SANS, color: COLORS.foreground, background: COLORS.background }}>
      {artSrc ? (
        <Art src={artSrc} />
      ) : (
        <div style={{ ...FILL, backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(196, 166, 110, 0.2) 0%, rgba(32, 32, 32, 0) 55%)' }} />
      )}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 8, display: 'flex', background: COLORS.goldHi }} />

      <div style={{ ...FILL, flexDirection: 'column', justifyContent: 'space-between', padding: '46px 64px 40px 72px' }}>
        <Header logoSrc={logoSrc} chip={chip} />

        {single ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 40 }}>
            {title}
            <div style={{ display: 'flex', flexDirection: 'column', width: 560 }}>
              <span style={{ display: 'flex', fontSize: 19, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLORS.goldHi, marginBottom: 2 }}>
                {list[0].title}
              </span>
              {list[0].rows.map((row, index) => (
                <Row key={index} row={row} size="lg" first={index === 0} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            {title}
            {spread.length > 0 ? <Spreads title={spreadTitle} rows={spread} /> : null}
            {spread.length === 0 && list.length > 0 ? (
              <div style={{ display: 'flex', gap: 20 }}>
                {list.map((board, index) => (
                  <BoardColumn key={index} board={board} />
                ))}
              </div>
            ) : null}
          </div>
        )}

        {awards.length > 0 ? <Awards awards={awards} /> : null}

        <Footer host={footerHost} cta="See the full leaderboard" />
      </div>
    </div>
  );
}

// Player and guild names are often CJK or Cyrillic; load those cuts first.
async function loadFonts(context: ThemeContext): Promise<ThemeFont[]> {
  const text = [
    param(context, 'raid', 48),
    ...Array.from({ length: MAX_BOARDS }, (_, index) => context.searchParams.get(`r${index + 1}`) ?? ''),
    context.searchParams.get('awards') ?? '',
  ].join('');
  const [kit, names] = await Promise.all([loadKitFonts(), loadNameFonts(text)]);
  return [...kit, ...names];
}

export const leaderboardTheme: ThemeDefinition = {
  loadFonts,
  render,
  fontFamily: SANS,
};
