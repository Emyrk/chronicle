import type { CharacterCosmeticsDisplayMode, CosmeticDefinition, CosmeticSelection } from '@/api/typesGenerated'
import type { PlayerRowCosmetic } from './PlayerMetricChartModel'

export type Tier = 'Free' | 'Honored' | 'Revered' | 'Exalted'

export interface Preset {
  label: string
  tier: Tier
  description: string
  cosmetic: PlayerRowCosmetic
  /** Suppressed when viewers choose the Limited display mode. */
  flashy?: boolean
}

export const DEFAULT_BAR = 'linear-gradient(to right, oklch(0 0 0 / 0.3), oklch(0 0 0 / 0.15)), var(--bar-color)'

export const NAME_STYLES = {
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
    flashy: true,
  },
  shimmer: {
    label: 'Shimmer',
    tier: 'Revered',
    description: 'A highlight sweeps across the name.',
    cosmetic: { nameClassName: 'cosmetic-name-shimmer' },
    flashy: true,
  },
  prismatic: {
    label: 'Prismatic',
    tier: 'Exalted',
    description: 'Slow-cycling rainbow gradient.',
    cosmetic: { nameClassName: 'cosmetic-name-prismatic' },
    flashy: true,
  },
  storm: {
    label: 'Stormcaller',
    tier: 'Revered',
    description: 'Electric blue lettering that crackles with lightning.',
    cosmetic: { nameClassName: 'cosmetic-name-storm' },
    flashy: true,
  },
  legendary: {
    label: 'Legendary',
    tier: 'Revered',
    description: 'Legendary-quality orange with a bright sweep.',
    cosmetic: { nameClassName: 'cosmetic-name-legendary' },
    flashy: true,
  },
  holy: {
    label: 'Holy Light',
    tier: 'Revered',
    description: 'Pale gold lettering with a slow, radiant pulse.',
    cosmetic: { nameClassName: 'cosmetic-name-holy' },
    flashy: true,
  },
  arcane: {
    label: 'Arcane',
    tier: 'Exalted',
    description: 'Violet lettering with a sweeping highlight and an arcane pulse.',
    cosmetic: { nameClassName: 'cosmetic-name-arcane' },
    flashy: true,
  },
  thunderfury: {
    label: 'Thunderfury',
    tier: 'Exalted',
    description: 'Storm blue and gold bands roll through the name, with lightning flashes.',
    cosmetic: { nameClassName: 'cosmetic-name-thunderfury' },
    flashy: true,
  },
  molten: {
    label: 'Molten',
    tier: 'Exalted',
    description: 'Lava rises through the letters under a heat glow.',
    cosmetic: { nameClassName: 'cosmetic-name-molten' },
    flashy: true,
  },
} satisfies Record<string, Preset>

export const BACKGROUND_STYLES = {
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
    flashy: true,
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
    flashy: true,
  },
  embers: {
    label: 'Embers',
    tier: 'Exalted',
    description: 'Small sparks rise over the class color.',
    cosmetic: { barClassName: 'cosmetic-bar-embers', barBackground: DEFAULT_BAR },
    flashy: true,
  },
  snowfall: {
    label: 'Snowfall',
    tier: 'Exalted',
    description: 'Soft flakes drift down over the class color.',
    cosmetic: { barClassName: 'cosmetic-bar-snowfall', barBackground: DEFAULT_BAR },
    flashy: true,
  },
  starfall: {
    label: 'Starfall',
    tier: 'Exalted',
    description: 'Stars twinkle in and out across the background.',
    cosmetic: { barClassName: 'cosmetic-bar-starfall', barBackground: DEFAULT_BAR },
    flashy: true,
  },
} satisfies Record<string, Preset>

export const BORDER_STYLES = {
  none: { label: 'Default', tier: 'Free', description: 'No cosmetic border.', cosmetic: {} },
  elite: {
    label: 'Elite',
    tier: 'Exalted',
    description: 'Every few seconds, gold elite-frame brackets glint at the corners.',
    cosmetic: { borderClassName: 'cosmetic-border-elite' },
    flashy: true,
  },
  chasing: {
    label: 'Chasing Light',
    tier: 'Exalted',
    description: 'Every few seconds, class-colored comets race along the top and bottom edges.',
    cosmetic: { borderClassName: 'cosmetic-border-chasing' },
    flashy: true,
  },
  storm: {
    label: 'Stormcharged',
    tier: 'Exalted',
    description: 'Every few seconds, lightning flickers around the row.',
    cosmetic: { borderClassName: 'cosmetic-border-storm' },
    flashy: true,
  },
} satisfies Record<string, Preset>

export type NameStyleKey = keyof typeof NAME_STYLES
export type BackgroundStyleKey = keyof typeof BACKGROUND_STYLES
export type BorderStyleKey = keyof typeof BORDER_STYLES

export const COSMETIC_CSS = `
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
/* One flake per gradient on a wide tile of its own height, so every flake falls at its own speed and no rows line up. */
.cosmetic-bar-snowfall::before,
.cosmetic-bar-snowfall::after {
  content: '';
  position: absolute;
  inset: 0;
}
.cosmetic-bar-snowfall::before {
  background-image:
    radial-gradient(circle at 22% 55%, #ffffff 0 0.7px, transparent 1.2px),
    radial-gradient(circle at 71% 17%, #dff4ff 0 0.6px, transparent 1.1px),
    radial-gradient(circle at 30% 9%, #ffffff 0 0.9px, transparent 1.4px),
    radial-gradient(circle at 33% 16%, #dff4ff 0 0.7px, transparent 1.2px),
    radial-gradient(circle at 75% 20%, #ffffff 0 0.6px, transparent 1.1px),
    radial-gradient(circle at 53% 11%, #dff4ff 0 0.8px, transparent 1.3px),
    radial-gradient(circle at 20% 42%, #ffffff 0 0.8px, transparent 1.3px),
    radial-gradient(circle at 76% 44%, #dff4ff 0 0.8px, transparent 1.3px),
    radial-gradient(circle at 76% 86%, #ffffff 0 0.6px, transparent 1.1px),
    radial-gradient(circle at 94% 13%, #dff4ff 0 0.6px, transparent 1.1px),
    radial-gradient(circle at 66% 92%, #ffffff 0 0.8px, transparent 1.3px),
    radial-gradient(circle at 62% 79%, #dff4ff 0 0.8px, transparent 1.3px),
    radial-gradient(circle at 26% 94%, #ffffff 0 0.7px, transparent 1.2px),
    radial-gradient(circle at 70% 68%, #dff4ff 0 0.8px, transparent 1.3px),
    radial-gradient(circle at 12% 20%, #ffffff 0 0.7px, transparent 1.2px);
  background-size: 306px 31px, 233px 31px, 162px 43px, 281px 43px, 197px 31px, 196px 31px, 247px 34px, 283px 35px, 188px 41px, 284px 31px, 276px 43px, 256px 41px, 202px 32px, 227px 44px, 271px 43px;
  animation: cosmetic-snow-far 10s linear infinite;
  opacity: 0.55;
}
.cosmetic-bar-snowfall::after {
  background-image:
    radial-gradient(circle at 46% 24%, #ffffff 0 1.1px, transparent 1.6px),
    radial-gradient(circle at 88% 14%, #ffffff 0 1.0px, transparent 1.5px),
    radial-gradient(circle at 43% 48%, #dff4ff 0 1.3px, transparent 1.8px),
    radial-gradient(circle at 77% 63%, #ffffff 0 1.2px, transparent 1.7px),
    radial-gradient(circle at 37% 65%, #ffffff 0 1.0px, transparent 1.5px),
    radial-gradient(circle at 96% 94%, #dff4ff 0 1.0px, transparent 1.5px),
    radial-gradient(circle at 90% 62%, #ffffff 0 1.2px, transparent 1.7px),
    radial-gradient(circle at 88% 49%, #ffffff 0 1.2px, transparent 1.7px),
    radial-gradient(circle at 81% 19%, #dff4ff 0 1.1px, transparent 1.6px),
    radial-gradient(circle at 39% 21%, #ffffff 0 1.1px, transparent 1.6px),
    radial-gradient(circle at 66% 15%, #ffffff 0 1.2px, transparent 1.7px);
  background-size: 285px 49px, 302px 54px, 337px 47px, 177px 62px, 338px 57px, 239px 56px, 232px 58px, 165px 50px, 286px 37px, 223px 48px, 202px 50px;
  animation: cosmetic-snow-near 6s linear infinite;
  opacity: 0.85;
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
@keyframes cosmetic-snow-far { from { background-position: 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0; } to { background-position: 0 31px, 0 31px, 0 43px, 0 43px, 0 31px, 0 31px, 0 34px, 0 35px, 0 41px, 0 31px, 0 43px, 0 41px, 0 32px, 0 44px, 0 43px; } }
@keyframes cosmetic-snow-near { from { background-position: 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0; } to { background-position: 0 49px, 0 54px, 0 47px, 0 62px, 0 57px, 0 56px, 0 58px, 0 50px, 0 37px, 0 48px, 0 50px; } }
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

export const TIER_COLORS: Record<Tier, string> = {
  Free: 'var(--muted-foreground)',
  Honored: '#4ade80',
  Revered: '#60a5fa',
  Exalted: '#c084fc',
}

export const TIER_RANK: Record<Tier, number> = {
  Free: 0,
  Honored: 1,
  Revered: 2,
  Exalted: 3,
}

export interface CosmeticStyleSelection {
  name: NameStyleKey
  background: BackgroundStyleKey
  border: BorderStyleKey
}

export const DEFAULT_COSMETIC_SELECTION: CosmeticStyleSelection = {
  name: 'none',
  background: 'none',
  border: 'none',
}

function isFlashyPreset(preset: Preset): boolean {
  return preset.flashy === true
}

export function filterCosmeticSelection(
  selection: CosmeticStyleSelection,
  mode: CharacterCosmeticsDisplayMode,
): CosmeticStyleSelection {
  if (mode === 'disabled') return DEFAULT_COSMETIC_SELECTION
  if (mode === 'enabled') return selection

  return {
    name: isFlashyPreset(NAME_STYLES[selection.name]) ? 'none' : selection.name,
    background: isFlashyPreset(BACKGROUND_STYLES[selection.background]) ? 'none' : selection.background,
    border: isFlashyPreset(BORDER_STYLES[selection.border]) ? 'none' : selection.border,
  }
}

export function combineCosmetics(selection: CosmeticStyleSelection): PlayerRowCosmetic {
  return {
    ...NAME_STYLES[selection.name].cosmetic,
    ...BACKGROUND_STYLES[selection.background].cosmetic,
    ...BORDER_STYLES[selection.border].cosmetic,
  }
}

function keyToID(slot: keyof CosmeticStyleSelection, key: string): string {
  if (key === 'none') return ''
  const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  return `${slot}_${snakeKey}`
}

function idToKey<T extends string>(slot: keyof CosmeticStyleSelection, id: string, presets: Record<T, Preset>): T {
  if (!id) return 'none' as T
  const prefix = `${slot}_`
  if (!id.startsWith(prefix)) return 'none' as T
  const key = id.slice(prefix.length).replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()) as T
  return key in presets ? key : 'none' as T
}

export function selectionFromAPI(selection?: CosmeticSelection): CosmeticStyleSelection {
  return {
    name: idToKey('name', selection?.name_id ?? '', NAME_STYLES),
    background: idToKey('background', selection?.background_id ?? '', BACKGROUND_STYLES),
    border: idToKey('border', selection?.border_id ?? '', BORDER_STYLES),
  }
}

export function selectionToAPI(selection: CosmeticStyleSelection): CosmeticSelection {
  return {
    name_id: keyToID('name', selection.name),
    background_id: keyToID('background', selection.background),
    border_id: keyToID('border', selection.border),
  }
}

export function selectionSummary(selection: CosmeticStyleSelection): string {
  const parts = [
    selection.name !== 'none' && NAME_STYLES[selection.name].label,
    selection.background !== 'none' && BACKGROUND_STYLES[selection.background].label,
    selection.border !== 'none' && BORDER_STYLES[selection.border].label,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Default'
}

export function isDefaultSelection(selection: CosmeticStyleSelection): boolean {
  return selection.name === 'none' && selection.background === 'none' && selection.border === 'none'
}

export function cosmeticIDForSlot(selection: CosmeticStyleSelection, slot: keyof CosmeticStyleSelection): string {
  return keyToID(slot, selection[slot])
}

const API_TIERS: Record<string, Tier> = { honored: 'Honored', revered: 'Revered', exalted: 'Exalted' }

/** Maps an API tier ("honored") to its display tier; unknown or empty tiers are Free. */
export function tierFromAPI(tier?: string): Tier {
  return (tier && API_TIERS[tier]) || 'Free'
}

/**
 * The supporter's rank, derived from entitlements: the highest tier among the
 * cosmetics they are allowed to use. Tiers are granted as whole sets, so any
 * allowed cosmetic of a tier means that tier is unlocked.
 */
export function supporterTier(catalog: readonly CosmeticDefinition[], allowedIDs: readonly string[]): Tier {
  const allowed = new Set(allowedIDs)
  return catalog.reduce<Tier>((highest, definition) => {
    const tier = tierFromAPI(definition.tier)
    return allowed.has(definition.id) && TIER_RANK[tier] > TIER_RANK[highest] ? tier : highest
  }, 'Free')
}
