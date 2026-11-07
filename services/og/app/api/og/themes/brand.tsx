// The brand card: `/`, static routes, and the fallback for every other card
// (failed lookups, unsigned or forged URLs). It needs no params at all.
//
//   template=brand&title=…&excerpt=…&stat1=12480:raids+logged&stat2=…&host=…&product=…
import { chromeParams, COLORS, Footer, loadKitFonts, MARK, markImage, param, SANS, SERIF, wordmarkImage, WORDMARK } from './kit';
import { FILL, fitFontSize, Img } from './shared';
import type { ThemeContext, ThemeDefinition, ThemeProps } from './types';

export const BRAND_TITLE = 'Every pull, every parse, every wipe.';

// `stat1`/`stat2` are `count:label`. A count of digits is grouped (12,480) or,
// from 100,000, compacted (1.9M); anything else is printed as given. A stat
// missing either half is dropped.
export function brandStats(context: ThemeContext): Array<{ value: string; label: string }> {
  return ['stat1', 'stat2'].flatMap(key => {
    const raw = param(context, key, 60);
    const split = raw.indexOf(':');
    const value = split < 0 ? '' : raw.slice(0, split).trim();
    const label = split < 0 ? '' : raw.slice(split + 1).trim();
    return value && label ? [{ value: formatCount(value), label }] : [];
  });
}

const grouped = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function formatCount(value: string): string {
  if (!/^\d{1,15}$/.test(value)) return value;
  const n = Number(value);
  return n >= 100_000 ? compact.format(n) : grouped.format(n);
}

async function render(_props: ThemeProps, context: ThemeContext): Promise<React.ReactElement> {
  const { host, product } = chromeParams(context);
  const title = param(context, 'title', 90) || BRAND_TITLE;
  const excerpt =
    param(context, 'excerpt', 160) || `Free raid log analysis for ${product || 'World of Warcraft'}`;
  const stats = brandStats(context);
  const [markSrc, wordmarkSrc] = await Promise.all([markImage(), wordmarkImage()]);

  // Stays ≥ 52px so the hero reads at 400px wide.
  const titleSize = fitFontSize(title, [
    [40, 66],
    [64, 58],
    [Infinity, 52],
  ]);
  const markHeight = 490;
  const markWidth = Math.round((markHeight * MARK.width) / MARK.height);
  const wordmarkHeight = 94;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        fontFamily: SANS,
        color: COLORS.foreground,
        background: '#1e1e1e',
      }}
    >
      <div
        style={{
          ...FILL,
          backgroundImage:
            'radial-gradient(circle at 78% 50%, rgba(196, 166, 110, 0.20) 0%, rgba(196, 166, 110, 0.03) 40%, rgba(30, 30, 30, 0) 62%)',
        }}
      />
      <Img
        src={markSrc}
        width={markWidth}
        height={markHeight}
        style={{ position: 'absolute', left: 760, top: 70, opacity: 0.16 }}
      />

      <div
        style={{
          ...FILL,
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px 46px 72px',
        }}
      >
        <div style={{ display: 'flex' }}>
          <Img
            src={wordmarkSrc}
            width={Math.round((wordmarkHeight * WORDMARK.width) / WORDMARK.height)}
            height={wordmarkHeight}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820 }}>
          <div
            style={{
              display: 'block',
              lineClamp: 2,
              fontFamily: SERIF,
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.12,
            }}
          >
            {title}
          </div>
          <div style={{ display: 'block', lineClamp: 2, fontSize: 30, lineHeight: 1.35, color: COLORS.muted }}>
            {excerpt}
          </div>
        </div>

        {stats.length > 0 ? (
          <div style={{ display: 'flex', gap: 14 }}>
            {stats.map(stat => (
              <div
                key={stat.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 18px',
                  borderRadius: 4,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `2px solid ${COLORS.rule}`,
                  fontSize: 24,
                }}
              >
                <span style={{ color: COLORS.goldHi, fontWeight: 700 }}>{stat.value}</span>
                <span style={{ color: COLORS.muted }}>{stat.label}</span>
              </div>
            ))}
          </div>
        ) : null}

        <Footer host={host} cta="Upload your first log" />
      </div>
    </div>
  );
}

export const brandTheme: ThemeDefinition = {
  loadFonts: loadKitFonts,
  render,
  fontFamily: SANS,
};
