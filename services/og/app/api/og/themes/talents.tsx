// Talent build card for /talents/{class}?build=. api/og.go sends:
//   class=mage  spec=Fire  points=17-34-0 (one number for a pet)  keys=a,b,c
// plus the kit's host and product. Every param but class is optional.
import { fitFontSize } from './shared';
import { chromeParams, classColor, COLORS, Footer, Header, listParam, loadKitFonts, headerLogoImage, param, SANS, SERIF } from './kit';
import type { ThemeContext, ThemeDefinition } from './types';

interface TalentClass {
  name: string;
  trees: string[];
  // Points a full tree can hold; bars fill against this.
  max: number;
  color: string;
}

// Tree names match internal/wowspec (the tree order of the build string).
const CLASSES: Readonly<Record<string, TalentClass>> = {
  warrior: { name: 'Warrior', trees: ['Arms', 'Fury', 'Protection'], max: 51, color: classColor('warrior') },
  paladin: { name: 'Paladin', trees: ['Holy', 'Protection', 'Retribution'], max: 51, color: classColor('paladin') },
  hunter: { name: 'Hunter', trees: ['Beast Mastery', 'Marksmanship', 'Survival'], max: 51, color: classColor('hunter') },
  rogue: { name: 'Rogue', trees: ['Assassination', 'Combat', 'Subtlety'], max: 51, color: classColor('rogue') },
  priest: { name: 'Priest', trees: ['Discipline', 'Holy', 'Shadow'], max: 51, color: classColor('priest') },
  shaman: { name: 'Shaman', trees: ['Elemental', 'Enhancement', 'Restoration'], max: 51, color: classColor('shaman') },
  mage: { name: 'Mage', trees: ['Arcane', 'Fire', 'Frost'], max: 51, color: classColor('mage') },
  warlock: { name: 'Warlock', trees: ['Affliction', 'Demonology', 'Destruction'], max: 51, color: classColor('warlock') },
  druid: { name: 'Druid', trees: ['Balance', 'Feral', 'Restoration'], max: 51, color: classColor('druid') },
  deathknight: { name: 'Death Knight', trees: ['Blood', 'Frost', 'Unholy'], max: 71, color: '#C41F3B' },
  pet: { name: 'Hunter Pet', trees: ['Pet'], max: 20, color: classColor('hunter') },
};

const EMPTY_POINTS = '#6b6b6b';

export interface TalentTree {
  name: string;
  points: number | null;
}

export interface TalentCardModel {
  title: string;
  color: string;
  chip: string;
  // "17 / 34 / 0", or '' without a build.
  split: string;
  keys: string[];
  trees: TalentTree[];
  max: number;
  // Index of the tree with the most points, or -1.
  lead: number;
}

// Everything the card shows, from the query alone.
export function talentCardModel(context: ThemeContext): TalentCardModel {
  const { product } = chromeParams(context);
  const slug = param(context, 'class', 20).toLowerCase();
  const cls = Object.hasOwn(CLASSES, slug) ? CLASSES[slug] : null;

  const raw = param(context, 'points', 20);
  const parts = /^\d{1,3}(-\d{1,3}){0,2}$/.test(raw) ? raw.split('-').map(Number) : [];
  const treeNames = cls?.trees ?? [];
  const hasBuild = cls !== null && parts.length > 0;
  const trees = treeNames.map((name, i) => ({ name, points: hasBuild ? (parts[i] ?? 0) : null }));

  let lead = -1;
  let most = 0;
  trees.forEach((tree, i) => {
    if ((tree.points ?? 0) > most) [lead, most] = [i, tree.points ?? 0];
  });

  const spec = param(context, 'spec', 24);
  let title = 'Talent Calculator';
  if (cls && !hasBuild) title = `${cls.name} Talent Calculator`;
  else if (cls) title = spec && spec !== 'Unknown' && slug !== 'pet' ? `${spec} ${cls.name}` : cls.name;

  return {
    title,
    color: cls?.color ?? COLORS.goldHi,
    chip: [hasBuild ? 'Talent build' : 'Talent calculator', product].filter(Boolean).join(' · '),
    split: !hasBuild ? '' : trees.length === 1 ? `${trees[0].points} points` : trees.map(tree => tree.points).join(' / '),
    keys: hasBuild ? listParam(context, 'keys', { maxItems: 3, maxLength: 28 }) : [],
    trees,
    max: cls?.max ?? 51,
    lead,
  };
}

// `#rrggbb` → rgba() at `alpha`, or mixed toward black by `shade` (0..1).
function rgba(hex: string, alpha: number, shade = 0): string {
  const [r, g, b] = [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - shade)));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function Tree({ tree, color, max, lead }: { tree: TalentTree; color: string; max: number; lead: boolean }) {
  const points = tree.points ?? 0;
  const fill = Math.min(100, (points / max) * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 118 }}>
      <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, color: lead ? color : points ? COLORS.foreground : EMPTY_POINTS }}>
        {tree.points === null ? ' ' : String(points)}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          width: 84,
          height: 200,
          background: 'rgba(255, 255, 255, 0.06)',
          border: '2px solid rgba(255, 255, 255, 0.07)',
          borderRadius: 4,
        }}
      >
        {fill > 0 ? (
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: `${fill.toFixed(1)}%`,
              backgroundImage: `linear-gradient(180deg, ${color}, ${rgba(color, 1, 0.6)})`,
              borderRadius: 2,
            }}
          />
        ) : null}
      </div>
      {/* One line so the bars stay level; long names spill into the gap. */}
      <div style={{ display: 'flex', height: 28, alignItems: 'center', fontSize: tree.name.length > 10 ? 18 : 22, fontWeight: 600, color: COLORS.muted, whiteSpace: 'nowrap' }}>
        {tree.name}
      </div>
    </div>
  );
}

async function render(_props: unknown, context: ThemeContext): Promise<React.ReactElement> {
  const model = talentCardModel(context);
  const { host } = chromeParams(context);
  const logoSrc = await headerLogoImage();
  // At least 62px at 1200 wide, so it reads in a 400px embed.
  const titleSize = fitFontSize(model.title, [
    [10, 104],
    [14, 88],
    [18, 72],
    [Infinity, 62],
  ]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: COLORS.background, fontFamily: SANS, color: COLORS.foreground }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          backgroundImage: `linear-gradient(90deg, ${rgba(model.color, 0.16)} 0%, ${rgba(model.color, 0.05)} 35%, rgba(32, 32, 32, 0) 60%)`,
        }}
      />
      <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 630, background: model.color }} />
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
          padding: '50px 72px 42px 86px',
        }}
      >
        <Header logoSrc={logoSrc} chip={model.chip} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: model.trees.length > 1 ? 620 : 840 }}>
            <div
              style={{
                display: 'block',
                lineClamp: 2,
                textWrap: 'pretty',
                fontFamily: SERIF,
                fontSize: titleSize,
                fontWeight: 700,
                lineHeight: 1.1,
                color: model.color,
              }}
            >
              {model.title}
            </div>
            {model.split ? <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, color: COLORS.foreground }}>{model.split}</div> : null}
            {model.keys.length > 0 ? (
              <div style={{ display: 'flex', marginTop: 6, fontSize: 26, color: COLORS.muted }}>{model.keys.join(' · ')}</div>
            ) : null}
          </div>
          {model.trees.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 30, height: 330 }}>
              {model.trees.map((tree, i) => (
                <Tree key={tree.name + i} tree={tree} color={model.color} max={model.max} lead={i === model.lead} />
              ))}
            </div>
          ) : null}
        </div>
        <Footer host={`${host}/talents`} cta="Open in the calculator" />
      </div>
    </div>
  );
}

export const talentsTheme: ThemeDefinition = {
  loadFonts: loadKitFonts,
  render,
  fontFamily: SANS,
};
