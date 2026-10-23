import type { Meta, StoryObj } from '@storybook/react-vite'
import { PlayerMetricChart, type PlayerMetricChartData } from './PlayerMetricChart'
import type { PlayerRowCosmetic } from './PlayerMetricChartModel'

/**
 * Concept: supporter tiers (Honored / Revered / Exalted) let a player style
 * their character name and damage bar wherever it appears in logs.
 * Bars expose the class color as `--bar-color` so styles stay class-tinted.
 */

type Tier = 'Free' | 'Honored' | 'Revered' | 'Exalted'

interface Preset {
  label: string
  tier: Tier
  description: string
  cosmetic: PlayerRowCosmetic
}

const DEFAULT_BAR = 'linear-gradient(to right, oklch(0 0 0 / 0.3), oklch(0 0 0 / 0.15)), var(--bar-color)'

const NAME_STYLES = {
  none: { label: 'Default', tier: 'Free', description: 'Plain name.', cosmetic: {} },
  bold: {
    label: 'Bold Caps',
    tier: 'Honored',
    description: 'Heavier weight, small caps, letter spacing.',
    cosmetic: { nameStyle: { fontWeight: 700, fontVariant: 'small-caps', letterSpacing: '0.04em' } },
  },
  glow: {
    label: 'Class Glow',
    tier: 'Honored',
    description: 'Soft halo in the player\'s class color.',
    cosmetic: { nameStyle: { fontWeight: 600, color: 'white', textShadow: '0 0 6px var(--bar-color, currentColor), 0 0 2px var(--bar-color, currentColor)' } },
  },
  gilded: {
    label: 'Gilded',
    tier: 'Revered',
    description: 'Static gold gradient lettering.',
    cosmetic: { nameClassName: 'cosmetic-name-gilded' },
  },
  frost: {
    label: 'Frostbitten',
    tier: 'Revered',
    description: 'Icy gradient with a cold outline.',
    cosmetic: { nameClassName: 'cosmetic-name-frost' },
  },
  fel: {
    label: 'Felfire',
    tier: 'Exalted',
    description: 'Flickering green fel flame.',
    cosmetic: { nameClassName: 'cosmetic-name-fel' },
  },
  shimmer: {
    label: 'Shimmer',
    tier: 'Exalted',
    description: 'A highlight sweeps across the name.',
    cosmetic: { nameClassName: 'cosmetic-name-shimmer' },
  },
  prismatic: {
    label: 'Prismatic',
    tier: 'Exalted',
    description: 'Slow-cycling rainbow gradient.',
    cosmetic: { nameClassName: 'cosmetic-name-prismatic' },
  },
} satisfies Record<string, Preset>

const BAR_STYLES = {
  none: { label: 'Default', tier: 'Free', description: 'Flat class color (current).', cosmetic: {} },
  glossy: {
    label: 'Glossy',
    tier: 'Honored',
    description: 'Top highlight, like a classic unit frame.',
    cosmetic: {
      barBackground: `linear-gradient(to bottom, oklch(1 0 0 / 0.22), oklch(1 0 0 / 0.04) 50%, oklch(0 0 0 / 0.2) 51%, oklch(0 0 0 / 0.05)), ${DEFAULT_BAR}`,
    },
  },
  fade: {
    label: 'Fade',
    tier: 'Honored',
    description: 'Fades from transparent into the class color.',
    cosmetic: {
      barBackground: 'linear-gradient(to right, color-mix(in oklch, var(--bar-color) 15%, transparent), var(--bar-color))',
    },
  },
  edge: {
    label: 'Leading Edge',
    tier: 'Revered',
    description: 'Darker bar with a bright glowing tip.',
    cosmetic: {
      barBackground: `linear-gradient(to right, transparent calc(100% - 4px), oklch(1 0 0 / 0.9) calc(100% - 2px)), linear-gradient(to right, transparent 70%, color-mix(in oklch, var(--bar-color) 80%, white)), ${DEFAULT_BAR}`,
    },
  },
  gilded: {
    label: 'Gold Trim',
    tier: 'Revered',
    description: 'Class bar with gold top/bottom trim.',
    cosmetic: {
      barBackground: `linear-gradient(to bottom, #f5d27a 0 2px, transparent 2px calc(100% - 2px), #b8862b calc(100% - 2px)), ${DEFAULT_BAR}`,
    },
  },
  shimmer: {
    label: 'Shimmer',
    tier: 'Exalted',
    description: 'Animated light sweep across the bar.',
    cosmetic: { barBackground: DEFAULT_BAR, barClassName: 'cosmetic-bar-shimmer' },
  },
  arcane: {
    label: 'Arcane Flow',
    tier: 'Exalted',
    description: 'Class color drifts through a second hue.',
    cosmetic: { barClassName: 'cosmetic-bar-arcane', barBackground: 'linear-gradient(to right, oklch(0 0 0 / 0.3), oklch(0 0 0 / 0.15)), linear-gradient(90deg, var(--bar-color), color-mix(in oklch, var(--bar-color) 65%, #a855f7), var(--bar-color))' },
  },
  embers: {
    label: 'Embers',
    tier: 'Exalted',
    description: 'Rising sparks over the class color.',
    cosmetic: { barClassName: 'cosmetic-bar-embers', barBackground: DEFAULT_BAR },
  },
} satisfies Record<string, Preset>

type NameStyleKey = keyof typeof NAME_STYLES
type BarStyleKey = keyof typeof BAR_STYLES

const COSMETIC_CSS = `
.cosmetic-name-gilded,
.cosmetic-name-frost,
.cosmetic-name-fel,
.cosmetic-name-shimmer,
.cosmetic-name-prismatic {
  font-weight: 700 !important;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.cosmetic-name-gilded {
  background-image: linear-gradient(180deg, #fff3c4 0%, #f5c84c 45%, #b07d1c 55%, #f1d27a 100%);
  filter: drop-shadow(0 0 1px #000) drop-shadow(0 1px 0 #000);
}
.cosmetic-name-frost {
  background-image: linear-gradient(180deg, #ffffff 0%, #bfe9ff 50%, #5fb4e8 100%);
  filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 3px #5fb4e8aa);
}
.cosmetic-name-fel {
  background-image: linear-gradient(0deg, #2fbf2f, #a6ff4d 60%, #eaffc0);
  filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 4px #5aff2a99);
  animation: cosmetic-fel 1.6s ease-in-out infinite;
}
.cosmetic-name-shimmer {
  background-image: linear-gradient(110deg, var(--color-class-foreground) 40%, #fff 50%, var(--color-class-foreground) 60%);
  background-size: 250% 100%;
  animation: cosmetic-sweep 2.8s linear infinite;
}
.cosmetic-name-prismatic {
  background-image: linear-gradient(90deg, #ff6b6b, #ffd93d, #6bff95, #4dd2ff, #b26bff, #ff6b6b);
  background-size: 300% 100%;
  filter: drop-shadow(0 0 1px #000) drop-shadow(0 1px 0 #000);
  animation: cosmetic-pan 6s linear infinite;
}
.cosmetic-bar-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 35%, oklch(1 0 0 / 0.35) 50%, transparent 65%);
  background-size: 250% 100%;
  animation: cosmetic-sweep 2.4s linear infinite;
}
.cosmetic-bar-arcane {
  background-size: 200% 100% !important;
  animation: cosmetic-pan 4s ease-in-out infinite alternate;
}
.cosmetic-bar-embers::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 20% 30%, #ffd27a 0 1px, transparent 1.5px),
    radial-gradient(circle at 70% 80%, #ff8a3d 0 1.2px, transparent 1.8px),
    radial-gradient(circle at 45% 55%, #fff1c2 0 0.8px, transparent 1.2px);
  background-size: 41px 30px, 67px 30px, 29px 30px;
  animation: cosmetic-rise 2.2s linear infinite;
  opacity: 0.75;
}
@keyframes cosmetic-sweep { from { background-position: 100% 0; } to { background-position: -150% 0; } }
@keyframes cosmetic-pan { from { background-position: 0% 0; } to { background-position: 100% 0; } }
@keyframes cosmetic-fel { 0%, 100% { filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 3px #5aff2a88); } 50% { filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 7px #5aff2acc); } }
@keyframes cosmetic-rise { from { background-position: 0 30px, 13px 30px, 7px 30px; } to { background-position: 0 0, 13px 0, 7px 0; } }
@media (prefers-reduced-motion: reduce) {
  [class*='cosmetic-'], [class*='cosmetic-']::after { animation: none !important; }
}
`

const TIER_COLORS: Record<Tier, string> = {
  Free: 'var(--muted-foreground)',
  Honored: '#4ade80',
  Revered: '#60a5fa',
  Exalted: '#c084fc',
}

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ color: TIER_COLORS[tier], borderColor: TIER_COLORS[tier] }}
    >
      {tier}
    </span>
  )
}

const baseRaid: Omit<PlayerMetricChartData, 'playerID'>[] = [
  { playerName: 'Saberslash', className: 'Rogue', specialization: 'Combat', value: 1339.9 },
  { playerName: 'Sentur', className: 'Warrior', specialization: 'Fury', value: 1158.5 },
  { playerName: 'Ragelisa', className: 'Mage', specialization: 'Fire', value: 1111.2 },
  { playerName: 'Lonsell', className: 'Warlock', specialization: 'Destruction', value: 1009.2 },
  { playerName: 'Katrix', className: 'Hunter', specialization: 'Marksmanship', value: 873.7 },
  { playerName: 'Owlboom', className: 'Druid', specialization: 'Balance', value: 587.8 },
  { playerName: 'Kryaa', className: 'Priest', specialization: 'Shadow', value: 543.6 },
  { playerName: 'Stormbringer', className: 'Shaman', specialization: 'Enhancement', value: 450.1 },
  { playerName: 'Lhian', className: 'Paladin', specialization: 'Retribution', value: 326.5 },
]

function raid(cosmetics: Record<string, PlayerRowCosmetic> = {}): PlayerMetricChartData[] {
  return baseRaid.map((p, i) => ({ ...p, playerID: `player-${i + 1}`, cosmetic: cosmetics[p.playerName] }))
}

function combine(name: NameStyleKey, bar: BarStyleKey): PlayerRowCosmetic {
  return { ...NAME_STYLES[name].cosmetic, ...BAR_STYLES[bar].cosmetic }
}

interface CosmeticsArgs {
  nameStyle: NameStyleKey
  barStyle: BarStyleKey
}

const meta = {
  title: 'UI/PlayerMetricChart/Supporter Cosmetics',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <>
        <style>{COSMETIC_CSS}</style>
        <Story />
      </>
    ),
  ],
  argTypes: {
    nameStyle: { control: 'select', options: Object.keys(NAME_STYLES) },
    barStyle: { control: 'select', options: Object.keys(BAR_STYLES) },
  },
  args: { nameStyle: 'gilded', barStyle: 'shimmer' },
} satisfies Meta<CosmeticsArgs>

export default meta
type Story = StoryObj<typeof meta>

/** A realistic raid where a few supporters have picked cosmetics. */
export const RaidShowcase: Story = {
  render: () => (
    <div className="flex max-w-[640px] flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Saberslash (Exalted), Ragelisa (Revered), Katrix (Honored), Lhian (Exalted). Everyone else is default.
      </p>
      <PlayerMetricChart
        type="damage"
        style={{ height: 320 }}
        data={raid({
          Saberslash: combine('prismatic', 'shimmer'),
          Ragelisa: combine('frost', 'gilded'),
          Katrix: combine('glow', 'glossy'),
          Lhian: combine('fel', 'embers'),
        })}
      />
    </div>
  ),
}

/** Apply any name + bar combo to every row to judge it across class colors. */
export const Playground: Story = {
  render: ({ nameStyle, barStyle }) => (
    <div className="flex max-w-[640px] flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        Name: {NAME_STYLES[nameStyle].label} <TierBadge tier={NAME_STYLES[nameStyle].tier} />
        Bar: {BAR_STYLES[barStyle].label} <TierBadge tier={BAR_STYLES[barStyle].tier} />
      </div>
      <PlayerMetricChart
        type="damage"
        style={{ height: 320 }}
        data={raid(Object.fromEntries(baseRaid.map((p) => [p.playerName, combine(nameStyle, barStyle)])))}
      />
    </div>
  ),
}

function Gallery({ presets, apply }: { presets: Record<string, Preset>; apply: (key: string) => PlayerRowCosmetic }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Object.entries(presets).map(([key, preset]) => (
        <div key={key} className="rounded-md border border-border bg-card p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold">{preset.label}</span>
            <TierBadge tier={preset.tier} />
          </div>
          <p className="mb-2 text-xs text-muted-foreground">{preset.description}</p>
          <PlayerMetricChart
            type="damage"
            style={{ height: 120 }}
            data={raid(Object.fromEntries(baseRaid.map((p) => [p.playerName, apply(key)]))).slice(0, 3)}
          />
        </div>
      ))}
    </div>
  )
}

/** Every name style, shown over three different class colors. */
export const NameStyles: Story = {
  render: () => <Gallery presets={NAME_STYLES} apply={(k) => combine(k as NameStyleKey, 'none')} />,
}

/** Every bar style, shown over three different class colors. */
export const BarStyles: Story = {
  render: () => <Gallery presets={BAR_STYLES} apply={(k) => combine('none', k as BarStyleKey)} />,
}
