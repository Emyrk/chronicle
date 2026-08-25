/**
 * Deterministic curated fixture data for the Damage Done example mode.
 *
 * Supports ALL lessons: a full raid roster, abilities with detailed hit stats
 * (min/avg/max), targets, rank-separated spell IDs, a pet contributor, and
 * focus data. Hardcoded values — no API calls, no randomness, no 404 risk.
 *
 * Adapted from PR #332's fixture, extended to a 12-player roster.
 */

import type { WoWSpell } from "@/api/wowdb";
import type { ParsePillData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { parseHexColor } from "@/pages/Instance/parseColors";
import type { Instance } from "../../../InstancePage";
import type {
  DamageAbilityBreakout,
  HitTypeStats,
  SpellIdAbilityBreakout,
} from "../../processors/abilityBreakout";
import { PERIODIC_SPELL_ID_OFFSET } from "../../processors/abilityBreakout";
import { createGuidCache } from "../../processors/guidCache";
import type { EntitySelection, PanelContext, PanelRenderProps } from "../../types";
import type { DamageDoneData, DamageDoneResult } from "../damageDone.processor";

// ── Player GUIDs (player GUIDs start 0x0000, pets 0x0040) ──
const PLAYER_MAGE = "0x000000000000A001";
const PLAYER_WARRIOR = "0x000000000000A002";
const PLAYER_ROGUE = "0x000000000000A003";
const PLAYER_WARLOCK = "0x000000000000A004";
const PLAYER_HUNTER = "0x000000000000A005";
const PLAYER_SHAMAN = "0x000000000000A006";
const PLAYER_DRUID = "0x000000000000A007";
const PLAYER_MAGE_2 = "0x000000000000A008";
const PLAYER_PALADIN = "0x000000000000A009";
const PLAYER_ROGUE_2 = "0x000000000000A00A";
const PLAYER_PRIEST = "0x000000000000A00B";
const PLAYER_WARRIOR_2 = "0x000000000000A00C";
const PET_WOLF = "0x004000000000A0FE";

// ── Enemy GUIDs ──
const ENEMY_BOSS = "0x0010000000000B01";
const ENEMY_ADD = "0x0010000000000B02";

// ── Encounter IDs ──
const ENCOUNTER_ID = "example-enc-001";

// ── Helpers ──
function makeHitStats(count: number, total: number, min: number, max: number): HitTypeStats {
  return { count, total, min, max };
}

function makeAbilityBreakout(opts: {
  total: number;
  count: number;
  crits: number;
  hits: number;
  misses?: number;
  hitStats?: HitTypeStats;
  critStats?: HitTypeStats;
  glancingStats?: HitTypeStats;
  absorbed?: number;
  dodges?: number;
  parries?: number;
  glancing?: number;
}): DamageAbilityBreakout {
  return {
    Total: opts.total,
    Count: opts.count,
    Crits: opts.crits,
    Hits: opts.hits,
    Misses: opts.misses ?? 0,
    HitStats: opts.hitStats,
    CritStats: opts.critStats,
    GlancingStats: opts.glancingStats,
    Absorbed: opts.absorbed,
    Dodges: opts.dodges,
    Parries: opts.parries,
    Glancing: opts.glancing,
  };
}

function makeSpellIdBreakout(
  spellName: string,
  breakout: DamageAbilityBreakout,
): SpellIdAbilityBreakout {
  return { ...breakout, spellName };
}

function makePlayerData(
  id: string,
  name: string,
  className: string,
  totalDamage: number,
): DamageDoneData {
  return {
    playerID: id,
    playerName: name,
    className,
    specialization: "",
    target: new Map([
      [ENEMY_BOSS, Math.round(totalDamage * 0.7)],
      [ENEMY_ADD, Math.round(totalDamage * 0.3)],
    ]),
  };
}

/** A simple one-ability breakout for roster players without detailed lessons. */
function makeSimpleAbilities(
  abilityName: string,
  total: number,
): Map<string, DamageAbilityBreakout> {
  const count = Math.max(10, Math.round(total / 2000));
  const crits = Math.round(count * 0.25);
  const hits = count - crits;
  const critTotal = Math.round(total * 0.4);
  const hitTotal = total - critTotal;
  const abilities = new Map<string, DamageAbilityBreakout>();
  abilities.set(
    abilityName,
    makeAbilityBreakout({
      total,
      count,
      crits,
      hits,
      hitStats: makeHitStats(hits, hitTotal, Math.round(hitTotal / hits / 1.4), Math.round((hitTotal / hits) * 1.5)),
      critStats: makeHitStats(crits, critTotal, Math.round(critTotal / crits / 1.3), Math.round((critTotal / crits) * 1.4)),
    }),
  );
  return abilities;
}

const ROSTER: Array<[guid: string, name: string, className: string, total: number, simpleAbility: string]> = [
  [PLAYER_MAGE, "Frostweaver", "Mage", 245000, ""],
  [PLAYER_WARLOCK, "Darkbinder", "Warlock", 230000, ""],
  [PLAYER_ROGUE, "Shadowstep", "Rogue", 215000, ""],
  [PLAYER_WARRIOR, "Steelbreaker", "Warrior", 198000, ""],
  [PLAYER_HUNTER, "Eagleeye", "Hunter", 175000, ""],
  [PLAYER_MAGE_2, "Embermind", "Mage", 162000, "Fireball"],
  [PLAYER_SHAMAN, "Stormtotem", "Shaman", 149000, "Lightning Bolt"],
  [PLAYER_ROGUE_2, "Nightreave", "Rogue", 131000, "Backstab"],
  [PLAYER_DRUID, "Thornclaw", "Druid", 118000, "Wrath"],
  [PLAYER_WARRIOR_2, "Ironhide", "Warrior", 84000, "Heroic Strike"],
  [PLAYER_PALADIN, "Lightmourn", "Paladin", 52000, "Consecration"],
  [PLAYER_PRIEST, "Whisperfaith", "Priest", 31000, "Smite"],
];

// ── Build the fixture result ──
function buildFixtureResult(): DamageDoneResult {
  const encounterDamage = new Map<string, Map<string, DamageDoneData>>();
  const unitDamage = new Map<string, DamageDoneData>();
  for (const [guid, name, className, total] of ROSTER) {
    unitDamage.set(guid, makePlayerData(guid, name, className, total));
  }
  // Pet contributor (GUID shape marks it as a pet; teaches the pets lesson).
  unitDamage.set(PET_WOLF, makePlayerData(PET_WOLF, "Grizzletooth", "Hunter", 24000));
  encounterDamage.set(ENCOUNTER_ID, unitDamage);

  const byAbility = new Map<string, Map<string, DamageAbilityBreakout>>();

  // Detailed ability sets for the featured five (drive the deeper lessons).
  const mageAbilities = new Map<string, DamageAbilityBreakout>();
  mageAbilities.set(
    "Frostbolt",
    makeAbilityBreakout({
      total: 145000, count: 80, crits: 24, hits: 52, misses: 4,
      hitStats: makeHitStats(52, 94000, 1200, 2400),
      critStats: makeHitStats(24, 51000, 1800, 3600),
    }),
  );
  mageAbilities.set(
    "Ice Lance",
    makeAbilityBreakout({
      total: 55000, count: 40, crits: 12, hits: 26, misses: 2,
      hitStats: makeHitStats(26, 26000, 800, 1200),
      critStats: makeHitStats(12, 29000, 2000, 3000),
    }),
  );
  mageAbilities.set(
    "Cone of Cold",
    makeAbilityBreakout({
      total: 45000, count: 15, crits: 5, hits: 10,
      hitStats: makeHitStats(10, 25000, 2000, 3200),
      critStats: makeHitStats(5, 20000, 3500, 5000),
    }),
  );
  byAbility.set(PLAYER_MAGE, mageAbilities);

  const warriorAbilities = new Map<string, DamageAbilityBreakout>();
  warriorAbilities.set(
    "Heroic Strike",
    makeAbilityBreakout({
      total: 85000, count: 60, crits: 15, hits: 40, misses: 3, glancing: 2,
      hitStats: makeHitStats(40, 56000, 1000, 1800),
      critStats: makeHitStats(15, 27000, 1500, 2500),
      glancingStats: makeHitStats(2, 2000, 800, 1200),
    }),
  );
  warriorAbilities.set(
    "Execute",
    makeAbilityBreakout({
      total: 68000, count: 12, crits: 6, hits: 5, misses: 1,
      hitStats: makeHitStats(5, 25000, 4200, 5800),
      critStats: makeHitStats(6, 42000, 6000, 8200),
    }),
  );
  warriorAbilities.set(
    "Whirlwind",
    makeAbilityBreakout({
      total: 45000, count: 30, crits: 8, hits: 20, dodges: 2,
      hitStats: makeHitStats(20, 28000, 1100, 1700),
      critStats: makeHitStats(8, 17000, 1800, 2600),
    }),
  );
  byAbility.set(PLAYER_WARRIOR, warriorAbilities);

  const rogueAbilities = new Map<string, DamageAbilityBreakout>();
  rogueAbilities.set(
    "Sinister Strike",
    makeAbilityBreakout({
      total: 95000, count: 65, crits: 20, hits: 42, misses: 3,
      hitStats: makeHitStats(42, 58000, 1100, 1700),
      critStats: makeHitStats(20, 37000, 1500, 2400),
    }),
  );
  rogueAbilities.set(
    "Eviscerate",
    makeAbilityBreakout({
      total: 72000, count: 18, crits: 7, hits: 11,
      hitStats: makeHitStats(11, 38000, 2800, 4200),
      critStats: makeHitStats(7, 34000, 4000, 6200),
    }),
  );
  rogueAbilities.set(
    "Blade Flurry",
    makeAbilityBreakout({
      total: 48000, count: 25, crits: 6, hits: 19,
      hitStats: makeHitStats(19, 30000, 1200, 2000),
      critStats: makeHitStats(6, 18000, 2500, 3800),
    }),
  );
  byAbility.set(PLAYER_ROGUE, rogueAbilities);

  const warlockAbilities = new Map<string, DamageAbilityBreakout>();
  warlockAbilities.set(
    "Shadow Bolt",
    makeAbilityBreakout({
      total: 130000, count: 55, crits: 18, hits: 34, misses: 3,
      hitStats: makeHitStats(34, 74000, 1800, 2800),
      critStats: makeHitStats(18, 56000, 2700, 4200),
    }),
  );
  warlockAbilities.set(
    "Corruption",
    makeAbilityBreakout({
      total: 60000, count: 45, crits: 0, hits: 45,
      hitStats: makeHitStats(45, 60000, 1100, 1500),
    }),
  );
  warlockAbilities.set(
    "Immolate",
    makeAbilityBreakout({
      total: 40000, count: 30, crits: 8, hits: 22,
      hitStats: makeHitStats(22, 24000, 900, 1300),
      critStats: makeHitStats(8, 16000, 1600, 2400),
    }),
  );
  byAbility.set(PLAYER_WARLOCK, warlockAbilities);

  const hunterAbilities = new Map<string, DamageAbilityBreakout>();
  hunterAbilities.set(
    "Aimed Shot",
    makeAbilityBreakout({
      total: 85000, count: 25, crits: 10, hits: 14, misses: 1,
      hitStats: makeHitStats(14, 42000, 2500, 3800),
      critStats: makeHitStats(10, 43000, 3600, 5200),
    }),
  );
  hunterAbilities.set(
    "Auto Shot",
    makeAbilityBreakout({
      total: 55000, count: 50, crits: 12, hits: 35, glancing: 3,
      hitStats: makeHitStats(35, 35000, 800, 1200),
      critStats: makeHitStats(12, 18000, 1200, 1800),
      glancingStats: makeHitStats(3, 2000, 550, 750),
    }),
  );
  hunterAbilities.set(
    "Multi-Shot",
    makeAbilityBreakout({
      total: 35000, count: 15, crits: 4, hits: 11,
      hitStats: makeHitStats(11, 22000, 1500, 2500),
      critStats: makeHitStats(4, 13000, 2800, 3800),
    }),
  );
  byAbility.set(PLAYER_HUNTER, hunterAbilities);

  // Simple single-ability breakouts for the rest of the roster (+ pet).
  for (const [guid, , , total, simpleAbility] of ROSTER) {
    if (simpleAbility) byAbility.set(guid, makeSimpleAbilities(simpleAbility, total));
  }
  byAbility.set(PET_WOLF, makeSimpleAbilities("Bite", 24000));

  // By ability by spell ID (for spell ranks)
  const byAbilityBySpellId = new Map<string, Map<number, SpellIdAbilityBreakout>>();

  // Mage: Frostbolt Rank 11 (25304) and Rank 4 (837) — downranking lesson.
  const mageSpells = new Map<number, SpellIdAbilityBreakout>();
  mageSpells.set(
    25304,
    makeSpellIdBreakout(
      "Frostbolt",
      makeAbilityBreakout({
        total: 138000, count: 72, crits: 22, hits: 48, misses: 2,
        hitStats: makeHitStats(48, 90000, 1400, 2400),
        critStats: makeHitStats(22, 48000, 1800, 3600),
      }),
    ),
  );
  mageSpells.set(
    837,
    makeSpellIdBreakout(
      "Frostbolt",
      makeAbilityBreakout({
        total: 7000, count: 8, crits: 2, hits: 4, misses: 2,
        hitStats: makeHitStats(4, 4000, 600, 1200),
        critStats: makeHitStats(2, 3000, 1200, 1800),
      }),
    ),
  );
  mageSpells.set(
    12557,
    makeSpellIdBreakout(
      "Ice Lance",
      makeAbilityBreakout({
        total: 55000, count: 40, crits: 12, hits: 26, misses: 2,
        hitStats: makeHitStats(26, 26000, 800, 1200),
        critStats: makeHitStats(12, 29000, 2000, 3000),
      }),
    ),
  );
  mageSpells.set(
    10159,
    makeSpellIdBreakout(
      "Cone of Cold",
      makeAbilityBreakout({
        total: 45000, count: 15, crits: 5, hits: 10,
        hitStats: makeHitStats(10, 25000, 2000, 3200),
        critStats: makeHitStats(5, 20000, 3500, 5000),
      }),
    ),
  );
  byAbilityBySpellId.set(PLAYER_MAGE, mageSpells);

  // Warlock: Shadow Bolt (direct) + Corruption (periodic with offset)
  const warlockSpells = new Map<number, SpellIdAbilityBreakout>();
  warlockSpells.set(
    25311,
    makeSpellIdBreakout(
      "Shadow Bolt",
      makeAbilityBreakout({
        total: 130000, count: 55, crits: 18, hits: 34, misses: 3,
        hitStats: makeHitStats(34, 74000, 1800, 2800),
        critStats: makeHitStats(18, 56000, 2700, 4200),
      }),
    ),
  );
  warlockSpells.set(
    25311 + PERIODIC_SPELL_ID_OFFSET,
    makeSpellIdBreakout(
      "Corruption",
      makeAbilityBreakout({
        total: 60000, count: 45, crits: 0, hits: 45,
        hitStats: makeHitStats(45, 60000, 1100, 1500),
      }),
    ),
  );
  warlockSpells.set(
    25309,
    makeSpellIdBreakout(
      "Immolate",
      makeAbilityBreakout({
        total: 40000, count: 30, crits: 8, hits: 22,
        hitStats: makeHitStats(22, 24000, 900, 1300),
        critStats: makeHitStats(8, 16000, 1600, 2400),
      }),
    ),
  );
  byAbilityBySpellId.set(PLAYER_WARLOCK, warlockSpells);

  // By target
  const byTarget = new Map<string, Map<string, number>>();
  for (const [unitId, data] of unitDamage) {
    byTarget.set(unitId, new Map(data.target));
  }

  return {
    EncounterDamage: encounterDamage,
    ByAbility: byAbility,
    ByAbilityBySpellId: byAbilityBySpellId,
    ByTarget: byTarget,
    EncounterVulnerabilityBonus: new Map(),
    EncounterVulnerabilityBase: new Map(),
    VulnerabilityByAbilityBonus: new Map(),
    VulnerabilityByAbilityBase: new Map(),
    VulnerabilityByAbilityBySpellIdBonus: new Map(),
    VulnerabilityByAbilityBySpellIdBase: new Map(),
    VulnerabilityByTargetBonus: new Map(),
    VulnerabilityByTargetBase: new Map(),
    GuidCache: createGuidCache(),
    AuraState: { activeByEncounter: new Map() },
    _damageEventsWithSunderArmor: 0,
  };
}

// ── Singleton fixture (created once, reused) ──

let _fixtureResult: DamageDoneResult | null = null;

/** Get the deterministic curated fixture DamageDoneResult. */
export function getFixtureResult(): DamageDoneResult {
  if (!_fixtureResult) {
    _fixtureResult = buildFixtureResult();
  }
  return _fixtureResult;
}

/** Fixture encounter ID. */
export { ENCOUNTER_ID as FIXTURE_ENCOUNTER_ID };

/** Fixture duration in ms (120 seconds — a typical boss fight). */
export const FIXTURE_DURATION_MS = 120_000;

/** Build a minimal Instance for the fixture context. */
export function getFixtureInstance(): Instance {
  return {
    id: "example-instance",
    name: "Example Raid",
    startTime: "2024-01-01T00:00:00Z",
    encounters: [
      {
        id: ENCOUNTER_ID,
        name: "Example Boss",
        boss: true,
        kill_type: "clean",
        start_time: "2024-01-01T00:00:00Z",
        end_time: "2024-01-01T00:02:00Z",
        enemies: [
          { id: ENEMY_BOSS, name: "Example Boss", boss: true, damageTaken: 700000, damageDone: 0, periods: [] },
          { id: ENEMY_ADD, name: "Boss Add", boss: false, damageTaken: 363000, damageDone: 0, periods: [] },
        ],
      },
    ],
    players: Object.fromEntries(
      ROSTER.map(([guid, name, className]) => [
        guid,
        { name, class: className.toUpperCase(), race: "Human", level: 60 },
      ]),
    ),
    units: {
      [ENEMY_BOSS]: { name: "Example Boss", owner: null, entry: 1 },
      [ENEMY_ADD]: { name: "Boss Add", owner: null, entry: 2 },
      [PET_WOLF]: { name: "Grizzletooth", owner: PLAYER_HUNTER, entry: 3 },
    },
    capabilities: [],
  } as unknown as Instance;
}

/** Build a PanelContext for the fixture data. */
export function getFixturePanelContext(): PanelContext {
  const instance = getFixtureInstance();
  const entitySelection: EntitySelection = {
    enemyIds: new Set(),
    playerIds: new Set(),
  };

  return {
    instance,
    selectedPhaseIds: [],
    selectedEncounterIds: [ENCOUNTER_ID],
    entitySelection,
  };
}

/** Build PanelRenderProps for the fixture data. */
export function getFixtureRenderProps(): PanelRenderProps<DamageDoneResult> {
  return {
    result: getFixtureResult(),
    totalEvents: 500,
    processingTimeMs: 0,
    durationMs: FIXTURE_DURATION_MS,
    perSecond: false,
    checkboxChecked: false,
    loading: false,
    processing: false,
    error: null,
    context: getFixturePanelContext(),
  };
}

/** Deterministic parse scores keyed by player GUID for the fixture. */
const FIXTURE_PARSE_SCORES: Record<string, number> = {
  [PLAYER_MAGE]: 100,
  [PLAYER_WARLOCK]: 99,
  [PLAYER_ROGUE]: 96,
  [PLAYER_WARRIOR]: 88,
  [PLAYER_HUNTER]: 81,
  [PLAYER_MAGE_2]: 66,
  [PLAYER_SHAMAN]: 58,
  [PLAYER_ROGUE_2]: 47,
  [PLAYER_DRUID]: 39,
  [PLAYER_WARRIOR_2]: 24,
  [PLAYER_PALADIN]: 15,
  [PLAYER_PRIEST]: 8,
};

/**
 * Build a Map<string, ParsePillData> for use as parsePillsOverride.
 * Renders deterministic pills without any API call; colors come from the
 * app's own parseHexColor scale.
 */
export function getFixtureParsePillsMap(): Map<string, ParsePillData> {
  const pills = new Map<string, ParsePillData>();
  for (const [guid, score] of Object.entries(FIXTURE_PARSE_SCORES)) {
    pills.set(guid, {
      displayScore: score,
      color: parseHexColor(score),
      tooltipContent: null,
    });
  }
  return pills;
}

/**
 * Deterministic spell data override for rank display without API calls.
 * Maps real spell IDs to minimal WoWSpell objects with subtext for rank labels.
 */
export function getFixtureSpellDataMap(): Map<number, WoWSpell> {
  const map = new Map<number, WoWSpell>();
  const makeSpell = (name: string, rank?: string): WoWSpell =>
    ({
      id: 0,
      name: { "0": name },
      subtext: rank ? { "0": rank } : undefined,
    }) as unknown as WoWSpell;

  map.set(25304, makeSpell("Frostbolt", "Rank 11"));
  map.set(837, makeSpell("Frostbolt", "Rank 4"));
  map.set(12557, makeSpell("Ice Lance"));
  map.set(10159, makeSpell("Cone of Cold", "Rank 5"));
  map.set(25311, makeSpell("Shadow Bolt", "Rank 10"));
  map.set(25309, makeSpell("Immolate", "Rank 8"));

  return map;
}
