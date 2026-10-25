import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Check, Crown, Lock, RotateCcw, Sparkles, Swords, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/Switch/Switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
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
  rare: {
    label: 'Rare',
    tier: 'Honored',
    description: 'Rare-quality blue with the nameplate outline.',
    cosmetic: { nameClassName: 'cosmetic-name-rare' },
  },
  epic: {
    label: 'Epic',
    tier: 'Honored',
    description: 'Epic-quality purple with the nameplate outline.',
    cosmetic: { nameClassName: 'cosmetic-name-epic' },
  },
  gilded: {
    label: 'Gilded',
    tier: 'Honored',
    description: 'Static gold gradient lettering.',
    cosmetic: { nameClassName: 'cosmetic-name-gilded' },
  },
  frost: {
    label: 'Frostbitten',
    tier: 'Honored',
    description: 'Icy gradient with a cold outline.',
    cosmetic: { nameClassName: 'cosmetic-name-frost' },
  },
  ember: {
    label: 'Ember',
    tier: 'Honored',
    description: 'Static orange-red lettering with a warm glow.',
    cosmetic: { nameClassName: 'cosmetic-name-ember' },
  },
  argent: {
    label: 'Argent',
    tier: 'Honored',
    description: 'Polished silver lettering.',
    cosmetic: { nameClassName: 'cosmetic-name-argent' },
  },
  fel: {
    label: 'Felfire',
    tier: 'Exalted',
    description: 'Flickering green fel flame.',
    cosmetic: { nameClassName: 'cosmetic-name-fel' },
  },
  shimmer: {
    label: 'Shimmer',
    tier: 'Revered',
    description: 'A highlight sweeps across the name.',
    cosmetic: { nameClassName: 'cosmetic-name-shimmer' },
  },
  prismatic: {
    label: 'Prismatic',
    tier: 'Exalted',
    description: 'Slow-cycling rainbow gradient.',
    cosmetic: { nameClassName: 'cosmetic-name-prismatic' },
  },
  storm: {
    label: 'Stormcaller',
    tier: 'Revered',
    description: 'Electric blue lettering that crackles with lightning.',
    cosmetic: { nameClassName: 'cosmetic-name-storm' },
  },
  legendary: {
    label: 'Legendary',
    tier: 'Revered',
    description: 'Legendary-quality orange with a bright sweep.',
    cosmetic: { nameClassName: 'cosmetic-name-legendary' },
  },
  holy: {
    label: 'Holy Light',
    tier: 'Revered',
    description: 'Pale gold lettering with a slow, radiant pulse.',
    cosmetic: { nameClassName: 'cosmetic-name-holy' },
  },
  arcane: {
    label: 'Arcane',
    tier: 'Exalted',
    description: 'Violet lettering with a sweeping highlight and an arcane pulse.',
    cosmetic: { nameClassName: 'cosmetic-name-arcane' },
  },
  thunderfury: {
    label: 'Thunderfury',
    tier: 'Exalted',
    description: 'Storm blue and gold bands roll through the name, with lightning flashes.',
    cosmetic: { nameClassName: 'cosmetic-name-thunderfury' },
  },
  molten: {
    label: 'Molten',
    tier: 'Exalted',
    description: 'Lava rises through the letters under a heat glow.',
    cosmetic: { nameClassName: 'cosmetic-name-molten' },
  },
} satisfies Record<string, Preset>

const BACKGROUND_STYLES = {
  none: { label: 'Default', tier: 'Free', description: 'The current flat class-color background.', cosmetic: {} },
  glossy: {
    label: 'Glossy',
    tier: 'Revered',
    description: 'Top highlight, like a classic unit frame.',
    cosmetic: {
      barBackground: `linear-gradient(to bottom, oklch(1 0 0 / 0.22), oklch(1 0 0 / 0.04) 50%, oklch(0 0 0 / 0.2) 51%, oklch(0 0 0 / 0.05)), ${DEFAULT_BAR}`,
    },
  },
  gleam: {
    label: 'Gleam',
    tier: 'Exalted',
    description: 'A highlight glints across the background every few seconds.',
    cosmetic: { barBackground: DEFAULT_BAR, barClassName: 'cosmetic-bar-gleam' },
  },
  satin: {
    label: 'Satin',
    tier: 'Revered',
    description: 'A soft sheen runs through the middle of the bar.',
    cosmetic: {
      barBackground: `linear-gradient(to bottom, transparent 15%, oklch(1 0 0 / 0.16) 45%, transparent 80%), ${DEFAULT_BAR}`,
    },
  },
  lustre: {
    label: 'Lustre',
    tier: 'Revered',
    description: 'A soft top-down sheen, like polished enamel.',
    cosmetic: {
      barBackground: `linear-gradient(to bottom, oklch(1 0 0 / 0.2), oklch(1 0 0 / 0.06) 55%, transparent), ${DEFAULT_BAR}`,
    },
  },
  sunlit: {
    label: 'Sunlit',
    tier: 'Revered',
    description: 'The class color warms toward gold at the leading end.',
    cosmetic: {
      barBackground: `linear-gradient(to right, transparent 50%, color-mix(in oklch, #ffd76a 38%, transparent)), ${DEFAULT_BAR}`,
    },
  },
  frosted: {
    label: 'Frosted',
    tier: 'Revered',
    description: 'A pale frost along the top and bottom edges, as if under glass.',
    cosmetic: {
      barBackground: `linear-gradient(to bottom, oklch(0.97 0.03 230 / 0.26), transparent 32%, transparent 68%, oklch(0.97 0.03 230 / 0.18)), ${DEFAULT_BAR}`,
    },
  },
  chainmail: {
    label: 'Chainmail',
    tier: 'Exalted',
    description: 'A fine diamond lattice, like linked mail.',
    cosmetic: {
      barBackground: `repeating-linear-gradient(45deg, oklch(1 0 0 / 0.13) 0 1px, transparent 1px 8px), repeating-linear-gradient(-45deg, oklch(1 0 0 / 0.13) 0 1px, transparent 1px 8px), ${DEFAULT_BAR}`,
    },
  },
  quilted: {
    label: 'Quilted',
    tier: 'Revered',
    description: 'A large, barely-there diamond grid, like quilted padding.',
    cosmetic: {
      barBackground: `repeating-linear-gradient(45deg, oklch(1 0 0 / 0.06) 0 1px, transparent 1px 16px), repeating-linear-gradient(-45deg, oklch(1 0 0 / 0.06) 0 1px, transparent 1px 16px), ${DEFAULT_BAR}`,
    },
  },
  pinpoint: {
    label: 'Pinpoint',
    tier: 'Revered',
    description: 'A sparse grid of faint points.',
    cosmetic: {
      barBackground: `radial-gradient(circle, oklch(1 0 0 / 0.16) 0 0.8px, transparent 1.3px) 0 0 / 12px 12px, radial-gradient(circle, oklch(1 0 0 / 0.16) 0 0.8px, transparent 1.3px) 6px 6px / 12px 12px, ${DEFAULT_BAR}`,
    },
  },
  innerGlow: {
    label: 'Inner Glow',
    tier: 'Revered',
    description: 'A soft light just inside the edges, as if lit from within.',
    cosmetic: {
      barBackground: `radial-gradient(ellipse at center, transparent 50%, oklch(1 0 0 / 0.16) 100%), ${DEFAULT_BAR}`,
    },
  },
  arcane: {
    label: 'Arcane Flow',
    tier: 'Exalted',
    description: 'The class color drifts through a complementary hue.',
    cosmetic: { barClassName: 'cosmetic-bar-arcane', barBackground: 'linear-gradient(to right, oklch(0 0 0 / 0.3), oklch(0 0 0 / 0.15)), linear-gradient(90deg, var(--bar-color), color-mix(in oklch, var(--bar-color) 65%, #a855f7), var(--bar-color))' },
  },
  embers: {
    label: 'Embers',
    tier: 'Exalted',
    description: 'Small sparks rise over the class color.',
    cosmetic: { barClassName: 'cosmetic-bar-embers', barBackground: DEFAULT_BAR },
  },
  snowfall: {
    label: 'Snowfall',
    tier: 'Exalted',
    description: 'Soft flakes drift down over the class color.',
    cosmetic: { barClassName: 'cosmetic-bar-snowfall', barBackground: DEFAULT_BAR },
  },
  starfall: {
    label: 'Starfall',
    tier: 'Exalted',
    description: 'Stars twinkle in and out across the background.',
    cosmetic: { barClassName: 'cosmetic-bar-starfall', barBackground: DEFAULT_BAR },
  },
} satisfies Record<string, Preset>

const BORDER_STYLES = {
  none: { label: 'Default', tier: 'Free', description: 'No cosmetic border.', cosmetic: {} },
  elite: {
    label: 'Elite',
    tier: 'Exalted',
    description: 'Every few seconds, gold elite-frame brackets glint at the corners.',
    cosmetic: { borderClassName: 'cosmetic-border-elite' },
  },
  chasing: {
    label: 'Chasing Light',
    tier: 'Exalted',
    description: 'Every few seconds, class-colored comets race along the top and bottom edges.',
    cosmetic: { borderClassName: 'cosmetic-border-chasing' },
  },
  storm: {
    label: 'Stormcharged',
    tier: 'Exalted',
    description: 'Every few seconds, lightning flickers around the row.',
    cosmetic: { borderClassName: 'cosmetic-border-storm' },
  },
} satisfies Record<string, Preset>

type NameStyleKey = keyof typeof NAME_STYLES
type BackgroundStyleKey = keyof typeof BACKGROUND_STYLES
type BorderStyleKey = keyof typeof BORDER_STYLES

const COSMETIC_CSS = `
/* Every styled name shares a crisp 1px nameplate outline. Gradient fills use
   only light stops, and glows sit outside the outline so letter edges stay sharp. */
[class*='cosmetic-name-'] {
  --cosmetic-outline: drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000);
  font-weight: 700 !important;
  filter: var(--cosmetic-outline);
}
.cosmetic-name-rare { color: #85c0ff; }
.cosmetic-name-epic { color: #d2a6ff; }
.cosmetic-name-gilded,
.cosmetic-name-frost,
.cosmetic-name-ember,
.cosmetic-name-fel,
.cosmetic-name-shimmer,
.cosmetic-name-prismatic,
.cosmetic-name-argent,
.cosmetic-name-storm,
.cosmetic-name-legendary,
.cosmetic-name-holy,
.cosmetic-name-arcane,
.cosmetic-name-thunderfury,
.cosmetic-name-molten {
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.cosmetic-name-gilded { background-image: linear-gradient(180deg, #fff7d6 0%, #ffd95e 55%, #f2bb3c 100%); }
.cosmetic-name-argent { background-image: linear-gradient(180deg, #ffffff 0%, #e8ecf1 55%, #bcc5d0 100%); }
.cosmetic-name-frost {
  background-image: linear-gradient(180deg, #ffffff 0%, #d9f3ff 55%, #a3dcff 100%);
  filter: var(--cosmetic-outline) drop-shadow(0 0 3px #5fb4e866);
}
.cosmetic-name-ember {
  background-image: linear-gradient(180deg, #fff3cf 0%, #ffbb6b 55%, #ff8a4c 100%);
  filter: var(--cosmetic-outline) drop-shadow(0 0 3px #ff6b2a66);
}
.cosmetic-name-fel {
  background-image: linear-gradient(0deg, #7ee84a, #c2ff70 60%, #f2ffd6);
  animation: cosmetic-fel 1.6s ease-in-out infinite;
}
.cosmetic-name-shimmer {
  background-image: linear-gradient(110deg, var(--color-class-foreground) 40%, #fff6d6 50%, var(--color-class-foreground) 60%);
  background-size: 250% 100%;
  animation: cosmetic-sweep 2.8s linear infinite;
}
.cosmetic-name-prismatic {
  background-image: linear-gradient(90deg, #ffa3a3, #ffe38a, #9dffb8, #8ce0ff, #d1a8ff, #ffa3a3);
  background-size: 300% 100%;
  animation: cosmetic-pan-loop 6s linear infinite;
}
.cosmetic-name-storm {
  background-image: linear-gradient(180deg, #ffffff 0%, #dcf3ff 55%, #8ccfff 100%);
  animation: cosmetic-storm 3.2s linear infinite;
}
.cosmetic-name-legendary {
  background-image: linear-gradient(110deg, #ff9d33 40%, #fff1d9 50%, #ff9d33 60%);
  background-size: 250% 100%;
  animation: cosmetic-sweep 3.2s linear infinite;
}
.cosmetic-name-holy {
  background-image: linear-gradient(180deg, #ffffff 0%, #fff5cf 55%, #ffe292 100%);
  animation: cosmetic-holy 2.8s ease-in-out infinite;
}
.cosmetic-name-arcane {
  background-image: linear-gradient(110deg, #e0c2ff 40%, #ffffff 50%, #e0c2ff 60%);
  background-size: 250% 100%;
  animation: cosmetic-sweep 3s linear infinite, cosmetic-arcane 2.4s ease-in-out infinite;
}
.cosmetic-name-thunderfury {
  background-image: linear-gradient(90deg, #9ad8ff, #ffffff, #ffd76a, #ffffff, #9ad8ff);
  background-size: 300% 100%;
  animation: cosmetic-pan-loop 3s linear infinite, cosmetic-storm 3.2s linear infinite;
}
.cosmetic-name-molten {
  background-image: linear-gradient(0deg, #ff8a3d, #ffd36b 25%, #fff3c4 50%, #ffd36b 75%, #ff8a3d);
  background-size: 100% 200%;
  animation: cosmetic-lava 5s linear infinite;
  filter: var(--cosmetic-outline) drop-shadow(0 0 4px #ff5a1f88);
}
.cosmetic-bar-gleam::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 35%, oklch(1 0 0 / 0.35) 50%, transparent 65%);
  background-size: 250% 100%;
  background-position: -100% 0;
  background-repeat: no-repeat;
  animation: cosmetic-gleam 7s linear infinite;
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
.cosmetic-bar-snowfall::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 25% 40%, #ffffff 0 1.2px, transparent 1.8px),
    radial-gradient(circle at 75% 20%, #dff4ff 0 1px, transparent 1.5px),
    radial-gradient(circle at 50% 70%, #ffffff 0 0.8px, transparent 1.2px);
  background-size: 37px 30px, 59px 30px, 23px 30px;
  animation: cosmetic-rise 4.5s linear infinite reverse;
  opacity: 0.8;
}
.cosmetic-bar-starfall::before,
.cosmetic-bar-starfall::after {
  content: '';
  position: absolute;
  inset: 0;
  animation: cosmetic-twinkle 2.6s ease-in-out infinite;
}
.cosmetic-bar-starfall::before {
  background-image:
    radial-gradient(circle at 30% 30%, #fff 0 1px, transparent 1.6px),
    radial-gradient(circle at 80% 70%, #fff7d6 0 0.8px, transparent 1.3px);
  background-size: 53px 100%, 31px 100%;
}
.cosmetic-bar-starfall::after {
  background-image:
    radial-gradient(circle at 60% 60%, #fff 0 1.2px, transparent 1.8px),
    radial-gradient(circle at 15% 80%, #d9e8ff 0 0.8px, transparent 1.3px);
  background-size: 43px 100%, 71px 100%;
  animation-delay: -1.3s;
}
.cosmetic-border-elite {
  --elite: #f5d27a;
  background:
    linear-gradient(var(--elite), var(--elite)) top left / 12px 2px no-repeat,
    linear-gradient(var(--elite), var(--elite)) top left / 2px 10px no-repeat,
    linear-gradient(var(--elite), var(--elite)) top right / 12px 2px no-repeat,
    linear-gradient(var(--elite), var(--elite)) top right / 2px 10px no-repeat,
    linear-gradient(var(--elite), var(--elite)) bottom left / 12px 2px no-repeat,
    linear-gradient(var(--elite), var(--elite)) bottom left / 2px 10px no-repeat,
    linear-gradient(var(--elite), var(--elite)) bottom right / 12px 2px no-repeat,
    linear-gradient(var(--elite), var(--elite)) bottom right / 2px 10px no-repeat;
  filter: drop-shadow(0 0 1px #000);
  opacity: 0;
  animation: cosmetic-elite 6s ease-in-out infinite;
}
.cosmetic-border-chasing {
  --chase: color-mix(in oklch, var(--bar-color) 55%, white);
  background:
    linear-gradient(90deg, transparent 40%, var(--chase) 48.5%, #fff 50%, transparent 50.2%) top / 250% 2px no-repeat,
    linear-gradient(270deg, transparent 40%, var(--chase) 48.5%, #fff 50%, transparent 50.2%) bottom / 250% 2px no-repeat;
  filter: drop-shadow(0 0 3px var(--chase));
  opacity: 0;
  animation: cosmetic-chase 6s linear infinite;
}
.cosmetic-border-storm {
  box-shadow: inset 0 0 0 1px #9bd8ff, inset 0 0 6px #4fb3ff88;
  opacity: 0;
  animation: cosmetic-storm-border 4s linear infinite;
}
/* Seamless loops move exactly one tile: with a background N times the box, P% offsets by (1 - N) * P% of the box. */
/* 250% wide: 100% to -66.667% is one 2.5-box tile. */
@keyframes cosmetic-sweep { from { background-position: 100% 0; } to { background-position: -66.667% 0; } }
/* No-repeat single pass that starts and ends fully off the box. */
@keyframes cosmetic-gleam { 0% { background-position: 160% 0; } 28%, 100% { background-position: -100% 0; } }
@keyframes cosmetic-pan { from { background-position: 0% 0; } to { background-position: 100% 0; } }
/* 300% wide: 0% to 150% is one 3-box tile. */
@keyframes cosmetic-pan-loop { from { background-position: 0% 0; } to { background-position: 150% 0; } }
@keyframes cosmetic-fel { 0%, 100% { filter: var(--cosmetic-outline) drop-shadow(0 0 2px #5aff2a66); } 50% { filter: var(--cosmetic-outline) drop-shadow(0 0 6px #5aff2aaa); } }
@keyframes cosmetic-rise { from { background-position: 0 30px, 13px 30px, 7px 30px; } to { background-position: 0 0, 13px 0, 7px 0; } }
@keyframes cosmetic-storm {
  0%, 89%, 93%, 100% { filter: var(--cosmetic-outline) drop-shadow(0 0 2px #4fb3ff66); }
  90%, 95% { filter: var(--cosmetic-outline) drop-shadow(0 0 7px #bfe6ff) brightness(1.25); }
}
@keyframes cosmetic-holy {
  0%, 100% { filter: var(--cosmetic-outline) drop-shadow(0 0 2px #ffd76a55); }
  50% { filter: var(--cosmetic-outline) drop-shadow(0 0 6px #ffe9a8cc); }
}
@keyframes cosmetic-arcane {
  0%, 100% { filter: var(--cosmetic-outline) drop-shadow(0 0 2px #b26bff66); }
  50% { filter: var(--cosmetic-outline) drop-shadow(0 0 6px #c78cffcc); }
}
/* 200% tall: 0% to 200% is one 2-box tile, moving upward. */
@keyframes cosmetic-lava { from { background-position: 0 0%; } to { background-position: 0 200%; } }
@keyframes cosmetic-twinkle { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.9; } }
/* One pass of both comets, then a rest with both off the row. The layer is hidden while resting so no
   stale filtered pixels can linger where a comet exited. */
@keyframes cosmetic-chase {
  0% { background-position: 110% 0, -10% 100%; opacity: 1; }
  39% { opacity: 1; }
  40%, 100% { background-position: -10% 0, 110% 100%; opacity: 0; }
}
/* Hidden at rest; the brackets glint in with a warm glow, hold briefly, then fade. */
@keyframes cosmetic-elite {
  0%, 70%, 100% { opacity: 0; }
  76% { opacity: 1; filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 4px #ffd95e); }
  88% { opacity: 1; filter: drop-shadow(0 0 1px #000); }
}
/* Hidden at rest; a quick flash, dip, flash of lightning. */
@keyframes cosmetic-storm-border {
  0%, 84%, 93%, 100% { opacity: 0; }
  85% { opacity: 1; filter: brightness(1.6); }
  87% { opacity: 0.25; }
  89% { opacity: 1; filter: brightness(1.4); }
  91% { opacity: 0.4; }
}
@media (prefers-reduced-motion: reduce) {
  [class*='cosmetic-'], [class*='cosmetic-']::before, [class*='cosmetic-']::after { animation: none !important; }
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

function combine(
  name: NameStyleKey,
  background: BackgroundStyleKey = 'none',
  border: BorderStyleKey = 'none',
): PlayerRowCosmetic {
  return {
    ...NAME_STYLES[name].cosmetic,
    ...BACKGROUND_STYLES[background].cosmetic,
    ...BORDER_STYLES[border].cosmetic,
  }
}

const TIER_PRESETS = {
  free: {
    label: 'Default',
    tier: 'Free',
    description: 'The baseline class-colored row.',
    cosmetic: combine('none'),
  },
  honored: {
    label: 'Epic',
    tier: 'Honored',
    description: 'An Epic-quality name. The background and border stay default.',
    cosmetic: combine('epic'),
  },
  revered: {
    label: 'Gilded',
    tier: 'Revered',
    description: 'Gold lettering with a glossy class-colored background.',
    cosmetic: combine('holy', 'glossy'),
  },
  exalted: {
    label: 'Radiant',
    tier: 'Exalted',
    description: 'An Arcane name and Arcane Flow background, with Chasing Light around the row.',
    cosmetic: combine('arcane', 'arcane', 'chasing'),
  },
} satisfies Record<string, Preset>

interface CosmeticsArgs {
  nameStyle: NameStyleKey
  backgroundStyle: BackgroundStyleKey
  borderStyle: BorderStyleKey
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
    backgroundStyle: { control: 'select', options: Object.keys(BACKGROUND_STYLES) },
    borderStyle: { control: 'select', options: Object.keys(BORDER_STYLES) },
  },
  args: { nameStyle: 'gilded', backgroundStyle: 'gleam', borderStyle: 'elite' },
} satisfies Meta<CosmeticsArgs>

export default meta
type Story = StoryObj<typeof meta>

const RAID_SHOWCASES: { label: string; tier?: Tier; description: string; cosmetics: Record<string, PlayerRowCosmetic> }[] = [
  {
    label: 'Honored raid',
    tier: 'Honored',
    description: 'Honored supporters pick a static name; Sentur, Owlboom, and Lhian are default.',
    cosmetics: {
      Saberslash: combine('gilded'),
      Ragelisa: combine('frost'),
      Lonsell: combine('epic'),
      Katrix: combine('ember'),
      Kryaa: combine('argent'),
      Stormbringer: combine('rare'),
    },
  },
  {
    label: 'Revered raid',
    tier: 'Revered',
    description: 'Revered supporters add animated names and static backgrounds; Lonsell, Owlboom, and Lhian are default.',
    cosmetics: {
      Saberslash: combine('legendary', 'glossy'),
      Sentur: combine('shimmer', 'satin'),
      Ragelisa: combine('holy', 'satin'),
      Katrix: combine('gilded', 'satin'),
      Kryaa: combine('holy', 'glossy'),
      Stormbringer: combine('storm', 'glossy'),
    },
  },
  {
    label: 'Exalted raid',
    tier: 'Exalted',
    description: 'Exalted supporters add showpiece names, animated backgrounds, and borders; Ragelisa, Owlboom, and Stormbringer are default.',
    cosmetics: {
      Saberslash: combine('molten', 'embers', 'elite'),
      Sentur: combine('thunderfury', 'glossy', 'storm'),
      Lonsell: combine('fel', 'arcane', 'chasing'),
      Katrix: combine('prismatic', 'glossy', 'storm'),
      Kryaa: combine('arcane', 'starfall', 'chasing'),
      Lhian: combine('holy', 'glossy', 'elite'),
    },
  },
  {
    label: 'Mixed raid',
    description: 'A realistic raid: Saberslash, Lonsell (Exalted), Ragelisa, Kryaa (Revered), Katrix, Lhian (Honored). Everyone else is default.',
    cosmetics: {
      Saberslash: combine('molten', 'embers', 'elite'),
      Ragelisa: combine('storm', 'satin'),
      Lonsell: combine('arcane', 'glossy', 'chasing'),
      Katrix: combine('rare'),
      Kryaa: combine('holy', 'glossy'),
      Lhian: combine('gilded'),
    },
  },
]

/** Supporters of each tier alongside default players, plus a raid that mixes every tier. */
export const RaidShowcase: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {RAID_SHOWCASES.map((showcase) => (
        <div key={showcase.label} className="rounded-md border border-border bg-card p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold">{showcase.label}</span>
            {showcase.tier && <TierBadge tier={showcase.tier} />}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">{showcase.description}</p>
          <PlayerMetricChart type="damage" style={{ height: 320 }} data={raid(showcase.cosmetics)} />
        </div>
      ))}
    </div>
  ),
}

/** Apply any name, background, and border combination across every class color. */
export const Playground: Story = {
  render: ({ nameStyle, backgroundStyle, borderStyle }) => (
    <div className="flex max-w-[640px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Name: {NAME_STYLES[nameStyle].label} <TierBadge tier={NAME_STYLES[nameStyle].tier} />
        Background: {BACKGROUND_STYLES[backgroundStyle].label} <TierBadge tier={BACKGROUND_STYLES[backgroundStyle].tier} />
        Border: {BORDER_STYLES[borderStyle].label} <TierBadge tier={BORDER_STYLES[borderStyle].tier} />
      </div>
      <PlayerMetricChart
        type="damage"
        style={{ height: 320 }}
        data={raid(Object.fromEntries(baseRaid.map((player) => [player.playerName, combine(nameStyle, backgroundStyle, borderStyle)])))}
      />
    </div>
  ),
}

/** A restrained progression using one cohesive cosmetic at each supporter tier. */
export const TierProgression: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Object.entries(TIER_PRESETS).map(([key, preset]) => (
        <div key={key} className="rounded-md border border-border bg-card p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold">{preset.label}</span>
            <TierBadge tier={preset.tier} />
          </div>
          <p className="mb-2 text-xs text-muted-foreground">{preset.description}</p>
          <PlayerMetricChart
            type="damage"
            style={{ height: 120 }}
            data={raid(Object.fromEntries(baseRaid.map((player) => [player.playerName, preset.cosmetic]))).slice(0, 3)}
          />
        </div>
      ))}
    </div>
  ),
}

const TIER_RANK: Record<Tier, number> = {
  Free: 0,
  Honored: 1,
  Revered: 2,
  Exalted: 3,
}

function availableAtTier<T extends Record<string, Preset>>(presets: T, tier: Tier): Partial<T> {
  return Object.fromEntries(
    Object.entries(presets).filter(([, preset]) => TIER_RANK[preset.tier] <= TIER_RANK[tier]),
  ) as Partial<T>
}

function CosmeticSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  options: Record<string, Preset>
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <label className="flex min-w-44 flex-1 flex-col gap-1 text-xs font-medium text-foreground">
      {label}
      <select
        className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {Object.entries(options).map(([key, preset]) => (
          <option key={key} value={key}>{preset.label}</option>
        ))}
      </select>
    </label>
  )
}

function TierPlayground({ tier }: { tier: Exclude<Tier, 'Free'> }) {
  const names = availableAtTier(NAME_STYLES, tier) as Record<NameStyleKey, Preset>
  const backgrounds = availableAtTier(BACKGROUND_STYLES, tier) as Record<BackgroundStyleKey, Preset>
  const borders = availableAtTier(BORDER_STYLES, tier) as Record<BorderStyleKey, Preset>
  const [name, setName] = useState<NameStyleKey>(tier === 'Honored' ? 'epic' : tier === 'Revered' ? 'holy' : 'arcane')
  const [background, setBackground] = useState<BackgroundStyleKey>(tier === 'Honored' ? 'none' : tier === 'Revered' ? 'glossy' : 'arcane')
  const [border, setBorder] = useState<BorderStyleKey>(tier === 'Exalted' ? 'chasing' : 'none')
  const canChooseBackground = tier !== 'Honored'
  const canChooseBorder = tier === 'Exalted'
  const cosmetic = combine(name, background, border)

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-lg font-semibold">{tier} playground</h2>
              <TierBadge tier={tier} />
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {tier === 'Honored' && 'Choose a static name treatment. Background and border cosmetics remain locked.'}
              {tier === 'Revered' && 'Animated names unlock, plus static background treatments.'}
              {tier === 'Exalted' && 'Combine every unlocked name, background, and border treatment.'}
            </p>
          </div>
          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            {Object.keys(names).length - 1} names · {Object.keys(backgrounds).length - 1} backgrounds · {Object.keys(borders).length - 1} borders
          </span>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <CosmeticSelect label="Name" value={name} options={names} onChange={(value) => setName(value as NameStyleKey)} />
          <CosmeticSelect
            label={canChooseBackground ? 'Background' : 'Background · unlocks at Revered'}
            value={background}
            options={backgrounds}
            disabled={!canChooseBackground}
            onChange={(value) => setBackground(value as BackgroundStyleKey)}
          />
          <CosmeticSelect
            label={canChooseBorder ? 'Border' : 'Border · unlocks at Exalted'}
            value={border}
            options={borders}
            disabled={!canChooseBorder}
            onChange={(value) => setBorder(value as BorderStyleKey)}
          />
        </div>

        <PlayerMetricChart
          type="damage"
          style={{ height: 190 }}
          data={raid(Object.fromEntries(baseRaid.map((player) => [player.playerName, cosmetic]))).slice(0, 5)}
        />
      </section>

      <section>
        <h3 className="mb-1 text-base font-semibold">Available names</h3>
        <p className="mb-3 text-xs text-muted-foreground">Includes every name option unlocked at this tier or below.</p>
        <Gallery presets={names} apply={(key) => combine(key as NameStyleKey)} />
      </section>

      {canChooseBackground && (
        <section>
          <h3 className="mb-1 text-base font-semibold">Available backgrounds</h3>
          <p className="mb-3 text-xs text-muted-foreground">Backgrounds retain the player’s class color as their foundation.</p>
          <Gallery presets={backgrounds} apply={(key) => combine('none', key as BackgroundStyleKey)} />
        </section>
      )}

      {canChooseBorder && (
        <section>
          <h3 className="mb-1 text-base font-semibold">Available borders</h3>
          <p className="mb-3 text-xs text-muted-foreground">Borders are inset overlays, so they do not change row dimensions.</p>
          <Gallery presets={borders} apply={(key) => combine('none', 'none', key as BorderStyleKey)} />
        </section>
      )}
    </div>
  )
}

/** Honored unlocks static, outlined name treatments and no row-level effects. */
export const HonoredPlayground: Story = {
  render: () => <TierPlayground tier="Honored" />,
}

/** Revered adds animated names and class-preserving static backgrounds. */
export const ReveredPlayground: Story = {
  render: () => <TierPlayground tier="Revered" />,
}

/** Exalted adds showpiece names, animated backgrounds, and borders. */
export const ExaltedPlayground: Story = {
  render: () => <TierPlayground tier="Exalted" />,
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
  render: () => <Gallery presets={NAME_STYLES} apply={(key) => combine(key as NameStyleKey)} />,
}

/** Every background style, shown over three different class colors. */
export const BackgroundStyles: Story = {
  render: () => <Gallery presets={BACKGROUND_STYLES} apply={(key) => combine('none', key as BackgroundStyleKey)} />,
}

/** Every Exalted border style, isolated from name and background effects. */
export const BorderStyles: Story = {
  render: () => <Gallery presets={BORDER_STYLES} apply={(key) => combine('none', 'none', key as BorderStyleKey)} />,
}

/* Just ideas: marks as free, non-paid recognition. Not planned for supporter tiers. */
const MARKS = [
  { key: 'discord', label: 'Discord member', description: 'Joined the Chronicle Discord.', glyph: '◆' },
  { key: 'uploader', label: 'Log uploader', description: 'Has uploaded at least one log.', glyph: '⚑︎' },
  { key: 'veteran', label: 'Veteran uploader', description: 'Has uploaded 100+ logs.', glyph: '❖' },
  { key: 'early', label: 'Early adopter', description: 'Used Chronicle during the beta.', glyph: '✦' },
  { key: 'officer', label: 'Guild officer', description: 'Manages a guild on Chronicle.', glyph: '⚜︎' },
  { key: 'bug', label: 'Bug hunter', description: 'Reported a confirmed bug.', glyph: '✱' },
]

const MARK_CSS = `
[class*='cosmetic-mark-']::after {
  margin-left: 4px;
  vertical-align: 0.1em;
  text-shadow: 0 0 1px #000, 0 1px 2px #000c;
}
.cosmetic-mark-discord::after { content: '◆'; color: #8c9eff; font-size: 0.75em; }
.cosmetic-mark-uploader::after { content: '⚑︎'; color: #9fe3a6; font-size: 0.9em; }
.cosmetic-mark-veteran::after { content: '❖'; color: #dfe5ec; font-size: 0.85em; }
.cosmetic-mark-early::after { content: '✦'; color: #ffd95e; font-size: 0.75em; }
.cosmetic-mark-officer::after { content: '⚜︎'; color: #ffd95e; font-size: 1em; }
.cosmetic-mark-bug::after { content: '✱'; color: #ff9e6b; font-size: 0.85em; }
`

/** Just ideas: small marks after the name for free recognition, such as Discord membership or uploading logs. */
export const Marks: Story = {
  render: () => (
    <div className="flex max-w-[720px] flex-col gap-4">
      <style>{MARK_CSS}</style>
      <div className="rounded-md border border-dashed border-border bg-muted/40 p-3">
        <div className="text-sm font-semibold">Just ideas</div>
        <p className="text-xs text-muted-foreground">
          Not planned. Marks add an element next to the name, so they are kept out of the paid tiers. This explores them as free recognition instead.
        </p>
      </div>
      <PlayerMetricChart
        type="damage"
        style={{ height: 320 }}
        data={raid(Object.fromEntries(baseRaid.slice(0, MARKS.length).map((player, i) => [player.playerName, { nameClassName: `cosmetic-mark-${MARKS[i].key}` }])))}
      />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MARKS.map((mark) => (
          <li key={mark.key} className="flex items-start gap-2 rounded-md border border-border bg-card p-2">
            <span className={`cosmetic-mark-${mark.key} w-5 text-center`} aria-hidden="true" />
            <div>
              <div className="text-sm font-semibold">{mark.label}</div>
              <div className="text-xs text-muted-foreground">{mark.description}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  ),
}

/* ------------------------------------------------------------------------- */
/* Editor concept: lives under each linked character on /account/characters. */
/* ------------------------------------------------------------------------- */

type Slot = 'name' | 'background' | 'border'

interface CosmeticSelection {
  name: NameStyleKey
  background: BackgroundStyleKey
  border: BorderStyleKey
}

const DEFAULT_SELECTION: CosmeticSelection = { name: 'none', background: 'none', border: 'none' }

const SLOTS: { key: Slot; label: string; unlock: Tier; presets: Record<string, Preset> }[] = [
  { key: 'name', label: 'Name', unlock: 'Honored', presets: NAME_STYLES },
  { key: 'background', label: 'Background', unlock: 'Revered', presets: BACKGROUND_STYLES },
  { key: 'border', label: 'Border', unlock: 'Exalted', presets: BORDER_STYLES },
]

interface DemoCharacter {
  name: string
  className: string
  specialization: string
  detail: string
  isPrimary?: boolean
}

const DEMO_CHARACTERS: DemoCharacter[] = [
  { name: 'Saberslash', className: 'Rogue', specialization: 'Combat', detail: '<Zug Zug> · Level 60 Human Rogue · Nordanaar', isPrimary: true },
  { name: 'Kryaa', className: 'Priest', specialization: 'Shadow', detail: '<Zug Zug> · Level 60 Undead Priest · Nordanaar' },
  { name: 'Lhian', className: 'Paladin', specialization: 'Retribution', detail: 'Level 42 Dwarf Paladin · Nordanaar' },
  { name: 'Sentur', className: 'Warrior', specialization: 'Fury', detail: '<Zug Zug> · Level 60 Orc Warrior · Nordanaar' },
  { name: 'Katrix', className: 'Hunter', specialization: 'Marksmanship', detail: '<Zug Zug> · Level 60 Night Elf Hunter · Nordanaar' },
  { name: 'Stormbringer', className: 'Shaman', specialization: 'Enhancement', detail: '<Zug Zug> · Level 60 Tauren Shaman · Nordanaar' },
  { name: 'Ragelisa', className: 'Mage', specialization: 'Fire', detail: '<Zug Zug> · Level 60 Gnome Mage · Nordanaar' },
  { name: 'Lonsell', className: 'Warlock', specialization: 'Destruction', detail: 'Level 58 Undead Warlock · Nordanaar' },
  { name: 'Owlboom', className: 'Druid', specialization: 'Balance', detail: '<Zug Zug> · Level 60 Tauren Druid · Nordanaar' },
]

function selectionCosmetic(selection: CosmeticSelection): PlayerRowCosmetic {
  return combine(selection.name, selection.background, selection.border)
}

function isDefaultSelection(selection: CosmeticSelection): boolean {
  return selection.name === 'none' && selection.background === 'none' && selection.border === 'none'
}

/** What is actually shown in logs: options above the current tier fall back to default (e.g. a lapsed supporter). */
function effectiveSelection(selection: CosmeticSelection, tier: Tier): CosmeticSelection {
  const allowed = (preset: Preset) => TIER_RANK[preset.tier] <= TIER_RANK[tier]
  return {
    name: allowed(NAME_STYLES[selection.name]) ? selection.name : 'none',
    background: allowed(BACKGROUND_STYLES[selection.background]) ? selection.background : 'none',
    border: allowed(BORDER_STYLES[selection.border]) ? selection.border : 'none',
  }
}

function selectionSummary(selection: CosmeticSelection): string {
  const parts = [
    selection.name !== 'none' && NAME_STYLES[selection.name].label,
    selection.background !== 'none' && BACKGROUND_STYLES[selection.background].label,
    selection.border !== 'none' && BORDER_STYLES[selection.border].label,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Default'
}

/** A single bar row that mirrors PlayerMetricRow, small enough for an option tile. */
function MiniRow({ character, cosmetic }: { character: DemoCharacter; cosmetic: PlayerRowCosmetic }) {
  return (
    <div
      className="relative flex h-7 items-center overflow-hidden rounded-md px-2"
      style={{ '--bar-color': `var(--color-class-${character.className.toLowerCase()})`, color: 'var(--color-class-foreground)' } as React.CSSProperties}
    >
      <div
        className={cosmetic.barClassName}
        style={{
          position: 'absolute',
          inset: '0 auto 0 0',
          width: '78%',
          opacity: 0.85,
          background: cosmetic.barBackground ?? DEFAULT_BAR,
        }}
      />
      <span
        className={cosmetic.nameClassName}
        style={{ position: 'relative', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', ...cosmetic.nameStyle }}
      >
        {character.name}
      </span>
      {(cosmetic.borderClassName || cosmetic.borderStyle) && (
        <div
          aria-hidden="true"
          className={cosmetic.borderClassName}
          style={{ position: 'absolute', inset: 0, zIndex: 2, borderRadius: 'inherit', pointerEvents: 'none', ...cosmetic.borderStyle }}
        />
      )}
    </div>
  )
}

/** True when any of the cosmetic's classes has an `animation` rule in COSMETIC_CSS (including ::before/::after). */
function isAnimated(cosmetic: PlayerRowCosmetic): boolean {
  return [cosmetic.nameClassName, cosmetic.barClassName, cosmetic.borderClassName]
    .flatMap((classes) => classes?.split(' ') ?? [])
    .some((cls) => new RegExp(`\\.${cls}(::?[a-z-]+)?\\s*\\{[^}]*animation:`).test(COSMETIC_CSS))
}

function OptionTile({ preset, character, cosmetic, selected, locked, onSelect }: {
  preset: Preset
  character: DemoCharacter
  cosmetic: PlayerRowCosmetic
  selected: boolean
  locked: boolean
  onSelect: () => void
}) {
  const animated = isAnimated(cosmetic)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={cn(
            'group relative flex flex-col gap-1.5 rounded-lg border bg-card p-2 text-left transition-colors',
            selected && !locked && 'border-primary ring-2 ring-primary/40',
            selected && locked && 'border-destructive ring-2 ring-destructive/40',
            !selected && 'border-border hover:border-foreground/30',
          )}
        >
          <div className={cn(locked && !selected && 'opacity-50 grayscale-[30%]')}>
            <MiniRow character={character} cosmetic={cosmetic} />
          </div>
          <div className="flex items-center gap-1.5 px-0.5">
            <span className={cn('truncate text-xs font-medium', locked && 'text-muted-foreground')}>{preset.label}</span>
            {locked && <Lock className="size-3 shrink-0 text-muted-foreground" />}
            {selected && !locked && <Check className="ml-auto size-3.5 shrink-0 text-primary" />}
            {selected && locked && <span className="ml-auto shrink-0 text-[10px] font-medium uppercase text-destructive">Preview</span>}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-60 space-y-1.5 px-3 py-2 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{preset.label}</span>
          {preset.tier !== 'Free' && <TierBadge tier={preset.tier} />}
        </div>
        <p className="text-xs text-zinc-300">{preset.description}</p>
        {(animated || locked) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-1.5 text-[11px] text-zinc-400">
            {animated && (
              <span className="inline-flex items-center gap-1"><Wand2 className="size-3" />Animated</span>
            )}
            {locked && (
              <span className="inline-flex items-center gap-1" style={{ color: TIER_COLORS[preset.tier] }}><Lock className="size-3" />Unlocks at {preset.tier} · click to preview</span>
            )}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

function CosmeticEditorDialog({ character, tier, saved, onSave, onClose }: {
  character: DemoCharacter
  tier: Tier
  saved: CosmeticSelection
  onSave: (selection: CosmeticSelection, applyToAll: boolean) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(saved)
  const [applyToAll, setApplyToAll] = useState(false)
  const dirty = draft.name !== saved.name || draft.background !== saved.background || draft.border !== saved.border
  const requiredTierFor = (slot: (typeof SLOTS)[number]) => slot.presets[draft[slot.key]].tier
  const isInvalid = (slot: (typeof SLOTS)[number]) => TIER_RANK[requiredTierFor(slot)] > TIER_RANK[tier]
  const requiredTier = SLOTS.filter(isInvalid).map(requiredTierFor)
    .reduce<Tier | null>((max, t) => (!max || TIER_RANK[t] > TIER_RANK[max] ? t : max), null)
  const [barLength, setBarLength] = useState<'long' | 'short'>('long')
  const [above, below] = baseRaid.filter((p) => p.className !== character.className)
  const top = above.value
  const preview: PlayerMetricChartData[] = [
    { ...above, playerID: 'above' },
    { playerID: 'me', playerName: character.name, className: character.className, specialization: character.specialization, value: top * (barLength === 'long' ? 0.94 : 0.38), cosmetic: selectionCosmetic(draft) },
    { ...below, playerID: 'below', value: top * (barLength === 'long' ? 0.72 : 0.3) },
  ]
  const nextTier = (['Honored', 'Revered', 'Exalted'] as const).find((t) => TIER_RANK[t] > TIER_RANK[tier])

  return (
    <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
      <TooltipProvider delayDuration={120} skipDelayDuration={600}>
        <div className="flex items-start gap-3 border-b border-border px-6 py-4 pr-12">
          <Sparkles className="mt-1 size-5 shrink-0 text-primary" />
          <div className="min-w-0 space-y-1">
            <DialogTitle className="flex items-center gap-2">
              Customize <span style={{ color: `var(--color-class-${character.className.toLowerCase()})` }}>{character.name}</span>
              <TierBadge tier={tier} />
            </DialogTitle>
            <DialogDescription>Choose how {character.name} appears wherever they show up in logs.</DialogDescription>
          </div>
        </div>

        <div className="space-y-2 border-b border-border bg-muted/20 px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</span>
            <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
              {(['long', 'short'] as const).map((length) => (
                <button
                  key={length}
                  type="button"
                  onClick={() => setBarLength(length)}
                  className={cn('rounded px-2 py-0.5', barLength === length ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {length === 'long' ? 'Long bar' : 'Short bar'}
                </button>
              ))}
            </div>
          </div>
          <PlayerMetricChart type="damage" style={{ height: 104 }} data={preview} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {SLOTS.map((slot) => (
              <span key={slot.key} className={cn('inline-flex items-center gap-1', isInvalid(slot) && 'text-destructive')}>
                <span className={cn(!isInvalid(slot) && 'text-muted-foreground')}>{slot.label}:</span>
                {slot.presets[draft[slot.key]].label}
                {isInvalid(slot) && <><Lock className="size-3" />needs {requiredTierFor(slot)}</>}
              </span>
            ))}
            {nextTier && (
              <span className="ml-auto text-muted-foreground">
                Become <span style={{ color: TIER_COLORS[nextTier] }}>{nextTier}</span> to unlock more styles.
              </span>
            )}
          </div>
        </div>

        <Tabs defaultValue="name" className="styled-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <TabsList className="sticky top-0 z-10">
            {SLOTS.map((slot) => (
              <TabsTrigger
                key={slot.key}
                value={slot.key}
                className={cn('gap-1.5', isInvalid(slot) && 'text-destructive dark:text-destructive data-[state=active]:text-destructive dark:data-[state=active]:text-destructive')}
              >
                {(isInvalid(slot) || TIER_RANK[tier] < TIER_RANK[slot.unlock]) && <Lock className="size-3" />}
                {slot.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {SLOTS.map((slot) => {
            const unlocked = TIER_RANK[tier] >= TIER_RANK[slot.unlock]
            const groups = (['Free', 'Honored', 'Revered', 'Exalted'] as const)
              .map((groupTier) => ({ groupTier, entries: Object.entries(slot.presets).filter(([, preset]) => preset.tier === groupTier) }))
              .filter((group) => group.entries.length > 0)
            return (
              <TabsContent key={slot.key} value={slot.key} className="space-y-4 pt-2">
                {!unlocked && (
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    <Lock className="size-3.5" />
                    {slot.label} styles unlock at <TierBadge tier={slot.unlock} /> You can still pick one to preview it.
                  </div>
                )}
                {groups.map(({ groupTier, entries }) => (
                  <div key={groupTier} className="space-y-2">
                    {groupTier !== 'Free' && (
                      <div className="flex items-center gap-2">
                        <TierBadge tier={groupTier} />
                        {TIER_RANK[tier] < TIER_RANK[groupTier] && <span className="text-xs text-muted-foreground">Locked</span>}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {entries.map(([key, preset]) => (
                        <OptionTile
                          key={key}
                          preset={preset}
                          character={character}
                          cosmetic={selectionCosmetic({ ...DEFAULT_SELECTION, [slot.key]: key })}
                          selected={draft[slot.key] === key}
                          locked={TIER_RANK[tier] < TIER_RANK[preset.tier]}
                          onSelect={() => setDraft({ ...draft, [slot.key]: key })}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </TabsContent>
            )
          })}
        </Tabs>


        <div className="flex items-center gap-2 border-t border-border px-6 py-3">
          <Button variant="ghost" size="sm" onClick={() => setDraft(DEFAULT_SELECTION)} disabled={isDefaultSelection(draft)}>
            <RotateCcw className="size-3.5" />
            Reset to default
          </Button>
          <div className="ml-auto flex items-center gap-3">
            {requiredTier && (
              <span className="text-xs text-destructive">Previewing {requiredTier} styles</span>
            )}
            {tier !== 'Free' && !requiredTier && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={applyToAll} onCheckedChange={setApplyToAll} />
                Apply to all linked characters
              </label>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            {requiredTier || tier === 'Free' ? (
              <Button size="sm">
                <Sparkles className="size-3.5" />
                {tier === 'Free' ? 'Become a supporter' : `Become ${requiredTier}`}
              </Button>
            ) : (
              <Button size="sm" disabled={!dirty && !applyToAll} onClick={() => onSave(draft, applyToAll)}>Save</Button>
            )}
          </div>
        </div>
      </TooltipProvider>
    </DialogContent>
  )
}

function LinkedCharactersWithCosmetics() {
  const [tier, setTier] = useState<Tier>('Revered')
  const [editing, setEditing] = useState<string | null>(null)
  const [saved, setSaved] = useState<Record<string, CosmeticSelection>>({
    Saberslash: { name: 'holy', background: 'glossy', border: 'none' },
  })
  const editingCharacter = DEMO_CHARACTERS.find((c) => c.name === editing)

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        Storybook only · preview as
        {(['Free', 'Honored', 'Revered', 'Exalted'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTier(t)}
            className={cn('rounded-full border px-2 py-0.5', tier === t ? 'border-primary text-foreground' : 'border-border')}
          >
            {t}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-primary/30">
        <div className="space-y-1 border-b border-primary/30 bg-primary/5 px-5 py-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Swords className="size-5 text-primary" />
            Linked characters
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{DEMO_CHARACTERS.length}</span>
          </h3>
          <p className="text-sm text-muted-foreground">Characters verified as yours. Supporters can customize how each one appears in logs.</p>
        </div>
        <div className="divide-y divide-border">
          {DEMO_CHARACTERS.map((character) => {
            const live = effectiveSelection(saved[character.name] ?? DEFAULT_SELECTION, tier)
            return (
              <div key={character.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <img src={`/c/icons/class_${character.className.toLowerCase()}.png`} alt="" className="size-9 shrink-0 rounded border border-border bg-muted" />
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium" style={{ color: `var(--color-class-${character.className.toLowerCase()})` }}>{character.name}</span>
                    {character.isPrimary && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                        <Crown className="size-3" />
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{character.detail}</p>
                  {!isDefaultSelection(live) && (
                    <p className="truncate text-xs text-muted-foreground/70">Cosmetics: {selectionSummary(live)}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(character.name)}
                  className="hidden w-44 shrink-0 rounded-md sm:block"
                  title={`Customize ${character.name}`}
                >
                  <MiniRow character={character} cosmetic={selectionCosmetic(live)} />
                </button>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setEditing(character.name)}>
                    <Sparkles className="size-3.5" />
                    Customize
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">Unlink</Button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <Dialog open={!!editingCharacter} onOpenChange={(open) => !open && setEditing(null)}>
        {editingCharacter && (
          <CosmeticEditorDialog
            key={`${editingCharacter.name}-${tier}`}
            character={editingCharacter}
            tier={tier}
            saved={saved[editingCharacter.name] ?? DEFAULT_SELECTION}
            onClose={() => setEditing(null)}
            onSave={(next, applyToAll) => {
              setSaved((prev) => applyToAll
                ? Object.fromEntries(DEMO_CHARACTERS.map((c) => [c.name, next]))
                : { ...prev, [editingCharacter.name]: next })
              setEditing(null)
            }}
          />
        )}
      </Dialog>
    </div>
  )
}

/** Concept: per-character cosmetic editor opened in a modal from Account → Characters. Use the preview switcher to see each tier. */
export const Editor: Story = {
  render: () => <LinkedCharactersWithCosmetics />,
}
