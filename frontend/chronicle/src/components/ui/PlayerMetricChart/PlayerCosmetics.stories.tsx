import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Check, Crown, Heart, Lock, RotateCcw, Sparkles, Swords, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/Switch/Switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { PlayerMetricChart, type PlayerMetricChartData } from './PlayerMetricChart'
import type { PlayerRowCosmetic } from './PlayerMetricChartModel'
import {
  BACKGROUND_STYLES,
  BORDER_STYLES,
  COSMETIC_CSS,
  DEFAULT_BAR,
  NAME_STYLES,
  TIER_COLORS,
  type BackgroundStyleKey,
  type BorderStyleKey,
  type NameStyleKey,
  type Preset,
  type Tier,
} from './PlayerCosmetics'

/**
 * Concept: supporter tiers (Honored / Revered / Exalted) let a player style
 * their character name and damage bar wherever it appears in logs.
 * Bars expose the class color as `--bar-color` so styles stay class-tinted.
 */


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

const PAID_TIERS = ['Honored', 'Revered', 'Exalted'] as const

/** Supporter rank, styled like a WoW reputation bar, shown at the top of Account → Characters. */
function SupporterStatusCard({ tier }: { tier: Tier }) {
  const nextTier = PAID_TIERS.find((t) => TIER_RANK[t] > TIER_RANK[tier])
  const allPresets = SLOTS.flatMap((slot) => Object.values(slot.presets).filter((preset) => preset.tier !== 'Free'))
  const unlocked = allPresets.filter((preset) => TIER_RANK[preset.tier] <= TIER_RANK[tier]).length

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Heart className="size-5 text-primary" />
            Chronicle Supporter
            {tier === 'Free' ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Not a supporter</span>
            ) : (
              <TierBadge tier={tier} />
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            {tier === 'Free'
              ? 'Support Chronicle to style how your characters appear in logs.'
              : `Supporter since March 2026 · ${unlocked} of ${allPresets.length} styles unlocked`}
          </p>
        </div>
        {tier === 'Free' ? (
          <Button size="sm"><Sparkles className="size-3.5" />Become a supporter</Button>
        ) : (
          <div className="flex items-center gap-1">
            {nextTier && <Button size="sm"><Sparkles className="size-3.5" />Become {nextTier}</Button>}
            <Button variant="outline" size="sm">Manage</Button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-3 gap-1">
          {PAID_TIERS.map((t) => {
            const reached = TIER_RANK[tier] >= TIER_RANK[t]
            return (
              <div
                key={t}
                className="h-2.5 rounded-sm border border-black/40"
                style={{
                  background: reached ? `linear-gradient(to bottom, color-mix(in oklch, ${TIER_COLORS[t]} 70%, white), ${TIER_COLORS[t]})` : 'var(--muted)',
                  boxShadow: t === tier ? `0 0 8px ${TIER_COLORS[t]}` : undefined,
                }}
              />
            )
          })}
        </div>
        <div className="grid grid-cols-3 gap-1 text-xs">
          {PAID_TIERS.map((t) => {
            const reached = TIER_RANK[tier] >= TIER_RANK[t]
            const slot = SLOTS.find((x) => x.unlock === t)
            return (
              <div key={t} className="space-y-0.5">
                <div className="font-medium" style={{ color: reached ? TIER_COLORS[t] : 'var(--muted-foreground)' }}>{t}</div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  {reached ? <Check className="size-3" /> : <Lock className="size-3" />}
                  {t === 'Honored' && 'Name styles'}
                  {t === 'Revered' && 'Animated names, backgrounds'}
                  {t === 'Exalted' && `Showpiece names, ${slot?.label.toLowerCase()}s`}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
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

      <SupporterStatusCard tier={tier} />

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
              <div key={character.name} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditing(character.name)}>
                      <Sparkles className="size-3.5" />
                      Customize
                    </Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">Unlink</Button>
                  </div>
                </div>
                {/* How this character currently looks in logs; click to customize. */}
                <div
                  className="cursor-pointer space-y-1 rounded-md sm:pl-[3.25rem]"
                  onClick={() => setEditing(character.name)}
                  title={`Customize ${character.name}`}
                >
                  <PlayerMetricChart
                    type="damage"
                    style={{ height: 34 }}
                    data={[{ playerID: character.name, playerName: character.name, className: character.className, specialization: character.specialization, value: 1089, cosmetic: selectionCosmetic(live) }]}
                  />
                  <p className="text-xs text-muted-foreground/70">
                    {isDefaultSelection(live) ? 'Default look' : selectionSummary(live)}
                  </p>
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
