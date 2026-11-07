// Raid report card (template=raid) for /instances/{idOrSlug}. api/og.go
// (raidCardParams) writes every value into the signed URL.
import {
  artImage,
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
import { fitFontSize, FILL } from './shared';
import type { ThemeContext, ThemeDefinition, ThemeProps } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// `2026-11-06` → `Nov 6`; anything else → ''.
export function shortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return '';
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${MONTHS[month - 1]} ${day}`;
}

function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface RaidTopEntry {
  name: string;
  className: string;
  dps: number;
}

// `name:class:dps` items; capped at 5 entries, names at 16 characters.
export function topEntries(context: ThemeContext): RaidTopEntry[] {
  return listParam(context, 'top', { maxItems: 5, maxLength: 48 }).flatMap(item => {
    const [name = '', className = '', dps = ''] = item.split(':');
    const value = /^\d{1,9}$/.test(dps.trim()) ? Number(dps.trim()) : 0;
    const shortName = Array.from(name.trim()).slice(0, 16).join('');
    return shortName && value > 0 ? [{ name: shortName, className: className.trim(), dps: value }] : [];
  });
}

// `class:count` items with a positive count.
export function compEntries(context: ThemeContext): Array<{ className: string; count: number }> {
  return listParam(context, 'comp', { maxItems: 12, maxLength: 24 }).flatMap(item => {
    const [className = '', count = ''] = item.split(':');
    const value = /^\d{1,4}$/.test(count.trim()) ? Number(count.trim()) : 0;
    return className.trim() && value > 0 ? [{ className: className.trim(), count: value }] : [];
  });
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 58, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: color ?? COLORS.foreground }}>
        {value}
      </span>
      <span style={{ fontSize: 21, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.muted }}>
        {label}
      </span>
    </div>
  );
}

function StatRow({ stats }: { stats: Array<{ value: string; label: string; color?: string }> }) {
  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'stretch' }}>
      {stats.flatMap((stat, index) => [
        index > 0 ? <div key={`rule-${stat.label}`} style={{ width: 2, background: 'rgba(255, 255, 255, 0.09)' }} /> : null,
        <Stat key={stat.label} {...stat} />,
      ])}
    </div>
  );
}

function TopDamage({ entries }: { entries: RaidTopEntry[] }) {
  // Don't trust the param order: scale to the largest entry.
  const max = Math.max(1, ...entries.map(entry => entry.dps));
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 430,
        gap: 14,
        padding: '22px 24px',
        background: 'rgba(18, 18, 18, 0.8)',
        border: `2px solid ${COLORS.rule}`,
        borderRadius: 6,
      }}
    >
      <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '0.14em', color: COLORS.muted }}>TOP DAMAGE</span>
      {entries.map((entry, index) => (
        <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26 }}>
            <span style={{ color: classColor(entry.className), fontWeight: 600 }}>{entry.name}</span>
            <span style={{ fontWeight: 700 }}>{thousands(entry.dps)}</span>
          </div>
          <div style={{ display: 'flex', height: 8, background: 'rgba(255, 255, 255, 0.07)', borderRadius: 3 }}>
            <div
              style={{
                display: 'flex',
                width: `${Math.max(2, (entry.dps / max) * 100).toFixed(1)}%`,
                height: '100%',
                borderRadius: 3,
                background: classColor(entry.className),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// The loading screens are 512×341 with the WoW logo baked into the top and a
// frame along the bottom. Oversize the image so both fall outside the canvas,
// keep it to the right of the text, and wash it so the upscale reads soft on
// purpose rather than blurry.
function Art({ src }: { src: string }) {
  return (
    <div style={{ ...FILL, overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img
        src={src}
        width={1140}
        height={760}
        style={{ position: 'absolute', left: 210, top: -96, width: 1140, height: 760, objectFit: 'cover' }}
      />
      <div
        style={{
          ...FILL,
          backgroundImage:
            'linear-gradient(90deg, #202020 0%, #202020 34%, rgba(32, 32, 32, 0.82) 52%, rgba(32, 32, 32, 0.5) 76%, rgba(32, 32, 32, 0.38) 100%)',
        }}
      />
      <div
        style={{
          ...FILL,
          backgroundImage: 'linear-gradient(180deg, rgba(32, 32, 32, 0.55) 0%, rgba(32, 32, 32, 0) 35%, rgba(32, 32, 32, 0) 70%, rgba(32, 32, 32, 0.6) 100%)',
        }}
      />
    </div>
  );
}

async function render(_props: ThemeProps, context: ThemeContext): Promise<React.ReactElement> {
  const { host, product } = chromeParams(context);
  const guild = param(context, 'guild', 40);
  const raid = param(context, 'raid', 48) || 'Raid';
  const realm = param(context, 'realm', 32);
  const date = shortDate(param(context, 'date', 10));
  const players = intParam(context, 'players', { min: 0, max: 999 });
  const kills = intParam(context, 'kills', { min: 0, max: 99 }) ?? 0;
  const bosses = intParam(context, 'bosses', { min: 0, max: 99 });
  const duration = intParam(context, 'dur', { min: 0, max: 7 * 86400 });
  const wipes = intParam(context, 'wipes', { min: 0, max: 999 });
  const avg = intParam(context, 'avg', { min: 0, max: 100 });
  const top = topEntries(context);
  const comp = compEntries(context);
  const [markSrc, artSrc] = await Promise.all([markImage(), artImage(context)]);

  // No ranked bosses (dungeon, custom raid) → no TOP DAMAGE panel, no avg parse.
  const ranked = top.length > 0;
  const headline = guild || raid;
  const chip = [guild ? 'Raid report' : 'PUG', date].filter(Boolean).join(' · ');
  const meta = [realm, product, players !== null ? `${players} players` : ''].filter(Boolean).join(' · ');

  const stats: Array<{ value: string; label: string; color?: string }> = [
    { value: bosses ? `${kills}/${bosses}` : String(kills), label: 'Bosses' },
  ];
  if (duration) {
    stats.push({ value: formatDuration(duration), label: bosses && kills >= bosses ? 'Clear' : 'Duration' });
  }
  if (ranked && avg !== null) {
    stats.push({ value: String(avg), label: 'Avg parse', color: parseColor(avg) });
  } else if (wipes !== null) {
    stats.push({ value: String(wipes), label: wipes === 1 ? 'Wipe' : 'Wipes' });
  }

  const headlineSize = fitFontSize(headline, ranked ? [[10, 84], [14, 72], [18, 60], [Infinity, 50]] : [[16, 84], [22, 72], [Infinity, 58]]);
  const total = comp.reduce((sum, entry) => sum + entry.count, 0);

  const title = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: ranked ? 600 : 1000 }}>
      <div
        style={{
          display: 'block',
          lineClamp: 2,
          textWrap: 'pretty',
          fontFamily: SERIF,
          fontSize: headlineSize,
          fontWeight: 700,
          lineHeight: 1.06,
        }}
      >
        {headline}
      </div>
      {guild ? (
        <div style={{ display: 'flex', fontFamily: SERIF, fontSize: 46, lineHeight: 1.1, color: COLORS.goldHi }}>{raid}</div>
      ) : null}
      {meta ? <div style={{ display: 'flex', fontSize: 26, color: COLORS.muted, marginTop: 6 }}>{meta}</div> : null}
    </div>
  );

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: SANS, color: COLORS.foreground, background: COLORS.background }}>
      {artSrc ? (
        <Art src={artSrc} />
      ) : (
        <div style={{ ...FILL, backgroundImage: 'radial-gradient(circle at 88% 30%, rgba(196, 166, 110, 0.22) 0%, rgba(32, 32, 32, 0) 55%)' }} />
      )}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 8, display: 'flex', background: COLORS.goldHi }} />

      <div style={{ ...FILL, flexDirection: 'column', justifyContent: 'space-between', padding: '50px 64px 42px 72px' }}>
        <Header markSrc={markSrc} chip={chip} />

        {ranked ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
              {title}
              <StatRow stats={stats} />
            </div>
            <TopDamage entries={top} />
          </div>
        ) : (
          title
        )}
        {ranked ? null : <StatRow stats={stats} />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {total > 0 ? (
            <div style={{ display: 'flex', height: 12, gap: 3 }}>
              {comp.map((entry, index) => (
                <div
                  key={index}
                  style={{ display: 'flex', flexGrow: entry.count, flexBasis: 0, height: '100%', borderRadius: 3, background: classColor(entry.className) }}
                />
              ))}
            </div>
          ) : null}
          <Footer host={host} cta="Analyse your raid, free" />
        </div>
      </div>
    </div>
  );
}

export const raidTheme: ThemeDefinition = {
  loadFonts: loadKitFonts,
  render,
  fontFamily: SANS,
};
