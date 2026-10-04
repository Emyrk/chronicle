import type { CooldownSpellsData } from "@/api/cooldownSpells";
import type { CooldownUsageCaster, CooldownUsageResult } from "./cooldownUsage.processor";

export interface CooldownDef {
  key: string;
  name: string;
  /** Highest-rank spell id, used for the icon/tooltip. */
  spellId: number;
  cooldownMs: number;
}

interface ClassCooldowns {
  bySpellId: Map<number, { def: CooldownDef; cooldownMs: number }>;
}

export interface TimeWindow {
  id: string;
  name: string;
  start: number;
  end: number;
}

export interface CooldownSegment {
  start: number;
  end: number;
  kind: "cooldown" | "ready";
  /** For cooldown segments, the cast that started it. */
  castAt?: number;
}

export interface CooldownUsageRow {
  playerID: string;
  playerName: string;
  className: string;
  cooldown: CooldownDef;
  casts: number[];
  segments: CooldownSegment[];
  readyMs: number;
  windowMs: number;
}

/** "Druid" / "DeathKnight" / "DRUID" -> "DRUID" / "DEATHKNIGHT" */
export function normalizeClassName(className: string): string {
  return className.toUpperCase().replace(/[^A-Z]/g, "");
}

export function buildCooldownIndex(data: CooldownSpellsData): Map<string, ClassCooldowns> {
  const index = new Map<string, ClassCooldowns>();
  for (const [className, spells] of Object.entries(data)) {
    const defs = new Map<string, CooldownDef>();
    const bySpellId = new Map<number, { def: CooldownDef; cooldownMs: number }>();
    for (const spell of spells) {
      const key = spell.name.toLowerCase();
      let def = defs.get(key);
      if (!def) {
        def = { key, name: spell.name, spellId: spell.id, cooldownMs: spell.cooldown_ms };
        defs.set(key, def);
      } else {
        def.spellId = Math.max(def.spellId, spell.id);
        def.cooldownMs = Math.max(def.cooldownMs, spell.cooldown_ms);
      }
      bySpellId.set(spell.id, { def, cooldownMs: spell.cooldown_ms });
    }
    index.set(normalizeClassName(className), { bySpellId });
  }
  return index;
}

function mergeIntervals(intervals: { start: number; end: number; castAt: number }[]) {
  const sorted = intervals.slice().sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number; castAt: number }[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      // A cast while still on cooldown (reset effect) starts a fresh segment
      // so its cast time stays visible.
      if (interval.start > last.start) {
        last.end = interval.start;
        merged.push({ ...interval });
      } else {
        last.end = Math.max(last.end, interval.end);
      }
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/**
 * Splits each window into time spent on cooldown and time the cooldown was
 * ready but unused. Cooldowns started before a window carry into it.
 */
export function buildSegments(
  casts: { at: number; cooldownMs: number }[],
  windows: readonly TimeWindow[],
): { segments: CooldownSegment[]; readyMs: number } {
  const cooldowns = mergeIntervals(
    casts.map((cast) => ({ start: cast.at, end: cast.at + cast.cooldownMs, castAt: cast.at })),
  );
  const segments: CooldownSegment[] = [];
  let readyMs = 0;

  for (const window of windows) {
    let cursor = window.start;
    for (const cooldown of cooldowns) {
      if (cooldown.end <= window.start || cooldown.start >= window.end) continue;
      const start = Math.max(cooldown.start, window.start);
      const end = Math.min(cooldown.end, window.end);
      if (start > cursor) {
        segments.push({ start: cursor, end: start, kind: "ready" });
        readyMs += start - cursor;
      }
      segments.push({ start, end, kind: "cooldown", castAt: cooldown.castAt });
      cursor = end;
    }
    if (cursor < window.end) {
      segments.push({ start: cursor, end: window.end, kind: "ready" });
      readyMs += window.end - cursor;
    }
  }

  return { segments, readyMs };
}

/**
 * One row per (player, cooldown) for every cooldown at least one player of
 * that class cast, so classmates who never pressed it still show up.
 * Sorted by player so rows can be grouped per player.
 */
export function buildCooldownRows(
  result: CooldownUsageResult,
  index: Map<string, ClassCooldowns>,
  windows: readonly TimeWindow[],
  minCooldownMs: number,
): CooldownUsageRow[] {
  const windowMs = windows.reduce((total, window) => total + (window.end - window.start), 0);
  const playersByClass = new Map<string, CooldownUsageCaster[]>();
  const usedByClass = new Map<string, Map<string, CooldownDef>>();

  for (const caster of result.Casters.values()) {
    const className = normalizeClassName(caster.className);
    const classCooldowns = index.get(className);
    if (!classCooldowns) continue;

    const players = playersByClass.get(className) ?? [];
    players.push(caster);
    playersByClass.set(className, players);

    for (const spellId of caster.casts.keys()) {
      const match = classCooldowns.bySpellId.get(spellId);
      if (!match || match.def.cooldownMs < minCooldownMs) continue;
      const used = usedByClass.get(className) ?? new Map<string, CooldownDef>();
      used.set(match.def.key, match.def);
      usedByClass.set(className, used);
    }
  }

  const rows: CooldownUsageRow[] = [];
  for (const [className, used] of usedByClass) {
    const classCooldowns = index.get(className)!;
    const defs = [...used.values()].sort((a, b) => a.name.localeCompare(b.name));
    const players = playersByClass.get(className) ?? [];

    for (const def of defs) {
      for (const player of players) {
        const casts: { at: number; cooldownMs: number }[] = [];
        for (const [spellId, times] of player.casts) {
          const match = classCooldowns.bySpellId.get(spellId);
          if (match?.def !== def) continue;
          for (const at of times) casts.push({ at, cooldownMs: match.cooldownMs });
        }
        casts.sort((a, b) => a.at - b.at);
        const { segments, readyMs } = buildSegments(casts, windows);
        rows.push({
          playerID: player.playerID,
          playerName: player.playerName,
          className: player.className,
          cooldown: def,
          casts: casts.map((cast) => cast.at),
          segments,
          readyMs,
          windowMs,
        });
      }
    }
  }
  return rows.sort(
    (a, b) =>
      a.playerName.localeCompare(b.playerName)
      || a.playerID.localeCompare(b.playerID)
      || a.cooldown.name.localeCompare(b.cooldown.name),
  );
}
