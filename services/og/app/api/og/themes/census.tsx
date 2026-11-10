// Census card (template=census) for /census: Horde versus Alliance, from the
// characters seen in raid logs over `days`. serviceog writes every value into
// the signed URL.
//
//   template=census&horde=11939&alliance=11681&days=90&host=…&product=…
import { chromeParams, COLORS, Footer, Header, headerLogoImage, intParam, loadKitFonts, SANS, SERIF } from './kit';
import { FILL } from './shared';
import type { ThemeContext, ThemeDefinition, ThemeProps } from './types';

const HORDE = '#e0483a';
const ALLIANCE = '#3f8ae0';
const MAX_COUNT = 100_000_000;

const grouped = new Intl.NumberFormat('en-US');

export interface Battle {
  horde: number;
  alliance: number;
  // Horde's share, 0–100, to one decimal; 50 when nobody was counted.
  hordePct: number;
  verdict: string;
}

// Within this share of a tie, the card calls it a dead heat.
const DEAD_HEAT_PCT = 0.5;

export function battle(context: ThemeContext): Battle {
  const horde = intParam(context, 'horde', { min: 0, max: MAX_COUNT }) ?? 0;
  const alliance = intParam(context, 'alliance', { min: 0, max: MAX_COUNT }) ?? 0;
  const total = horde + alliance;
  const hordePct = total > 0 ? Math.round((horde / total) * 1000) / 10 : 50;
  const lead = Math.abs(horde - alliance);
  let verdict = 'Dead heat';
  if (total === 0) verdict = 'No battle yet';
  else if (Math.abs(hordePct - 50) >= DEAD_HEAT_PCT) verdict = `${horde > alliance ? 'Horde' : 'Alliance'} leads by ${grouped.format(lead)}`;
  else if (lead > 0) verdict = `Dead heat · ${horde > alliance ? 'Horde' : 'Alliance'} by ${grouped.format(lead)}`;
  return { horde, alliance, hordePct, verdict };
}

function Side({ name, color, pct, count, align }: { name: string; color: string; pct: number; count: number; align: 'left' | 'right' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : 'flex-end', gap: 4 }}>
      <span style={{ display: 'flex', fontFamily: SERIF, fontSize: 52, fontWeight: 700, letterSpacing: '0.04em', color }}>{name}</span>
      <span style={{ display: 'flex', fontSize: 104, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color: COLORS.foreground }}>
        {`${pct.toFixed(1)}%`}
      </span>
      <span style={{ display: 'flex', fontSize: 26, color: COLORS.muted, marginTop: 6 }}>{`${grouped.format(count)} characters`}</span>
    </div>
  );
}

async function render(_props: ThemeProps, context: ThemeContext): Promise<React.ReactElement> {
  const { host, product } = chromeParams(context);
  const days = intParam(context, 'days', { min: 1, max: 3650 });
  const fight = battle(context);
  const logoSrc = await headerLogoImage();
  const allyPct = Math.round((100 - fight.hordePct) * 10) / 10;
  // The seam sits where the factions meet, kept off the very edges.
  const seam = Math.min(96, Math.max(4, fight.hordePct));
  const chip = ['Realm census', product].filter(Boolean).join(' · ');

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: SANS, color: COLORS.foreground, background: COLORS.background }}>
      <div style={{ ...FILL, backgroundImage: `radial-gradient(circle at 8% 58%, rgba(224, 72, 58, 0.3) 0%, rgba(32, 32, 32, 0) 48%)` }} />
      <div style={{ ...FILL, backgroundImage: `radial-gradient(circle at 92% 58%, rgba(63, 138, 224, 0.3) 0%, rgba(32, 32, 32, 0) 48%)` }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 8, display: 'flex', background: COLORS.goldHi }} />

      <div style={{ ...FILL, flexDirection: 'column', justifyContent: 'space-between', padding: '46px 64px 40px 72px' }}>
        <Header logoSrc={logoSrc} chip={chip} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Side name="HORDE" color={HORDE} pct={fight.hordePct} count={fight.horde} align="left" />
            <span style={{ display: 'flex', fontFamily: SERIF, fontSize: 44, fontWeight: 700, color: COLORS.goldHi, paddingBottom: 66 }}>vs</span>
            <Side name="ALLIANCE" color={ALLIANCE} pct={allyPct} count={fight.alliance} align="right" />
          </div>

          <div style={{ display: 'flex', position: 'relative', height: 30 }}>
            <div style={{ display: 'flex', width: '100%', height: 30, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ display: 'flex', width: `${seam}%`, height: '100%', backgroundImage: `linear-gradient(90deg, #8f241b 0%, ${HORDE} 100%)` }} />
              <div style={{ display: 'flex', flexGrow: 1, height: '100%', backgroundImage: `linear-gradient(90deg, ${ALLIANCE} 0%, #1f4f8f 100%)` }} />
            </div>
            {/* The clash: a gold spark where the two lines meet. */}
            <div
              style={{
                position: 'absolute',
                top: -9,
                left: `${seam}%`,
                width: 6,
                height: 48,
                marginLeft: -3,
                display: 'flex',
                borderRadius: 3,
                background: '#f5dfa6',
                boxShadow: '0 0 18px 6px rgba(245, 223, 166, 0.55)',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: COLORS.goldHi }}>{fight.verdict}</span>
            <span style={{ display: 'flex', fontSize: 22, color: COLORS.muted }}>
              {days ? `Raiders seen in logs over the last ${days} days` : 'Raiders seen in logs'}
            </span>
          </div>
        </div>

        <Footer host={`${host}/census`} cta="Pick your side" />
      </div>
    </div>
  );
}

export const censusTheme: ThemeDefinition = {
  loadFonts: loadKitFonts,
  render,
  fontFamily: SANS,
};
