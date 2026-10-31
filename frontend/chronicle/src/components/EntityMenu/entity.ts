/**
 * Things a person can Alt+click anywhere on the site. Any element that shows one carries
 * `data-entity` (see `entityAttributes`), and the entity menu reads it back.
 */
export type EntityRef =
  | { kind: "character"; realm: string; guid: string; name: string; className?: string }
  | { kind: "guild"; id: string; name: string }
  /**
   * A boss. With a pull (from a log or a kill on the leaderboard) `id` is the log's encounter id and
   * the pull's log and time come along, so the tray can show it on any page and compare the same
   * boss across nights. Without one (a boss name on a leaderboard) `id` is `bossEncounterId(...)`.
   */
  | {
      kind: "encounter";
      id: string;
      name: string;
      instanceName: string;
      difficultyName?: string;
      maxPlayers?: number;
      /** The log (instance) the pull is in; absent for a boss without a pull. */
      logId?: string;
      killType?: "clean" | "partial" | "reset" | "wipe";
      /** The ranked length of the pull. */
      durationMs?: number;
      startTime?: string;
    };

export type EntityKind = EntityRef["kind"];

export const ENTITY_ATTRIBUTE = "data-entity";

/** Spread onto the element that shows the entity. */
export function entityAttributes(entity: EntityRef): { "data-entity": string; "data-entity-kind": EntityKind } {
  // The kind is repeated on its own so CSS can color the Alt outline per kind.
  return { [ENTITY_ATTRIBUTE]: JSON.stringify(entity), "data-entity-kind": entity.kind } as {
    "data-entity": string;
    "data-entity-kind": EntityKind;
  };
}

export function parseEntity(value: string | null | undefined): EntityRef | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<EntityRef> | null;
    if (parsed?.kind === "character" && parsed.realm && parsed.guid && parsed.name) return parsed as EntityRef;
    if (parsed?.kind === "guild" && parsed.id && parsed.name) return parsed as EntityRef;
    if (parsed?.kind === "encounter" && parsed.id && parsed.name && parsed.instanceName) return parsed as EntityRef;
  } catch {
    // Not ours.
  }
  return null;
}

/** The nearest entity at or above an element, with the element that carries it. */
export function closestEntity(target: EventTarget | null): { entity: EntityRef; element: Element } | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest(`[${ENTITY_ATTRIBUTE}]`);
  const entity = parseEntity(element?.getAttribute(ENTITY_ATTRIBUTE));
  return element && entity ? { entity, element } : null;
}

export function entityKey(entity: EntityRef): string {
  return entity.kind === "character" ? `character:${entity.realm}:${entity.guid}` : `${entity.kind}:${entity.id}`;
}

/** The id of a boss on its own, not a pull, e.g. a boss name on a leaderboard. */
export function bossEncounterId(instanceName: string, encounterName: string): string {
  return `boss:${instanceName}:${encounterName}`;
}

/** A boss name as an encounter to compare, without a particular pull. */
export function bossEntity(instanceName: string, encounterName: string): EntityRef {
  return { kind: "encounter", id: bossEncounterId(instanceName, encounterName), name: encounterName, instanceName };
}

/** A log's Overview view, which compares its kill times against the server. */
export function instanceOverviewUrl(logId: string): string {
  return `/instances/${encodeURIComponent(logId)}?view=overview`;
}

export function armoryUrl(entity: Extract<EntityRef, { kind: "character" }>): string {
  return `/armory/${encodeURIComponent(entity.realm)}/${encodeURIComponent(entity.guid)}`;
}

export function performanceHistoryUrl(entity: Extract<EntityRef, { kind: "character" }>): string {
  const params = new URLSearchParams({ player: entity.guid, player_realm: entity.realm });
  return `/performance-history?${params}`;
}

export function guildPageUrl(entity: Extract<EntityRef, { kind: "guild" }>): string {
  return `/g/${encodeURIComponent(entity.id)}`;
}

export function guildHistoryUrl(entity: Extract<EntityRef, { kind: "guild" }>): string {
  return `/guild-history?${new URLSearchParams({ guild: entity.id })}`;
}

/** The fastest kills of a boss across the server, on the leaderboards. */
export function killTimeLeaderboardUrl(entity: Extract<EntityRef, { kind: "encounter" }>): string {
  const params = new URLSearchParams({ instance: entity.instanceName, metric: "killtime", tab: "leaderboard", kt_enc: entity.name });
  return `/leaderboards/statistics?${params}`;
}

/** Several characters side by side on the performance history page; `hidden` ones stay selected but hidden. */
export function performanceCompareUrl(
  characters: Extract<EntityRef, { kind: "character" }>[],
  hidden: ReadonlySet<string> = new Set(),
): string {
  const params = new URLSearchParams();
  for (const character of characters) {
    params.append("player", character.guid);
    params.append("player_realm", character.realm);
  }
  for (const character of characters) {
    if (hidden.has(entityKey(character))) params.append("hidden", character.guid);
  }
  return `/performance-history?${params}`;
}

/** Several guilds side by side on the clear-time history page; `hidden` ones stay selected but hidden. */
export function guildCompareUrl(guilds: Extract<EntityRef, { kind: "guild" }>[], hidden: ReadonlySet<string> = new Set()): string {
  const params = new URLSearchParams();
  for (const guild of guilds) params.append("guild", guild.id);
  for (const guild of guilds) {
    if (hidden.has(entityKey(guild))) params.append("hide", guild.id);
  }
  return `/guild-history?${params}`;
}
