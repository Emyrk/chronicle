/**
 * Data provider that fetches game data from Chronicle's APIs.
 * Uses in-memory caching for repeated lookups.
 */

import type { SimItem } from "../api/typesGenerated";
import type { WoWSpell } from "../api/wowdb";
import type { SpellData, SpellEffect, CreatureData, PlayerBaseStats } from "./types";

/** Convert WoWSpell (from /wowdb/spell API) to our sim SpellData. */
export function wowSpellToSpellData(ws: WoWSpell): SpellData {
  const effects: [SpellEffect, SpellEffect, SpellEffect] = [
    makeEffect(ws, 0),
    makeEffect(ws, 1),
    makeEffect(ws, 2),
  ];

  return {
    id: ws.id,
    name: ws.name[0] ?? "",
    school: ws.school?.value ?? 0,
    dmgClass: ws.defense_type?.value ?? 0,
    powerType: ws.power_type?.value ?? 0,
    manaCost: ws.mana_cost ?? 0,
    manaCostPct: ws.mana_cost_pct ?? 0,
    castTimeMs: ws.casting_time?.Base ?? 0,
    cooldownMs: (ws.recovery_time ?? 0) / 1_000_000, // nanoseconds → ms
    categoryCooldownMs: (ws.category_recovery_time ?? 0) / 1_000_000,
    gcdMs: (ws.start_recovery_time ?? 0) / 1_000_000,
    durationMs: ws.duration?.Duration ?? 0,
    spellLevel: ws.spell_level ?? 0,
    baseLevel: ws.base_level ?? 0,
    maxLevel: ws.max_level ?? 0,
    effects,
    procFlags: ws.proc_type_mask?.value ?? 0,
    procChance: ws.proc_chance ?? 0,
    procCharges: ws.proc_charges ?? 0,
    speed: ws.speed ?? 0,
    mechanic: ws.mechanic?.value ?? 0,
    attributes: [0, 0, 0, 0, 0], // TODO: parse from ws.attributes if needed
    spellFamilyName: ws.spell_class_set?.value ?? 0,
    spellFamilyFlags: ws.spell_class_mask ?? 0,
    maxTargetLevel: ws.max_target_level ?? 0,
    maxAffectedTargets: ws.max_affected_targets ?? 0,
    equippedItemClass: ws.equipped_item_class ?? -1,
    equippedItemSubclass: ws.equipped_item_subclass_mask ?? 0,
  };
}

function makeEffect(ws: WoWSpell, idx: number): SpellEffect {
  return {
    type: ws.effect?.[idx]?.value ?? 0,
    basePoints: ws.effect_base_points?.[idx] ?? 0,
    dieSides: ws.effect_die_sides?.[idx] ?? 0,
    baseDice: ws.effect_base_dice?.[idx] ?? 0,
    pointsPerLevel: ws.effect_real_points_per_level?.[idx] ?? 0,
    dicePerLevel: ws.effect_dice_per_level?.[idx] ?? 0,
    bonusCoefficient: ws.effect_bonus_coefficient?.[idx] ?? -1,
    auraType: ws.effect_aura?.[idx]?.value ?? 0,
    auraPeriodMs: ws.effect_aura_period?.[idx] ?? 0,
    amplitude: ws.effect_amplitude?.[idx] ?? 0,
    triggerSpellId: ws.effect_trigger_spell?.[idx] ?? 0,
    chainTargets: ws.effect_chain_targets?.[idx] ?? 0,
    pointsPerCombo: ws.effect_points_per_combo?.[idx] ?? 0,
    miscValue: ws.effect_misc_value?.[idx] ?? 0,
    mechanicMask: ws.effect_mechanic?.[idx] ?? 0,
  };
}

export class ApiDataProvider {
  private spellCache = new Map<number, SpellData>();
  private itemCache = new Map<number, SimItem>();
  private bossPresets: Record<string, CreatureData> | null = null;
  private baseStats: Record<string, PlayerBaseStats> | null = null;

  async getSpell(id: number): Promise<SpellData | null> {
    const cached = this.spellCache.get(id);
    if (cached) return cached;

    const res = await fetch(`/api/v1/wowdb/spell/${id}`);
    if (!res.ok) return null;
    const ws: WoWSpell = await res.json();
    const sd = wowSpellToSpellData(ws);
    this.spellCache.set(id, sd);
    return sd;
  }

  async getItem(id: number): Promise<SimItem | null> {
    const cached = this.itemCache.get(id);
    if (cached) return cached;

    const res = await fetch(`/api/v1/internal/gamedata/sim/item/${id}`);
    if (!res.ok) return null;
    const item: SimItem = await res.json();
    this.itemCache.set(id, item);
    return item;
  }

  async getBossPresets(): Promise<Record<string, CreatureData>> {
    if (this.bossPresets) return this.bossPresets;
    const res = await fetch("/api/v1/assets/boss-presets.json");
    this.bossPresets = await res.json();
    return this.bossPresets!;
  }

  async getPlayerBaseStats(race: number, classId: number): Promise<PlayerBaseStats | null> {
    if (!this.baseStats) {
      const res = await fetch("/api/v1/assets/player-base-stats.json");
      this.baseStats = await res.json();
    }
    const key = `${race}_${classId}`;
    return this.baseStats![key] ?? null;
  }
}
