import type { ProcessorContext, ProcessorEvent } from "../processorTypes";

export type PanelFilterType =
  | "players"
  | "enemies"
  | "ability_name"
  | "ability_id"
  | "ability_school"
  | "source_type"
  | "event_type";

export interface PanelFilter {
  type: PanelFilterType;
  mode: "include" | "exclude";
  value: string | string[];
}

export interface PanelFiltersContextValue {
  filters?: PanelFilter[];
}

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

function getEventGuids(event: ProcessorEvent): string[] {
  const ids: string[] = [];
  if ("caster" in event && typeof event.caster === "string" && event.caster) ids.push(event.caster);
  if ("target" in event && typeof event.target === "string" && event.target) ids.push(event.target);
  return ids;
}

function isPlayerGuid(guid: string): boolean {
  return guid.startsWith("0x0000");
}

function isPetGuid(guid: string): boolean {
  return guid.length >= 5 && guid[4] === "4";
}

function matchesFilter(filter: PanelFilter, event: ProcessorEvent, context: ProcessorContext): boolean {
  const rawValues = toValues(filter.value).map((v) => String(v).trim()).filter(Boolean);

  switch (filter.type) {
    case "players": {
      const values = rawValues.length === 0 ? ["selected"] : rawValues;
      const guids = getEventGuids(event);
      return values.some((value) => {
        if (value === "selected") {
          return context.entitySelection.playerIds.size === 0
            ? true
            : guids.some((guid) => context.entitySelection.playerIds.has(guid));
        }
        return guids.includes(value);
      });
    }
    case "enemies": {
      const values = rawValues.length === 0 ? ["selected"] : rawValues;
      const guids = getEventGuids(event);
      return values.some((value) => {
        if (value === "selected") {
          return context.entitySelection.enemyIds.size === 0
            ? true
            : guids.some((guid) => context.entitySelection.enemyIds.has(guid));
        }
        return guids.includes(value);
      });
    }
    case "ability_name": {
      const abilityName = (getEventAbilityName(event) ?? "").toLowerCase();
      return rawValues.some((value) => abilityName.includes(value.toLowerCase()));
    }
    case "ability_id": {
      const spellId = getEventAbilityId(event);
      if (spellId === null) return false;
      return rawValues.some((value) => Number(value) === spellId);
    }
    case "ability_school": {
      const school = getEventSchool(event);
      if (school === null) return false;
      const schoolMaskMap: Record<string, number> = {
        physical: 1,
        holy: 2,
        fire: 4,
        nature: 8,
        frost: 16,
        shadow: 32,
        arcane: 64,
      };
      const selectedMask = rawValues.reduce((mask, value) => {
        const normalized = value.toLowerCase();
        if (schoolMaskMap[normalized] !== undefined) {
          return mask | schoolMaskMap[normalized];
        }
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? (mask | parsed) : mask;
      }, 0);
      if (selectedMask === 0) return false;
      return (school & selectedMask) !== 0;
    }
    case "source_type": {
      if (!("caster" in event) || typeof event.caster !== "string" || !event.caster) return false;
      const caster = event.caster;
      return rawValues.some((value) => {
        if (value === "player") return isPlayerGuid(caster);
        if (value === "pet") return isPetGuid(caster);
        if (value === "enemy") return !isPlayerGuid(caster) && !isPetGuid(caster);
        return false;
      });
    }
    case "event_type":
      return rawValues.some((value) => value === event.type);
    default:
      return false;
  }
}

export function evaluateFilters(filters: PanelFilter[], event: ProcessorEvent, context: ProcessorContext): boolean {
  if (filters.length === 0) return true;

  const includeFilters = filters.filter((f) => f.mode === "include");
  const excludeFilters = filters.filter((f) => f.mode === "exclude");

  for (const filter of excludeFilters) {
    if (matchesFilter(filter, event, context)) return false;
  }

  if (includeFilters.length === 0) return true;

  const includeByType = new Map<PanelFilterType, PanelFilter[]>();
  for (const filter of includeFilters) {
    const group = includeByType.get(filter.type) ?? [];
    group.push(filter);
    includeByType.set(filter.type, group);
  }

  for (const [, group] of includeByType) {
    if (!group.some((filter) => matchesFilter(filter, event, context))) {
      return false;
    }
  }

  return true;
}
