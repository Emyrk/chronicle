import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQueryClient } from "@tanstack/react-query";
import type { WoWSpell } from "@/api/wowdb";
import { BOSS_MINI_SLUGS } from "./bossMinis";
import type { MapPositionSample } from "./map.processor";
import type { MapHealthSample } from "./map.processor";
import { clampViewport, fitViewportToBounds, FULL_MAP_VIEWPORT, latestPositionAt, selectHealthBars, unitFocusBounds, type MapPoint } from "./mapModel";
import MapView3D from "./MapView3D";
import type { MapViewRequest } from "./MapView2D";
import { addEffectEvent, createEncounterEffects, isDeadAt, type EncounterEffects, type ReplayEffectEvent } from "./replayEffects";
import type { MapMarkerKind, MapSceneGround, MapSceneMarker } from "./useMapScene";

const CLASSES = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"];
const DURATION_MS = 60_000;
const SAMPLE_INTERVAL_MS = 400;

// Synthetic world: x/y in [0, 100], projected straight onto the artwork.
const ground: MapSceneGround = {
  iconBaseUrl: "",
  canvas: { floor: 1, width: 1002, height: 668, tileWidth: 256, tileHeight: 256, tiles: [] },
};

function projectSample(sample: MapPositionSample): MapPoint {
  return { leftPercent: 100 - sample.y, topPercent: 100 - sample.x };
}

interface SyntheticUnit {
  guid: string;
  name: string;
  kind: MapMarkerKind;
  color: string;
  entry?: number;
  positions: MapPositionSample[];
}

function circlingPositions(index: number, total: number, radius: number, speed: number): MapPositionSample[] {
  const positions: MapPositionSample[] = [];
  const phase = (index / total) * Math.PI * 2;
  for (let t = 0; t <= DURATION_MS; t += SAMPLE_INTERVAL_MS + (index % 5) * 37) {
    const angle = phase + (t / DURATION_MS) * Math.PI * 2 * speed;
    positions.push({
      timestampMs: t,
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      mapId: 1,
      // Counter-clockwise motion in world x/y faces along the tangent.
      facing: angle + Math.PI / 2,
    });
  }
  return positions;
}

function syntheticUnits(players: number): SyntheticUnit[] {
  const units: SyntheticUnit[] = Array.from({ length: players }, (_, index) => ({
    guid: `Player-${index}`,
    name: `Player ${index + 1}`,
    kind: "player",
    color: `var(--color-class-${CLASSES[index % CLASSES.length]})`,
    positions: circlingPositions(index, players, 18 + (index % 4) * 4, 1),
  }));
  units.push(
    { guid: "Boss", name: "Synthetic Boss", kind: "hostile", color: "#fb7185", positions: circlingPositions(0, 1, 3, 0.5) },
    { guid: "Pet-1", name: "Wolf", kind: "pet", color: "#67e8f9", positions: circlingPositions(3, players, 12, 1) },
  );
  return units;
}

// School per class (chronicleproto School): melee classes swing (and
// sometimes Heroic Strike), hunters Auto Shot, the rest cast.
const CLASS_SCHOOL: Record<string, number> = { hunter: 2, mage: 6, warlock: 7, shaman: 5, priest: 3, paladin: 3, druid: 8 };
const HEALERS = new Set(["priest", "paladin", "druid", "shaman"]);
const MELEE = new Set(["warrior", "rogue"]);
const RANGED = new Set(["hunter"]);
// A representative spell per school for names and hover tooltips.
const SCHOOL_SPELL: Record<number, { spellId: number; spellName: string }> = {
  3: { spellId: 585, spellName: "Smite" },
  5: { spellId: 403, spellName: "Lightning Bolt" },
  6: { spellId: 116, spellName: "Frostbolt" },
  7: { spellId: 686, spellName: "Shadow Bolt" },
  8: { spellId: 2912, spellName: "Starfire" },
};
const HEAL_SPELL = { spellId: 2054, spellName: "Heal" };
const BOSS_GUIDS = new Set(["Boss"]);

// Deterministic combat: melee swings, spell hits with cast bars, heals,
// periodic ticks, boss AoE pulses, interrupts, and a few deaths that are
// resurrected later.
function syntheticEffects(players: number): EncounterEffects {
  const events: ReplayEffectEvent[] = [];
  const base = { amount: 1000, crit: false, periodic: false, attack: "spell" as const, aoe: false, castTimeMs: 0, spellId: 1, spellName: "" };
  for (let index = 0; index < players; index++) {
    const guid = `Player-${index}`;
    const cls = CLASSES[index % CLASSES.length];
    const school = CLASS_SCHOOL[cls] ?? 2;
    const period = MELEE.has(cls) ? 1_500 + (index % 3) * 200 : 2_500 + (index % 4) * 300;
    for (let t = 500 + index * 97; t < DURATION_MS; t += period) {
      const crit = (t / period) % 5 < 1;
      if (MELEE.has(cls)) {
        const ability = (t / period) % 4 < 1;
        events.push({ ...base, timestampMs: t, kind: "damage", source: guid, target: "Boss", school: 2, attack: ability ? "melee_ability" : "swing", crit, ...(ability ? { spellId: 78, spellName: "Heroic Strike" } : { spellId: 6603, spellName: "Auto Attack" }) });
      } else if (RANGED.has(cls)) {
        events.push({ ...base, timestampMs: t, kind: "damage", source: guid, target: "Boss", school: 2, attack: "ranged_auto", crit, spellId: 75, spellName: "Auto Shot" });
      } else if (HEALERS.has(cls) && index % 2 === 0) {
        const target = `Player-${(index * 7 + Math.floor(t / 1000)) % players}`;
        events.push({ ...base, ...HEAL_SPELL, timestampMs: t - 1_500, kind: "cast_start", source: guid, target, school, castTimeMs: 1_500 });
        events.push({ ...base, ...HEAL_SPELL, timestampMs: t, kind: "cast_go", source: guid, target, school });
        events.push({ ...base, ...HEAL_SPELL, timestampMs: t, kind: "heal", source: guid, target, school, crit });
      } else {
        const spell = SCHOOL_SPELL[school] ?? SCHOOL_SPELL[6];
        events.push({ ...base, ...spell, timestampMs: t - 2_000, kind: "cast_start", source: guid, target: "Boss", school, castTimeMs: 2_000 });
        events.push({ ...base, ...spell, timestampMs: t, kind: "cast_go", source: guid, target: "Boss", school });
        events.push({ ...base, ...spell, timestampMs: t, kind: "damage", source: guid, target: "Boss", school, crit });
        events.push({ ...base, ...spell, timestampMs: t + 1_000, kind: "damage", source: guid, target: "Boss", school, periodic: true });
      }
    }
  }
  const flamestrike = { spellId: 2120, spellName: "Flamestrike" };
  for (let t = 4_000; t < DURATION_MS; t += 6_000) {
    events.push({ ...base, ...flamestrike, timestampMs: t - 2_500, kind: "cast_start", source: "Boss", target: "", school: 4, castTimeMs: 2_500 });
    if (t % 18_000 === 10_000) {
      events.push({ ...base, timestampMs: t - 1_000, kind: "interrupt", source: "Player-3", target: "Boss", school: 2 });
      continue;
    }
    events.push({ ...base, ...flamestrike, timestampMs: t, kind: "cast_go", source: "Boss", target: "", school: 4, aoe: true });
    for (let index = 0; index < players; index += 3) {
      events.push({ ...base, ...flamestrike, timestampMs: t, kind: "damage", source: "Boss", target: `Player-${index}`, school: 4 });
    }
  }
  for (let index = 1; index < players; index += 9) {
    events.push({ ...base, timestampMs: 15_000 + index * 300, kind: "slain", source: "Boss", target: `Player-${index}`, school: 0 });
    events.push({ ...base, timestampMs: 40_000 + index * 300, kind: "resurrect", source: "Player-4", target: `Player-${index}`, school: 3 });
  }
  const fx = createEncounterEffects();
  for (const event of events.sort((left, right) => left.timestampMs - right.timestampMs)) addEffectEvent(fx, event);
  return fx;
}

// Health snapshots that change every second: the boss drains over the fight,
// players dip and recover, some with an absorb shield.
function syntheticHealth(units: SyntheticUnit[], fx: EncounterEffects): Map<string, MapHealthSample[]> {
  const healthByUnit = new Map<string, MapHealthSample[]>();
  units.forEach((unit, index) => {
    const max = unit.guid === "Boss" ? 1_000_000 : 5_000;
    const samples: MapHealthSample[] = [];
    for (let t = 0; t < DURATION_MS; t += 1_000) {
      const fraction = unit.guid === "Boss"
        ? 1 - t / DURATION_MS
        : isDeadAt(fx, unit.guid, t) ? 0 : 0.55 + 0.45 * Math.cos(t / 4_000 + index);
      samples.push({ timestampMs: t, current: Math.round(max * fraction), max, absorb: index % 4 === 0 ? max * 0.15 : 0 });
    }
    healthByUnit.set(unit.guid, samples);
  });
  return healthByUnit;
}

const FULL_VIEW = { viewport: FULL_MAP_VIEWPORT, key: "full" };

function SyntheticReplay({ players, playbackSpeed, mutedEvery, effects }: { players: number; playbackSpeed: number; mutedEvery: number; effects: boolean }) {
  const [units] = useState(() => syntheticUnits(players));
  const [fx] = useState(() => syntheticEffects(players));
  const [healthByUnit] = useState(() => syntheticHealth(units, fx));
  const [cursorMs, setCursorMs] = useState(0);

  // Mirrors SyncModeContext: coarse 100 ms ticks scaled by playback speed.
  useEffect(() => {
    const id = setInterval(() => setCursorMs((previous) => (previous + 100 * playbackSpeed) % DURATION_MS), 100);
    return () => clearInterval(id);
  }, [playbackSpeed]);

  const selected = new Set(mutedEvery > 0 ? units.filter((unit, index) => unit.kind === "player" && index % mutedEvery === 0).map((unit) => unit.guid) : []);
  const bars = selectHealthBars(units.map((unit) => unit.guid), healthByUnit, cursorMs, BOSS_GUIDS, selected);
  const markers = units.flatMap((unit): MapSceneMarker[] => {
    const sample = latestPositionAt(unit.positions, cursorMs);
    if (!sample) return [];
    const health = bars.get(unit.guid);
    return [{
      ...unit,
      sample,
      point: projectSample(sample),
      muted: mutedEvery > 0 && unit.kind === "player" && !selected.has(unit.guid),
      health: health ? { ...health, dead: isDeadAt(fx, unit.guid, cursorMs) } : null,
    }];
  });

  return (
    <div style={{ width: 800, height: 520 }} className="overflow-hidden rounded-md border border-white/10 bg-black/70">
      <MapView3D
        ground={ground}
        markers={markers}
        projectSample={projectSample}
        cursorMs={cursorMs}
        playing
        playbackSpeed={playbackSpeed}
        view={FULL_VIEW}
        effects={effects ? fx : undefined}
        bossGuids={BOSS_GUIDS}
        onUnavailable={() => console.warn("WebGL unavailable")}
      />
    </div>
  );
}

// --- Boss fight: a raid group kills one stationary boss over a 40 s loop. ---

const FIGHT_MS = 40_000;
const FIGHT_SAMPLE_MS = 200;
const PULL_END_MS = 4_000;
const AOE_CAST_MS = 20_000;
const AOE_LAND_MS = 22_500;
const AOE_CLEAR_MS = 25_500;
const BOSS_DEATH_MS = 35_000;
const BOSS_POSITION = { x: 50, y: 50 };
// Kresh, so the boss renders as its miniature (see bossMinis.ts).
const BOSS_ENTRY = 3653;
// The boss faces the tanks along -x; the raid walks in from that side.
const TANK_SIDE = Math.PI;
const BOSS_TURN_RATE = 1.2; // radians per second

const MELEE_ABILITY: Record<string, { spellId: number; spellName: string }> = {
  warrior: { spellId: 78, spellName: "Heroic Strike" },
  rogue: { spellId: 1752, spellName: "Sinister Strike" },
};
const BOSS_AOE = { spellId: 2120, spellName: "Flamestrike" };

type FightRole = "tank" | "melee" | "ranged" | "healer";

const FIGHT_ROSTERS: Record<number, Array<[FightRole, string]>> = {
  10: [
    ["tank", "warrior"], ["tank", "druid"],
    ["melee", "rogue"], ["melee", "warrior"], ["melee", "paladin"],
    ["ranged", "mage"], ["ranged", "warlock"], ["ranged", "hunter"],
    ["healer", "priest"], ["healer", "shaman"],
  ],
  25: [
    ["tank", "warrior"], ["tank", "warrior"], ["tank", "druid"],
    ["melee", "rogue"], ["melee", "rogue"], ["melee", "rogue"], ["melee", "warrior"], ["melee", "warrior"], ["melee", "paladin"], ["melee", "shaman"],
    ["ranged", "mage"], ["ranged", "mage"], ["ranged", "mage"], ["ranged", "warlock"], ["ranged", "warlock"], ["ranged", "warlock"],
    ["ranged", "hunter"], ["ranged", "hunter"], ["ranged", "hunter"], ["ranged", "druid"],
    ["healer", "priest"], ["healer", "priest"], ["healer", "paladin"], ["healer", "shaman"], ["healer", "druid"],
  ],
};

interface FightMember {
  guid: string;
  role: FightRole;
  cls: string;
  /** Fight position relative to the boss, in yards. */
  angle: number;
  radius: number;
}

function spread(index: number, count: number, width: number): number {
  return count > 1 ? (index / (count - 1) - 0.5) * width : 0;
}

// The 25-player raid stands on a slightly wider ring than the 10-player group.
const ringScale = (size: number) => (size > 10 ? 1.15 : 1);

function fightMembers(size: number): FightMember[] {
  const roster = FIGHT_ROSTERS[size] ?? FIGHT_ROSTERS[10];
  const ring = ringScale(size);
  const counts: Record<FightRole, number> = { tank: 0, melee: 0, ranged: 0, healer: 0 };
  for (const [role] of roster) counts[role]++;
  const seen: Record<FightRole, number> = { tank: 0, melee: 0, ranged: 0, healer: 0 };
  return roster.map(([role, cls], index) => {
    const nth = seen[role]++;
    const count = counts[role];
    let angle: number;
    let radius: number;
    if (role === "tank") {
      // In front of the boss, 3-4 yd.
      angle = TANK_SIDE + spread(nth, count, 0.9);
      radius = nth === 0 ? 3 : 3.8;
    } else if (role === "melee") {
      // A tight arc behind and beside the boss, 4-6 yd.
      angle = spread(nth, count, count > 3 ? 2.6 : 1.8);
      radius = 4.5 + (nth % 2) * 1.3;
    } else if (role === "ranged") {
      // A ring round the sides and back, clear of the tanks' front.
      angle = spread(nth, count, 4.2);
      radius = (12 + (nth % 2) * 2.5) * ring;
    } else {
      // Behind the tanks, in range of everyone.
      angle = TANK_SIDE + spread(nth, count, count > 2 ? 1.6 : 0.9);
      radius = (15 + (nth % 2) * 2.5) * ring;
    }
    return { guid: `Player-${index}`, role, cls, angle, radius };
  });
}

// Deterministic small sway so idle players don't look frozen.
function jitter(seed: number, t: number, amount: number): number {
  return Math.sin(t / 900 + seed * 1.7) * amount + Math.sin(t / 370 + seed * 4.1) * amount * 0.4;
}

const smoothstep = (value: number) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};

// The two melee nearest the back step out of the AoE while it is cast.
function dodgesAoe(member: FightMember, members: FightMember[]): boolean {
  const melee = members.filter((other) => other.role === "melee");
  const sorted = [...melee].sort((left, right) => Math.abs(left.angle) - Math.abs(right.angle));
  return sorted.slice(0, 2).includes(member);
}

function memberPositions(member: FightMember, index: number, dodges: boolean): MapPositionSample[] {
  const positions: MapPositionSample[] = [];
  // Everyone starts in a loose pack at the entrance, behind the healers.
  const start = { x: BOSS_POSITION.x - 36 + (index % 3) * 1.5, y: BOSS_POSITION.y + ((index % 7) - 3) * 1.8 };
  // Tanks run in first; the rest follow.
  const arrive = member.role === "tank" ? PULL_END_MS * 0.6 : PULL_END_MS;
  for (let t = 0; t <= FIGHT_MS; t += FIGHT_SAMPLE_MS) {
    let radius = member.radius;
    if (dodges) {
      const out = smoothstep((t - AOE_CAST_MS - 300) / 1_200) * (1 - smoothstep((t - AOE_CLEAR_MS) / 1_500));
      radius += out * 10;
    }
    const sway = member.role === "tank" || member.role === "melee" ? 0.25 : 0.6;
    const slot = {
      x: BOSS_POSITION.x + Math.cos(member.angle) * radius + jitter(index, t, sway),
      y: BOSS_POSITION.y + Math.sin(member.angle) * radius + jitter(index + 11, t, sway),
    };
    const progress = smoothstep(t / arrive);
    const x = start.x + (slot.x - start.x) * progress;
    const y = start.y + (slot.y - start.y) * progress;
    positions.push({
      timestampMs: t,
      x,
      y,
      mapId: 1,
      facing: progress < 1
        ? Math.atan2(slot.y - start.y, slot.x - start.x)
        : Math.atan2(BOSS_POSITION.y - y, BOSS_POSITION.x - x),
    });
  }
  return positions;
}

// Stationary; turns at a limited rate to face the main tank.
function bossPositions(mainTank: MapPositionSample[]): MapPositionSample[] {
  const positions: MapPositionSample[] = [];
  let facing = 0;
  for (let t = 0; t <= FIGHT_MS; t += FIGHT_SAMPLE_MS) {
    const tank = latestPositionAt(mainTank, t);
    if (tank && t < BOSS_DEATH_MS) {
      const want = Math.atan2(tank.y - BOSS_POSITION.y, tank.x - BOSS_POSITION.x);
      const delta = Math.atan2(Math.sin(want - facing), Math.cos(want - facing));
      const step = BOSS_TURN_RATE * (FIGHT_SAMPLE_MS / 1000);
      facing += Math.max(-step, Math.min(step, delta));
    }
    positions.push({ timestampMs: t, ...BOSS_POSITION, mapId: 1, facing });
  }
  return positions;
}

function bossFightUnits(size: number): SyntheticUnit[] {
  const members = fightMembers(size);
  const classCount: Record<string, number> = {};
  const units: SyntheticUnit[] = members.map((member, index) => {
    const n = (classCount[member.cls] = (classCount[member.cls] ?? 0) + 1);
    const name = `${member.cls[0].toUpperCase()}${member.cls.slice(1)} ${n}`;
    return {
      guid: member.guid,
      name: member.role === "tank" ? `${name} (tank)` : member.role === "healer" ? `${name} (heals)` : name,
      kind: "player",
      color: `var(--color-class-${member.cls})`,
      positions: memberPositions(member, index, dodgesAoe(member, members)),
    };
  });
  units.push({ guid: "Boss", name: "Kresh", kind: "hostile", color: "#fb7185", entry: BOSS_ENTRY, positions: bossPositions(units[0].positions) });
  return units;
}

function bossFightEffects(size: number): EncounterEffects {
  const members = fightMembers(size);
  const tanks = members.filter((member) => member.role === "tank");
  const events: ReplayEffectEvent[] = [];
  const base = { amount: 1000, crit: false, periodic: false, attack: "spell" as const, aoe: false, castTimeMs: 0, spellId: 1, spellName: "" };
  const autoAttack = { attack: "swing" as const, spellId: 6603, spellName: "Auto Attack" };

  members.forEach((member, index) => {
    const school = CLASS_SCHOOL[member.cls] ?? 2;
    const dodges = dodgesAoe(member, members);
    const offset = PULL_END_MS + (index * 173) % 900;
    if (member.role === "tank" || member.role === "melee") {
      // Tanks start swinging as soon as they arrive.
      const first = member.role === "tank" ? PULL_END_MS * 0.6 : offset;
      const period = 1_400 + (index % 3) * 250;
      for (let t = first; t < BOSS_DEATH_MS; t += period) {
        if (dodges && t > AOE_CAST_MS && t < AOE_CLEAR_MS + 1_000) continue;
        const crit = Math.floor(t / period) % 5 === 0;
        const ability = MELEE_ABILITY[member.cls] && Math.floor(t / period) % 3 === 1;
        events.push({ ...base, ...(ability ? { attack: "melee_ability" as const, ...MELEE_ABILITY[member.cls] } : autoAttack), timestampMs: t, kind: "damage", source: member.guid, target: "Boss", school: 2, crit });
      }
    } else if (member.role === "ranged") {
      const instant = member.cls === "hunter";
      const castMs = instant ? 0 : 2_000 + (index % 2) * 500;
      const period = instant ? 1_800 : castMs + 300;
      for (let t = offset + castMs; t < BOSS_DEATH_MS; t += period) {
        const crit = Math.floor(t / period) % 4 === 0;
        if (instant) {
          events.push({ ...base, timestampMs: t, kind: "damage", source: member.guid, target: "Boss", school, attack: "ranged_auto", crit, spellId: 75, spellName: "Auto Shot" });
          continue;
        }
        const spell = SCHOOL_SPELL[school] ?? SCHOOL_SPELL[6];
        events.push({ ...base, ...spell, timestampMs: t - castMs, kind: "cast_start", source: member.guid, target: "Boss", school, castTimeMs: castMs });
        events.push({ ...base, ...spell, timestampMs: t, kind: "cast_go", source: member.guid, target: "Boss", school });
        events.push({ ...base, ...spell, timestampMs: t, kind: "damage", source: member.guid, target: "Boss", school, crit });
      }
    } else {
      // Healers keep the tanks up, mostly the main tank; the melee hit by
      // the AoE get a heal right after it lands.
      const castMs = 1_500 + (index % 2) * 500;
      let cast = 0;
      for (let t = offset + castMs; t < BOSS_DEATH_MS + 1_000; t += castMs + 400, cast++) {
        const afterAoe = t > AOE_LAND_MS && t < AOE_LAND_MS + 3_000;
        const hurtMelee = members.filter((other) => other.role === "melee" && !dodgesAoe(other, members));
        const target = afterAoe && hurtMelee.length > 0
          ? hurtMelee[(cast + index) % hurtMelee.length].guid
          : tanks[cast % 3 === 2 ? Math.min(1, tanks.length - 1) : 0].guid;
        events.push({ ...base, ...HEAL_SPELL, timestampMs: t - castMs, kind: "cast_start", source: member.guid, target, school, castTimeMs: castMs });
        events.push({ ...base, ...HEAL_SPELL, timestampMs: t, kind: "cast_go", source: member.guid, target, school });
        events.push({ ...base, ...HEAL_SPELL, timestampMs: t, kind: "heal", source: member.guid, target, school, crit: cast % 6 === 0 });
      }
    }
  });

  // Boss auto-attacks on the main tank.
  for (let t = PULL_END_MS * 0.6 + 300; t < BOSS_DEATH_MS; t += 2_000) {
    events.push({ ...base, timestampMs: t, kind: "damage", source: "Boss", target: tanks[0].guid, school: 2, ...autoAttack, crit: t % 8_000 < 2_000 });
  }
  // One fire AoE on the group; the dodgers have stepped out of it.
  events.push({ ...base, ...BOSS_AOE, timestampMs: AOE_CAST_MS, kind: "cast_start", source: "Boss", target: "", school: 4, castTimeMs: AOE_LAND_MS - AOE_CAST_MS });
  events.push({ ...base, ...BOSS_AOE, timestampMs: AOE_LAND_MS, kind: "cast_go", source: "Boss", target: "", school: 4, aoe: true });
  for (const member of members) {
    if ((member.role === "tank" || member.role === "melee") && !dodgesAoe(member, members)) {
      events.push({ ...base, ...BOSS_AOE, timestampMs: AOE_LAND_MS, kind: "damage", source: "Boss", target: member.guid, school: 4 });
    }
  }
  events.push({ ...base, timestampMs: BOSS_DEATH_MS, kind: "slain", source: members[0].guid, target: "Boss", school: 0 });

  const fx = createEncounterEffects();
  for (const event of events.sort((left, right) => left.timestampMs - right.timestampMs)) addEffectEvent(fx, event);
  return fx;
}

// The boss drains from full at the pull to zero at its death; the main tank
// dips and recovers, and the AoE takes a chunk out of whoever it hit. Units
// whose health never changes get no bar (selectHealthBars declutters them).
function bossFightHealth(size: number): Map<string, MapHealthSample[]> {
  const members = fightMembers(size);
  const healthByUnit = new Map<string, MapHealthSample[]>();
  const series = (guid: string, max: number, fraction: (t: number) => number) => {
    const samples: MapHealthSample[] = [];
    for (let t = 0; t < FIGHT_MS; t += 500) samples.push({ timestampMs: t, current: Math.round(max * fraction(t)), max, absorb: 0 });
    healthByUnit.set(guid, samples);
  };
  const pull = PULL_END_MS * 0.6;
  series("Boss", 1_000_000, (t) => Math.max(0, Math.min(1, 1 - (t - pull) / (BOSS_DEATH_MS - pull))));
  members.forEach((member, index) => {
    const hitByAoe = (member.role === "tank" || member.role === "melee") && !dodgesAoe(member, members);
    series(member.guid, 5_000, (t) => {
      let fraction = 1;
      if (index === 0 && t > pull && t < BOSS_DEATH_MS) fraction = 0.7 + 0.2 * Math.cos(t / 1_500);
      if (hitByAoe && t >= AOE_LAND_MS) fraction -= 0.4 * (1 - smoothstep((t - AOE_LAND_MS) / 4_000));
      return fraction;
    });
  });
  return healthByUnit;
}

const NO_SELECTION = new Set<string>();
const FIGHT_ZOOM_IN = 1.6;

function BossFightReplay({ players, playbackSpeed }: { players: number; playbackSpeed: number }) {
  const [units] = useState(() => bossFightUnits(players));
  const [fx] = useState(() => bossFightEffects(players));
  const [healthByUnit] = useState(() => bossFightHealth(players));
  // The panel's Fit zoom over the encounter's track, clamped just past the
  // healers so the walk in from the entrance is left out, then centred on the
  // boss. The angled 3D camera shows more ground than the Fit box, so zoom in
  // further for the group to fill the canvas.
  const [view] = useState((): MapViewRequest => {
    const tracks = new Map(units.map((unit) => [unit.guid, unit.positions]));
    const bounds = unitFocusBounds(tracks, 1, projectSample, BOSS_GUIDS, 19 * ringScale(players));
    if (!bounds) return { viewport: FULL_MAP_VIEWPORT, key: "fit" };
    const boss = projectSample({ timestampMs: 0, ...BOSS_POSITION, mapId: 1, facing: 0 });
    const viewport = clampViewport({
      centerX: boss.leftPercent / 100,
      centerY: boss.topPercent / 100,
      zoom: fitViewportToBounds(bounds).zoom * FIGHT_ZOOM_IN,
    });
    return { viewport, key: "fit" };
  });
  const [cursorMs, setCursorMs] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCursorMs((previous) => (previous + 100 * playbackSpeed) % FIGHT_MS), 100);
    return () => clearInterval(id);
  }, [playbackSpeed]);

  const bars = selectHealthBars(units.map((unit) => unit.guid), healthByUnit, cursorMs, BOSS_GUIDS, NO_SELECTION);
  const markers = units.flatMap((unit): MapSceneMarker[] => {
    const sample = latestPositionAt(unit.positions, cursorMs);
    if (!sample) return [];
    const health = bars.get(unit.guid);
    return [{ ...unit, sample, point: projectSample(sample), muted: false, health: health ? { ...health, dead: isDeadAt(fx, unit.guid, cursorMs) } : null }];
  });

  return (
    <div style={{ width: 800, height: 520 }} className="overflow-hidden rounded-md border border-white/10 bg-black/70">
      <MapView3D
        ground={ground}
        markers={markers}
        projectSample={projectSample}
        cursorMs={cursorMs}
        playing
        playbackSpeed={playbackSpeed}
        view={view}
        effects={fx}
        bossGuids={BOSS_GUIDS}
        onUnavailable={() => console.warn("WebGL unavailable")}
      />
    </div>
  );
}

// Every Wailing Caverns boss on a ring with a health bar, each walking a small
// circle so its facing turns; they take turns being hit and one dies at 20 s.
// Bosses whose model is missing from public/boss-minis show the box marker.
const BOSS_ENTRIES = [...BOSS_MINI_SLUGS.keys()];
const BOSS_MINI_VIEW = { viewport: { centerX: 0.5, centerY: 0.5, zoom: 3 }, key: "boss-minis" };

function bossMiniMarkers(cursorMs: number, fx: EncounterEffects): MapSceneMarker[] {
  return BOSS_ENTRIES.flatMap((entry, index): MapSceneMarker[] => {
    const angle = (index / BOSS_ENTRIES.length) * Math.PI * 2;
    const positions = circlingPositions(index, BOSS_ENTRIES.length, 1.5, 2)
      .map((sample) => ({ ...sample, x: sample.x + Math.cos(angle) * 9, y: sample.y + Math.sin(angle) * 9 }));
    const sample = latestPositionAt(positions, cursorMs);
    if (!sample) return [];
    return [{
      guid: `Boss-${entry}`,
      health: { current: 100 - index * 9, max: 100, absorb: 0, dead: isDeadAt(fx, `Boss-${entry}`, cursorMs) },
      name: BOSS_MINI_SLUGS.get(entry)!,
      kind: "hostile",
      color: "#fb7185",
      entry,
      positions,
      sample,
      point: projectSample(sample),
      muted: false,
    }];
  });
}

function bossMiniEffects(): EncounterEffects {
  const fx = createEncounterEffects();
  const base = { amount: 1000, crit: false, periodic: false, melee: true, aoe: false, castTimeMs: 0, spellId: null, school: 2, source: "Player-0" };
  const events: ReplayEffectEvent[] = [];
  for (let t = 300; t < DURATION_MS; t += 700) {
    events.push({ ...base, timestampMs: t, kind: "damage", target: `Boss-${BOSS_ENTRIES[Math.floor(t / 700) % BOSS_ENTRIES.length]}` });
  }
  const last = `Boss-${BOSS_ENTRIES[BOSS_ENTRIES.length - 1]}`;
  events.push({ ...base, timestampMs: 20_000, kind: "slain", target: last, melee: false });
  events.push({ ...base, timestampMs: 40_000, kind: "resurrect", target: last, melee: false });
  for (const event of events.sort((left, right) => left.timestampMs - right.timestampMs)) addEffectEvent(fx, event);
  return fx;
}

function BossMiniReplay({ playbackSpeed }: { playbackSpeed: number }) {
  const [fx] = useState(bossMiniEffects);
  const [cursorMs, setCursorMs] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCursorMs((previous) => (previous + 100 * playbackSpeed) % DURATION_MS), 100);
    return () => clearInterval(id);
  }, [playbackSpeed]);

  return (
    <div style={{ width: 800, height: 520 }} className="overflow-hidden rounded-md border border-white/10 bg-black/70">
      <MapView3D
        ground={ground}
        markers={bossMiniMarkers(cursorMs, fx)}
        projectSample={projectSample}
        cursorMs={cursorMs}
        playing
        playbackSpeed={playbackSpeed}
        view={BOSS_MINI_VIEW}
        effects={fx}
        onUnavailable={() => console.warn("WebGL unavailable")}
      />
    </div>
  );
}

// Seeds the spell lookups the cast icons use (the query key useSpellMeta and
// useSpell share), so the story needs no backend. Starfire is left out and
// falls back to the question mark.
const SPELL_ICONS: Record<number, string> = {
  585: "spell_holy_holysmite",
  403: "spell_nature_lightning",
  116: "spell_frost_frostbolt02",
  686: "spell_shadow_shadowbolt",
  2054: "spell_holy_heal",
  2120: "spell_fire_selfdestruct",
};

function WithSpellIcons({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  useState(() => {
    for (const [id, icon] of Object.entries(SPELL_ICONS)) {
      queryClient.setQueryData(["wowdb", "spell", id, "default"], { id: Number(id), spell_icon: { TextureFilename: icon } } as unknown as WoWSpell);
    }
  });
  return children;
}

const meta = {
  title: "Instance/Map/MapView3D",
  component: SyntheticReplay,
  parameters: { layout: "centered" },
  args: { players: 40, playbackSpeed: 4, mutedEvery: 0, effects: false },
} satisfies Meta<typeof SyntheticReplay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FortyPlayersAt4x: Story = {};

export const WithSelection: Story = {
  args: { players: 20, playbackSpeed: 1, mutedEvery: 3 },
};

/** Hit wobble, melee lunges/slashes, Auto Shot streaks, spell bolts, cast/AoE rings, interrupts, deaths and health bars at 1x. */
export const Effects: Story = {
  args: { players: 10, playbackSpeed: 1, effects: true },
};

/** Effect density: a 40-player raid at 4x speed, capped primitives and health bars. */
export const EffectsFortyPlayersAt4x: Story = {
  args: { players: 40, playbackSpeed: 4, effects: true },
};

/** Selected players' spell names float over their targets; hover a beam, streak, slash or ring for its spell tooltip. */
export const EffectsWithSelection: Story = {
  args: { players: 20, playbackSpeed: 1, mutedEvery: 3, effects: true },
};

/**
 * A 10-player group kills one boss on a 40 s loop: pull, tank-and-spank with
 * melee swings, spell and heal beams, one fire AoE that two melee step out
 * of, then the boss (health bar drained) falls over. Framed like the panel's Fit view.
 */
export const BossFight: Story = {
  args: { players: 10, playbackSpeed: 1, effects: true },
  render: ({ players, playbackSpeed }) => <BossFightReplay players={players} playbackSpeed={playbackSpeed} />,
};

/** The same fight with a 25-player raid. */
export const BossFight25: Story = {
  args: { players: 25, playbackSpeed: 1, effects: true },
  render: ({ players, playbackSpeed }) => <BossFightReplay players={players} playbackSpeed={playbackSpeed} />,
};

/** Wailing Caverns boss miniatures (box markers where a model is missing). */
export const BossMinis: Story = {
  args: { playbackSpeed: 1 },
  render: ({ playbackSpeed }) => <BossMiniReplay playbackSpeed={playbackSpeed} />,
};

/**
 * Spell icons float above the selected players and the boss while they cast:
 * held through a cast, briefly after instants; auto attacks show none.
 */
export const CastIcons: Story = {
  args: { players: 10, playbackSpeed: 1, mutedEvery: 2, effects: true },
  render: (args) => <WithSpellIcons><SyntheticReplay {...args} /></WithSpellIcons>,
};
