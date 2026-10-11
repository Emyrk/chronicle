/**
 * Hard-coded fight for the Player Timeline help page: a mage and a rogue on a
 * boss for 40 seconds, built to show every feature the help annotates (hard
 * casts, a channel, a failed cast, idle gaps, cooldowns, procs, a consumable,
 * auto attacks, buffs and debuffs). No API calls and no randomness.
 */

import { HitTypeCrit, HitTypeDodge, HitTypeGlancing, HitTypeHit, HitTypeMiss, HitTypeOffHand } from "@/lib/hittype/hittype";
import {
  DAMAGE_BIN_MS,
  type PlayerTimelineData,
  type TimelineAuraSegment,
  type TimelineCast,
  type TimelineSwing,
} from "../../../EventsPanels/RotationTimeline/rotationTimeline.processor";
import type { CooldownInfo, RotationTimelinePlayer } from "../../../EventsPanels/RotationTimeline/RotationTimeline";

export const HELP_DURATION_MS = 40_000;

const MAGE = "help-player-mage";
const ROGUE = "help-player-rogue";
const PRIEST = "help-player-priest";
const BOSS = "help-boss";

const UNIT_NAMES: Record<string, string> = {
  [MAGE]: "Ashwyn",
  [ROGUE]: "Kestrel",
  [PRIEST]: "Seraphine",
  [BOSS]: "Ragnaros",
};

export const helpUnitName = (guid: string) => UNIT_NAMES[guid] ?? "Unknown";

interface HelpSpell {
  name: string;
  icon: string;
  school: string;
  gcdMs: number;
}

/** Spells in the fixture: name, icon texture, school color and GCD. */
export const HELP_SPELLS: Record<number, HelpSpell> = {
  25304: { name: "Frostbolt", icon: "spell_frost_frostbolt02", school: "frost", gcdMs: 1500 },
  25306: { name: "Fireball", icon: "spell_fire_flamebolt", school: "fire", gcdMs: 1500 },
  10199: { name: "Fire Blast", icon: "spell_fire_fireball", school: "fire", gcdMs: 1500 },
  25345: { name: "Arcane Missiles", icon: "spell_nature_starfall", school: "arcane", gcdMs: 1500 },
  12042: { name: "Arcane Power", icon: "spell_nature_lightning", school: "arcane", gcdMs: 0 },
  12536: { name: "Clearcasting", icon: "spell_shadow_manaburn", school: "arcane", gcdMs: 0 },
  17531: { name: "Restore Mana", icon: "inv_potion_76", school: "arcane", gcdMs: 0 },
  10060: { name: "Power Infusion", icon: "spell_holy_powerinfusion", school: "holy", gcdMs: 1500 },
  10157: { name: "Arcane Intellect", icon: "spell_holy_magicalsentry", school: "arcane", gcdMs: 1500 },
  9885: { name: "Mark of the Wild", icon: "spell_nature_regeneration", school: "nature", gcdMs: 1500 },
  12579: { name: "Winter's Chill", icon: "spell_frost_chillingblast", school: "frost", gcdMs: 0 },
  11294: { name: "Sinister Strike", icon: "spell_shadow_ritualofsacrifice", school: "physical", gcdMs: 1000 },
  31016: { name: "Eviscerate", icon: "ability_rogue_eviscerate", school: "physical", gcdMs: 1000 },
  6774: { name: "Slice and Dice", icon: "ability_rogue_slicedice", school: "physical", gcdMs: 1000 },
  13750: { name: "Adrenaline Rush", icon: "spell_shadow_shadowworddominate", school: "physical", gcdMs: 0 },
  13877: { name: "Blade Flurry", icon: "ability_warrior_punishingblow", school: "physical", gcdMs: 0 },
  20007: { name: "Holy Strength", icon: "spell_holy_blessingofstrength", school: "holy", gcdMs: 0 },
  11354: { name: "Deadly Poison", icon: "ability_rogue_dualweild", school: "nature", gcdMs: 0 },
  25289: { name: "Battle Shout", icon: "ability_warrior_battleshout", school: "physical", gcdMs: 1500 },
  17628: { name: "Supreme Power", icon: "inv_potion_41", school: "arcane", gcdMs: 0 },
  17538: { name: "Elixir of the Mongoose", icon: "inv_potion_32", school: "nature", gcdMs: 0 },
};

/** Cooldowns that sit on the rail and tint the lane while their buff is up. */
const HELP_COOLDOWNS: Record<number, CooldownInfo> = {
  12042: { durationMs: 15_000 },
  13750: { durationMs: 15_000 },
  13877: { durationMs: 15_000 },
};

export const helpCooldownInfo = (spellId: number): CooldownInfo | null => HELP_COOLDOWNS[spellId] ?? null;
export const helpGcd = (spellId: number) => HELP_SPELLS[spellId]?.gcdMs ?? 1500;

/** Buff the help page starts raised, to show what a raised row looks like. */
export const HELP_RAISED_BUFF = "Power Infusion";

interface CastOptions {
  /** Cast time: the cast starts at `at` and lands castMs later. */
  castMs?: number;
  channelMs?: number;
  damage?: number;
  crit?: boolean;
  /** The cast stopped here without landing (moved, interrupted). */
  failAtMs?: number;
  consume?: string;
}

function cast(at: number, spellId: number, opts: CastOptions = {}): TimelineCast {
  const spell = HELP_SPELLS[spellId];
  const castMs = opts.castMs ?? 0;
  const channelMs = opts.channelMs ?? 0;
  const failed = opts.failAtMs != null;
  const endMs = failed ? opts.failAtMs! : at + castMs;
  const ticks = channelMs > 0 ? Array.from({ length: 5 }, (_, i) => at + ((i + 1) * channelMs) / 5) : [];
  return {
    source: opts.consume ? "consume" : failed ? "spell_fail" : "spell_go",
    startMs: at,
    endMs,
    spellId,
    spellName: spell.name,
    target: BOSS,
    castTimeMs: castMs > 0 ? castMs : null,
    channelTimeMs: channelMs > 0 ? channelMs : null,
    channel: channelMs > 0,
    tickMs: ticks,
    failed,
    itemId: null,
    damage: failed ? 0 : (opts.damage ?? 0),
    periodicDamage: 0,
    hits: opts.damage ? 1 : 0,
    crits: opts.crit ? 1 : 0,
    healing: 0,
    overheal: 0,
    healCrits: 0,
    ...(opts.consume && { consume: { itemId: 13444, itemName: opts.consume } }),
  };
}

function aura(spellId: number, startMs: number, endMs: number | null, extra: Partial<TimelineAuraSegment> = {}): TimelineAuraSegment {
  return {
    spellId,
    spellName: HELP_SPELLS[spellId].name,
    isBuff: true,
    caster: null,
    target: "",
    startMs,
    endMs,
    maxStacks: 1,
    ...extra,
  };
}

function swing(offsetMs: number, offHand: boolean, hitType: number, amount: number): TimelineSwing {
  return { offsetMs, offHand, hitType: hitType | (offHand ? HitTypeOffHand : 0), amount, tailerAmount: 0, target: BOSS };
}

/** Per-second damage bins and totals from casts and swings. */
function withTotals(data: Omit<PlayerTimelineData, "damageBins" | "totalDamage" | "damageByTarget">): PlayerTimelineData {
  const bins = new Array<number>(Math.ceil(HELP_DURATION_MS / DAMAGE_BIN_MS)).fill(0);
  const add = (ms: number, amount: number) => {
    const i = Math.min(bins.length - 1, Math.floor(ms / DAMAGE_BIN_MS));
    bins[i] += amount;
  };
  for (const c of data.goCasts) {
    if (c.channel) c.tickMs.forEach((t) => add(t, c.damage / c.tickMs.length));
    else add(c.endMs, c.damage);
  }
  for (const s of data.swings) add(s.offsetMs, s.amount);
  const total = bins.reduce((a, b) => a + b, 0);
  return { ...data, damageBins: bins, totalDamage: total, damageByTarget: { [BOSS]: total } };
}

const empty = { textCasts: [], healBins: [], totalHealing: 0, totalOverheal: 0, consumes: [], auraProcs: [] };

/** Consumables a player used, by their spell, the way the consume stream reports them. */
const consumeSpells = (...ids: number[]) => ids.map((spellId) => ({ spellId, spellName: HELP_SPELLS[spellId].name }));

function mage(): PlayerTimelineData {
  const goCasts = [
    cast(0, 25304, { castMs: 2500, damage: 1800 }),
    cast(2500, 25304, { castMs: 2500, damage: 3650, crit: true }),
    cast(5000, 12042),
    cast(5000, 25306, { castMs: 3000, damage: 3100 }),
    cast(8000, 10199, { damage: 1250 }),
    cast(9500, 25304, { castMs: 2500, damage: 2050 }),
    cast(12_000, 25304, { castMs: 2500, failAtMs: 13_100 }),
    // Idle: nothing cast from 13.1s to 15.4s.
    cast(15_400, 25345, { channelMs: 5000, damage: 2600 }),
    cast(17_000, 12536),
    cast(20_400, 25304, { castMs: 2500, damage: 1950 }),
    cast(22_900, 17531, { consume: "Major Mana Potion" }),
    cast(22_900, 25304, { castMs: 2500, damage: 3900, crit: true }),
    cast(25_400, 25306, { castMs: 3000, damage: 2950 }),
    cast(28_400, 10199, { damage: 1300 }),
    cast(29_900, 25304, { castMs: 2500, damage: 2000 }),
    cast(32_400, 25304, { castMs: 2500, damage: 2100 }),
    cast(34_900, 25304, { castMs: 2500, damage: 1900 }),
    cast(37_400, 10199, { damage: 2600, crit: true }),
  ];
  return withTotals({
    ...empty,
    guid: MAGE,
    goCasts,
    swings: [],
    consumeSpells: consumeSpells(17628, 17531),
    aurasOn: [
      aura(12042, 5000, 20_000),
      aura(12536, 17_000, 20_400),
      aura(10060, 24_000, 39_000, { caster: PRIEST }),
      aura(10157, 0, null),
      aura(9885, 0, null),
      aura(17628, 0, null),
    ],
    debuffsCast: [
      aura(12579, 2500, null, { isBuff: false, target: BOSS, maxStacks: 5 }),
      aura(25306, 8000, 12_000, { isBuff: false, target: BOSS }),
      aura(25306, 28_400, 32_400, { isBuff: false, target: BOSS }),
    ],
  });
}

function rogue(): PlayerTimelineData {
  const ss = (at: number, damage: number, crit = false) => cast(at, 11294, { damage, crit });
  const goCasts = [
    cast(500, 6774),
    ss(1600, 980),
    ss(3200, 1010),
    cast(3500, 20007),
    ss(4800, 2050, true),
    cast(6000, 13750),
    cast(6000, 13877),
    ss(6100, 1020),
    ss(7100, 990),
    ss(8100, 1040),
    ss(9100, 1000),
    cast(10_200, 31016, { damage: 3550, crit: true }),
    ss(11_200, 1010),
    cast(12_200, 20007),
    ss(12_300, 990),
    ss(13_300, 2080, true),
    ss(14_300, 1000),
    // Idle: out of energy from 15.3s to 17.5s.
    ss(17_500, 1020),
    ss(19_500, 990),
    cast(20_100, 20007),
    ss(21_500, 1030),
    cast(23_500, 31016, { damage: 1800 }),
    cast(25_000, 6774),
    ss(27_000, 1000),
    ss(29_000, 1010),
    cast(30_500, 20007),
    ss(31_000, 2040, true),
    ss(33_000, 990),
    cast(35_000, 31016, { damage: 1850 }),
    ss(37_000, 1020),
    ss(39_000, 1000),
  ];
  // Main hand every 2.7s, off hand every 1.9s, with a few crits, glances and avoids.
  const swings: TimelineSwing[] = [];
  for (let i = 0, t = 300; t < HELP_DURATION_MS; i++, t += 2700) {
    const kind = i % 7 === 3 ? HitTypeCrit : i % 5 === 1 ? HitTypeGlancing : i % 9 === 4 ? HitTypeDodge : HitTypeHit;
    swings.push(swing(t, false, kind, kind === HitTypeDodge ? 0 : kind === HitTypeCrit ? 820 : kind === HitTypeGlancing ? 300 : 410));
  }
  for (let i = 0, t = 1100; t < HELP_DURATION_MS; i++, t += 1900) {
    const kind = i % 6 === 2 ? HitTypeMiss : i % 8 === 5 ? HitTypeCrit : HitTypeHit;
    swings.push(swing(t, true, kind, kind === HitTypeMiss ? 0 : kind === HitTypeCrit ? 400 : 200));
  }
  swings.sort((a, b) => a.offsetMs - b.offsetMs);
  return withTotals({
    ...empty,
    guid: ROGUE,
    goCasts,
    swings,
    consumeSpells: consumeSpells(17538),
    aurasOn: [
      aura(6774, 500, 9500),
      aura(6774, 25_000, 34_000),
      aura(13750, 6000, 21_000),
      aura(13877, 6000, 21_000),
      aura(20007, 3500, 18_500),
      aura(20007, 20_100, 35_500),
      aura(9885, 0, null),
      aura(25289, 0, null, { caster: "help-player-warrior" }),
      aura(17538, 0, 32_000),
    ],
    debuffsCast: [aura(11354, 2000, null, { isBuff: false, target: BOSS, maxStacks: 5 })],
  });
}

/** Player A (mage) and B (rogue). */
export function helpPlayers(): RotationTimelinePlayer[] {
  return [
    { guid: MAGE, name: "Ashwyn", className: "Mage", data: mage() },
    { guid: ROGUE, name: "Kestrel", className: "Rogue", data: rogue() },
  ];
}
