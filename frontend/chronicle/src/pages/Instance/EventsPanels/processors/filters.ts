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
  | "source_type"
  | "target_type"
  | "event_type";

export interface PanelFilter {
  type: PanelFilterType;
  value: string | string[];
  /** Negate this filter's result (e.g. "NOT ability = Fireball"). */
  negate?: boolean;
  /** Logical connector to the PREVIOUS filter. First filter's combinator is ignored. */
  combinator?: "and" | "or";
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

/**
 * Shared compiler for source_type and target_type filters.
 * Classifies a GUID from the given event field as player / pet / enemy_pet / enemy
 * using context.units for owner-based pet detection.
 */
function compileEntityTypeFilter(
  value: string | string[],
  context: ProcessorContext,
  field: "caster" | "target",
): FilterPredicate {
  const rawValues = new Set(toValues(value));
  if (rawValues.size === 0) return () => true;
  const wantPlayer = rawValues.has("player");
  const wantPet = rawValues.has("pet");           // friendly pet (player-owned)
  const wantEnemyPet = rawValues.has("enemy_pet"); // enemy pet (non-player-owned)
  const wantEnemy = rawValues.has("enemy");

  const guidCache = createGuidCache();
  const units = context.units ?? {};

  return (event) => {
    if (!(field in event)) return false;
    const guid = (event as Record<string, unknown>)[field];
    if (typeof guid !== "string" || !guid) return false;

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
    return (event) => {
      const name = (getEventAbilityName(event) ?? "").toLowerCase();
      return names.some((n) => name.includes(n));
    };
  },

  ability_id: (value) => {
    const ids = new Set(toValues(value).map(Number).filter(Number.isFinite));
    if (ids.size === 0) return () => true;
    return (event) => {
      const spellId = getEventAbilityId(event);
      return spellId !== null && ids.has(spellId);
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

  source_type: (value, context) =>
    compileEntityTypeFilter(value, context, "caster"),

  target_type: (value, context) =>
    compileEntityTypeFilter(value, context, "target"),

  event_type: (value) => {
    const types = new Set(toValues(value));
    if (types.size === 0) return () => true;
    return (event) => types.has(event.type);
  },
};

// ---------------------------------------------------------------------------
// compileFilters — call ONCE before the event loop.
// Groups filters by combinator, compiles each, returns a single predicate.
// ---------------------------------------------------------------------------

function compileSingleFilter(filter: PanelFilter, context: ProcessorContext): FilterPredicate {
  const pred = FILTER_COMPILERS[filter.type](filter.value, context);
  return filter.negate ? (event) => !pred(event) : pred;
}

export function compileFilters(filters: PanelFilter[], context: ProcessorContext): FilterPredicate {
  if (filters.length === 0) return () => true;

  // Compile each filter into a predicate
  const compiled = filters.map((f) => compileSingleFilter(f, context));

  // Group by combinator: "or" continues current group, "and"/undefined starts new
  const groups: FilterPredicate[][] = [];
  let current: FilterPredicate[] = [compiled[0]];
  for (let i = 1; i < filters.length; i++) {
    if (filters[i].combinator === "or") {
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
