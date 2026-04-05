import type { ProcessorContext, ProcessorEvent } from "../processorTypes";
import { createGuidCache, getCachedGuid } from "./guidCache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PanelFilterType =
  | "players"
  | "enemies"
  | "ability_name"
  | "ability_id"
  | "ability_school"
  | "ability_hittype"
  | "source_type"
  | "target_type"
  | "time_range"
  | "event_value"
  | "event_type";

export interface PanelFilter {
  type: PanelFilterType;
  value: string | string[];
  /** Negate this filter's result (e.g. "NOT ability = Fireball"). */
  negate?: boolean;
  /** Logical connector to the PREVIOUS filter. First filter's combinator is ignored. */
  combinator?: "and" | "or";
  /** Event types this filter applies to. Events of other types pass through unfiltered. Undefined = all events. */
  applyTo?: string[];
}

export interface PanelFiltersContextValue {
  filters?: PanelFilter[];
}

// ---------------------------------------------------------------------------
// Helpers (shared by compilers)
// ---------------------------------------------------------------------------

export type FilterPredicate = (event: ProcessorEvent) => boolean;

function toValues(value: string | string[]): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getEventAbilityName(event: ProcessorEvent): string | null {
  if ("spellName" in event && typeof event.spellName === "string") return event.spellName;
  if ("sourceName" in event && typeof event.sourceName === "string") return event.sourceName;
  if ("spell" in event && event.spell && typeof event.spell.name === "string") return event.spell.name;
  return null;
}

function getEventAbilityId(event: ProcessorEvent): number | null {
  if ("spellId" in event && typeof event.spellId === "number") return event.spellId;
  if ("spell" in event && event.spell && typeof event.spell.id === "number") return event.spell.id;
  return null;
}

function getEventSchool(event: ProcessorEvent): number | null {
  if ("school" in event && typeof event.school === "number") return event.school;
  return null;
}

function normalizeDamageSchoolToBitmask(school: number): number {
  switch (school) {
    case 0:
    case 1:
      return 0;
    case 2:
      return 0x01;
    case 3:
      return 0x02;
    case 4:
      return 0x04;
    case 5:
      return 0x08;
    case 6:
      return 0x10;
    case 7:
      return 0x20;
    case 8:
      return 0x40;
    default:
      return school;
  }
}

const SCHOOL_MASK_MAP: Record<string, number> = {
  physical: 1,
  holy: 2,
  fire: 4,
  nature: 8,
  frost: 16,
  shadow: 32,
  arcane: 64,
};

const HITTYPE_MASK_MAP: Record<string, number> = {
  offhand: 0x00000001,
  hit: 0x00000002,
  crit: 0x00000004,
  partial_resist: 0x00000008,
  full_resist: 0x00000010,
  miss: 0x00000020,
  partial_absorb: 0x00000040,
  full_absorb: 0x00000080,
  glancing: 0x00000100,
  crushing: 0x00000200,
  evade: 0x00000400,
  dodge: 0x00000800,
  parry: 0x00001000,
  immune: 0x00002000,
  deflect: 0x00008000,
  interrupt: 0x00010000,
  partial_block: 0x00020000,
  full_block: 0x00040000,
  split: 0x00080000,
  reflect: 0x00100000,
  periodic: 0x00200000,
};

function getEventHitType(event: ProcessorEvent): number | null {
  if ("hitType" in event && typeof event.hitType === "number")
    return event.hitType;
  return null;
}

function getEventGuids(event: ProcessorEvent): [string | null, string | null] {
  const caster = "caster" in event && typeof event.caster === "string" && event.caster ? event.caster : null;
  const target = "target" in event && typeof event.target === "string" && event.target ? event.target : null;
  return [caster, target];
}

function isPlayerGuid(guid: string): boolean {
  return guid.startsWith("0x0000");
}

// ---------------------------------------------------------------------------
// Filter compilers — each type produces a FilterPredicate from value+context.
// Heavy work (Set creation, string normalization) happens ONCE at compile time.
// ---------------------------------------------------------------------------

type FilterCompiler = (value: string | string[], context: ProcessorContext) => FilterPredicate;

function compileEntityFilter(
  value: string | string[],
  entitySet: Set<string>,
): FilterPredicate {
  const rawValues = toValues(value);
  const values = rawValues.length === 0 ? ["selected"] : rawValues;

  // Pre-resolve: if all values are explicit GUIDs, build a Set once
  const useSelected = values.includes("selected");
  const explicitGuids = new Set(values.filter((v) => v !== "selected"));

  return (event) => {
    const [caster, target] = getEventGuids(event);
    if (useSelected && entitySet.size > 0) {
      if ((caster && entitySet.has(caster)) || (target && entitySet.has(target))) return true;
    } else if (useSelected && entitySet.size === 0) {
      return true; // "selected" with nothing selected = pass all
    }
    if (explicitGuids.size > 0) {
      if ((caster && explicitGuids.has(caster)) || (target && explicitGuids.has(target))) return true;
    }
    return false;
  };
}

/** Known toggle option keys for source_type / target_type filters */
const ENTITY_TYPE_OPTION_KEYS = new Set([
  "selected_players", "selected_enemies", "custom",
  "player", "pet", "enemy_pet", "enemy", "object", "none",
]);

/**
 * Shared compiler for source_type and target_type filters.
 * Classifies a GUID from the given event field as player / pet / enemy_pet / enemy
 * using context.units for owner-based pet detection.
 * Also supports "selected_players", "selected_enemies" (entity selection) and
 * "custom" entries (name or GUID match).
 */
function compileEntityTypeFilter(
  value: string | string[],
  context: ProcessorContext,
  field: "caster" | "target",
): FilterPredicate {
  const rawValues = new Set(toValues(value));
  if (rawValues.size === 0) return () => true;

  // Entity type classification flags
  const wantPlayer = rawValues.has("player");
  const wantPet = rawValues.has("pet");           // friendly pet (player-owned)
  const wantEnemyPet = rawValues.has("enemy_pet"); // enemy pet (non-player-owned)
  const wantEnemy = rawValues.has("enemy");
  const wantObject = rawValues.has("object");
  const wantNone = rawValues.has("none");

  // Entity selection flags
  const wantSelectedPlayers = rawValues.has("selected_players");
  const wantSelectedEnemies = rawValues.has("selected_enemies");
  const playerIds = context.entitySelection.playerIds;
  const enemyIds = context.entitySelection.enemyIds;

  // Custom name/GUID entries (anything not a known option key)
  const customEntries = [...rawValues].filter((v) => !ENTITY_TYPE_OPTION_KEYS.has(v));
  const customGuids = new Set(customEntries.filter((v) => v.startsWith("0x")));
  const customNames = customEntries.filter((v) => !v.startsWith("0x")).map((n) => n.toLowerCase());

  const guidCache = createGuidCache();
  const units = context.units ?? {};
  const players = context.players ?? {};

  // Build a name lookup: GUID → lowercase name
  const getGuidName = (guid: string): string | null => {
    const player = players[guid];
    if (player) return player.name.toLowerCase();
    const unit = units[guid];
    if (unit) return unit.name.toLowerCase();
    return null;
  };

  return (event) => {
    if (!(field in event)) return false;
    const guid = (event as unknown as Record<string, unknown>)[field];
    if (typeof guid !== "string" || !guid) return wantNone;

    // Selected players: match if guid is in playerIds (or a pet owned by one), or any player/player-pet if none selected
    if (wantSelectedPlayers) {
      if (playerIds.size > 0) {
        if (playerIds.has(guid)) return true;
        // Also match pets owned by selected players
        const unit = units[guid];
        if (unit?.owner && playerIds.has(unit.owner)) return true;
      } else {
        const isPlayer = isPlayerGuid(guid) || getCachedGuid(guidCache, guid).isPlayer();
        if (isPlayer) return true;
        // Also match any player-owned pet when no specific players selected
        const unit = units[guid];
        if (unit?.owner) {
          const ownerIsPlayer = isPlayerGuid(unit.owner) || getCachedGuid(guidCache, unit.owner).isPlayer();
          if (ownerIsPlayer) return true;
        }
      }
    }

    // Selected enemies: match if guid is in enemyIds, or any non-player entity if none selected
    if (wantSelectedEnemies) {
      if (enemyIds.size > 0) {
        if (enemyIds.has(guid)) return true;
      } else {
        const isPlayer = isPlayerGuid(guid) || getCachedGuid(guidCache, guid).isPlayer();
        if (!isPlayer) return true;
      }
    }

    // Custom GUID match
    if (customGuids.size > 0 && customGuids.has(guid)) return true;

    // Custom name match (case-insensitive)
    if (customNames.length > 0) {
      const name = getGuidName(guid);
      if (name && customNames.some((n) => name.includes(n))) return true;
    }

    // Entity type classification
    const guidIsPlayer = isPlayerGuid(guid) || getCachedGuid(guidCache, guid).isPlayer();
    if (wantPlayer && guidIsPlayer) return true;

    if (!guidIsPlayer) {
      const unit = units[guid];
      const hasOwner = unit?.owner != null;
      const ownerIsPlayer = hasOwner && (
        isPlayerGuid(unit.owner!) || getCachedGuid(guidCache, unit.owner!).isPlayer()
      );

      if (wantPet && hasOwner && ownerIsPlayer) return true;
      if (wantEnemyPet && hasOwner && !ownerIsPlayer) return true;
      if (wantEnemy && !hasOwner) return true;
    }
    if (wantObject && getCachedGuid(guidCache, guid).isObject()) return true;
    return false;
  };
}

const FILTER_COMPILERS: Record<PanelFilterType, FilterCompiler> = {
  players: (value, context) =>
    compileEntityFilter(value, context.entitySelection.playerIds),

  enemies: (value, context) =>
    compileEntityFilter(value, context.entitySelection.enemyIds),

  ability_name: (value) => {
    const names = toValues(value).map((n) => n.toLowerCase());
    if (names.length === 0) return () => true;
    if (names.length === 1) {
      const single = names[0];
      return (event) => {
        const name = (getEventAbilityName(event) ?? "").toLowerCase();
        return name.includes(single);
      };
    }
    return (event) => {
      const name = (getEventAbilityName(event) ?? "").toLowerCase();
      return names.some((n) => name.includes(n));
    };
  },

  ability_id: (value) => {
    const ids = toValues(value).map(Number).filter(Number.isFinite);
    if (ids.length === 0) return () => true;
    if (ids.length === 1) {
      const single = ids[0];
      return (event) => {
        const spellId = getEventAbilityId(event);
        return spellId !== null && spellId === single;
      };
    }
    const set = new Set(ids);
    return (event) => {
      const spellId = getEventAbilityId(event);
      return spellId !== null && set.has(spellId);
    };
  },

  ability_school: (value) => {
    const rawValues = toValues(value);
    const mask = rawValues.reduce((m, v) => {
      const normalized = v.toLowerCase();
      if (SCHOOL_MASK_MAP[normalized] !== undefined) return m | SCHOOL_MASK_MAP[normalized];
      const parsed = Number.parseInt(v, 10);
      return Number.isFinite(parsed) ? m | parsed : m;
    }, 0);
    if (mask === 0) return () => false;
    return (event) => {
      const school = getEventSchool(event);
      if (school === null) return false;
      return (normalizeDamageSchoolToBitmask(school) & mask) !== 0;
    };
  },

  ability_hittype: (value) => {
    const rawValues = toValues(value);
    const mask = rawValues.reduce((m, v) => {
      const normalized = v.toLowerCase();
      if (HITTYPE_MASK_MAP[normalized] !== undefined) return m | HITTYPE_MASK_MAP[normalized];
      const parsed = Number.parseInt(v, 10);
      return Number.isFinite(parsed) ? m | parsed : m;
    }, 0);
    if (mask === 0) return () => false;
    return (event) => {
      const hitType = getEventHitType(event);
      if (hitType === null) return false;
      return (hitType & mask) !== 0;
    };
  },

  source_type: (value, context) =>
    compileEntityTypeFilter(value, context, "caster"),

  target_type: (value, context) =>
    compileEntityTypeFilter(value, context, "target"),

  time_range: (value) => {
    const raw = typeof value === "string" ? value : (value[0] ?? "");
    const [startStr, endStr] = raw.split(",");
    const startMs = startStr ? Number(startStr) : null;
    const endMs = endStr ? Number(endStr) : null;
    if ((startMs == null || Number.isNaN(startMs)) && (endMs == null || Number.isNaN(endMs)))
      return () => true;
    const hasStart = startMs != null && Number.isFinite(startMs);
    const hasEnd = endMs != null && Number.isFinite(endMs);
    // Use globalOffsetMilli (set by worker) so time ranges work across multiple encounters.
    // Falls back to offsetMilli for contexts where globalOffsetMilli hasn't been stamped.
    if (hasStart && hasEnd)
      return (event) => { const t = event.globalOffsetMilli ?? event.offsetMilli; return t >= startMs && t <= endMs; };
    if (hasStart)
      return (event) => (event.globalOffsetMilli ?? event.offsetMilli) >= startMs;
    return (event) => (event.globalOffsetMilli ?? event.offsetMilli) <= endMs!;
  },

  event_type: (value) => {
    const types = toValues(value);
    if (types.length === 0) return () => true;
    if (types.length === 1) {
      const single = types[0];
      return (event) => event.type === single;
    }
    const typeSet = new Set(types);
    return (event) => typeSet.has(event.type);
  },

  event_value: (value) => {
    const raw = typeof value === "string" ? value : (value[0] ?? "");
    const match = raw.match(/^([><=!]+):(.+)$/);
    if (!match) return () => true;
    const op = match[1];
    const num = Number(match[2]);
    if (!Number.isFinite(num)) return () => true;

    const cmp: (a: number) => boolean =
      op === ">"  ? (a) => a > num :
      op === ">=" ? (a) => a >= num :
      op === "<"  ? (a) => a < num :
      op === "<=" ? (a) => a <= num :
      op === "="  ? (a) => a === num :
      op === "!=" ? (a) => a !== num :
      () => true;

    return (event) => {
      const amount = "amount" in event && typeof event.amount === "number" ? event.amount : null;
      return amount !== null && cmp(amount);
    };
  },
};

// ---------------------------------------------------------------------------
// compileFilters — call ONCE before the event loop.
// Groups filters by combinator, compiles each, returns a single predicate.
// ---------------------------------------------------------------------------

function compileSingleFilter(filter: PanelFilter, context: ProcessorContext): FilterPredicate {
  let pred = FILTER_COMPILERS[filter.type](filter.value, context);

  // Apply negate BEFORE applyTo so that the applyTo pass-through is never inverted.
  // Without this ordering, a negated filter with applyTo would reject events outside
  // its applyTo set (e.g. aura events would be dropped by a damage-only negated filter).
  if (filter.negate) {
    const inner = pred;
    pred = (event) => !inner(event);
  }

  // Scope to specific event types — events outside applyTo pass through.
  // "*" means all events (no wrapping needed). Single-item uses === for speed.
  if (filter.applyTo && filter.applyTo.length > 0 && !(filter.applyTo.length === 1 && filter.applyTo[0] === "*")) {
    const inner = pred;
    if (filter.applyTo.length === 1) {
      const single = filter.applyTo[0];
      pred = (event) => event.type !== single ? true : inner(event);
    } else {
      const applyToSet = new Set(filter.applyTo);
      pred = (event) => !applyToSet.has(event.type) ? true : inner(event);
    }
  }

  return pred;
}

/** True when a filter's value is effectively empty (no user input). */
function isEmptyFilterValue(value: string | string[]): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value.trim() === "";
}

export function compileFilters(filters: PanelFilter[], context: ProcessorContext): FilterPredicate {
  // Strip filters with empty values — they compile to pass-all and just add overhead.
  const effective = filters.filter((f) => !isEmptyFilterValue(f.value));
  if (effective.length === 0) return () => true;

  // Compile each filter into a predicate
  const compiled = effective.map((f) => compileSingleFilter(f, context));

  // Group by combinator: "or" continues current group, "and"/undefined starts new
  const groups: FilterPredicate[][] = [];
  let current: FilterPredicate[] = [compiled[0]];
  for (let i = 1; i < effective.length; i++) {
    if (effective[i].combinator === "or") {
      current.push(compiled[i]);
    } else {
      groups.push(current);
      current = [compiled[i]];
    }
  }
  groups.push(current);

  // Tight closure: OR within group, AND across groups
  if (groups.length === 1 && groups[0].length === 1) {
    // Single filter fast-path
    return groups[0][0];
  }
  return (event) => {
    for (const group of groups) {
      if (!group.some((pred) => pred(event))) return false;
    }
    return true;
  };
}

/** Convenience wrapper — compiles then evaluates. Use compileFilters() in hot loops. */
export function evaluateFilters(filters: PanelFilter[], event: ProcessorEvent, context: ProcessorContext): boolean {
  return compileFilters(filters, context)(event);
}
