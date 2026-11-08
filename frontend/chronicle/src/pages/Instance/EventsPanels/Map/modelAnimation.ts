import type { EncounterEffects, ReplayAttackKind, ReplayEffectEvent } from "./replayEffects";

export type ModelLocomotion = "Stand" | "Walk" | "Run";

export interface ModelAnimationState {
  /** Ordered clip-name fallbacks, best match first. */
  candidates: readonly string[];
  /** Replay timestamp used to seek this clip deterministically. */
  startedAtMs: number;
  /** Locomotion and idle clips loop; event clips stop on their last frame. */
  loop: boolean;
  /** Stable across frames until the underlying replay event/state changes. */
  key: string;
}

const ATTACK_WINDOW_MS = 900;
const WOUND_WINDOW_MS = 350;

export function cachedModelAsset<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = load();
  cache.set(key, pending);
  void pending.catch(() => {
    if (cache.get(key) === pending) cache.delete(key);
  });
  return pending;
}

export function movementAnimation(
  current: { x: number; y: number; timestampMs: number },
  previous: { x: number; y: number; timestampMs: number } | null | undefined,
): ModelLocomotion {
  if (!previous) return "Stand";
  const elapsedSeconds = (current.timestampMs - previous.timestampMs) / 1000;
  if (elapsedSeconds <= 0) return "Stand";
  const speed = Math.hypot(current.x - previous.x, current.y - previous.y) / elapsedSeconds;
  if (speed >= 6) return "Run";
  if (speed >= 0.75) return "Walk";
  return "Stand";
}

function attackCandidates(attack: ReplayAttackKind): readonly string[] {
  switch (attack) {
    case "ranged_auto":
      return ["AttackBow", "AttackRifle", "AttackThrown", "AttackUnarmed"];
    case "spell":
      return ["SpellCastDirected", "SpellCastOmni", "SpellCast", "SpecialUnarmed"];
    case "swing":
    case "melee_ability":
      return ["AttackUnarmed", "Attack1H", "Attack2H", "Attack2HL", "SpecialUnarmed", "Special1H", "Special2H"];
  }
}

function latestEvent(fx: EncounterEffects, guid: string, cursorMs: number): ReplayEffectEvent | null {
  const earliest = cursorMs - ATTACK_WINDOW_MS;
  for (let index = fx.events.length - 1; index >= 0; index--) {
    const event = fx.events[index];
    if (event.timestampMs > cursorMs) continue;
    if (event.timestampMs < earliest) break;
    if (event.source === guid && (event.kind === "damage" || event.kind === "cast_go" || event.kind === "cast_start")) return event;
  }
  return null;
}

function latestWound(fx: EncounterEffects, guid: string, cursorMs: number): ReplayEffectEvent | null {
  const earliest = cursorMs - WOUND_WINDOW_MS;
  for (let index = fx.events.length - 1; index >= 0; index--) {
    const event = fx.events[index];
    if (event.timestampMs > cursorMs) continue;
    if (event.timestampMs < earliest) break;
    if (event.kind === "damage" && event.target === guid && event.source !== guid) return event;
  }
  return null;
}

export function modelAnimationState(
  fx: EncounterEffects | null,
  guid: string,
  cursorMs: number,
  locomotion: ModelLocomotion,
  casting: boolean,
  deadSinceMs: number | null,
): ModelAnimationState {
  if (deadSinceMs !== null) {
    return { candidates: ["Death"], startedAtMs: deadSinceMs, loop: false, key: `death:${deadSinceMs}` };
  }
  if (casting) {
    return {
      candidates: ["SpellCastDirected", "SpellCastOmni", "SpellCast", "ChannelCastDirected", "ChannelCastOmni"],
      startedAtMs: 0,
      loop: true,
      key: "casting",
    };
  }
  const event = fx ? latestEvent(fx, guid, cursorMs) : null;
  if (event) {
    const candidates = event.kind === "damage"
      ? attackCandidates(event.attack)
      : ["SpellCastDirected", "SpellCastOmni", "SpellCast", "SpecialUnarmed"];
    return { candidates, startedAtMs: event.timestampMs, loop: false, key: `${event.kind}:${event.timestampMs}:${event.spellId ?? 0}` };
  }
  const wound = fx ? latestWound(fx, guid, cursorMs) : null;
  if (wound) {
    return {
      candidates: wound.crit ? ["CombatCritical", "CombatWound", "StandWound"] : ["CombatWound", "StandWound", "CombatCritical"],
      startedAtMs: wound.timestampMs,
      loop: false,
      key: `wound:${wound.timestampMs}:${wound.crit ? 1 : 0}`,
    };
  }
  return { candidates: [locomotion, "Stand"], startedAtMs: 0, loop: true, key: `locomotion:${locomotion}` };
}

export function usesStaticDeathFallback(
  deadSinceMs: number | null,
  clipName: string | null,
  packSettled: boolean,
): boolean {
  return deadSinceMs !== null && clipName === "Stand" && packSettled;
}

export function modelAnimationTimeSeconds(
  cursorMs: number,
  startedAtMs: number,
  durationSeconds: number,
  loop: boolean,
): number {
  if (!(durationSeconds > 0)) return 0;
  const elapsedSeconds = Math.max(0, (cursorMs - startedAtMs) / 1000);
  return loop ? elapsedSeconds % durationSeconds : Math.min(elapsedSeconds, durationSeconds);
}

export function selectModelAnimation(available: ReadonlyMap<string, unknown>, candidates: readonly string[]): string | null {
  for (const candidate of candidates) if (available.has(candidate)) return candidate;
  return available.has("Stand") ? "Stand" : null;
}
