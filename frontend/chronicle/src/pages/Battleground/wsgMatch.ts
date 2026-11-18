/**
 * An imagined Warsong Gulch match for the battleground view's stories.
 *
 * A deterministic, second-by-second simulation: flag pickups, drops, returns
 * and captures follow a script; players steer by role (carrier, escort,
 * defender, midfield, healer); skirmish kills emerge when enemies meet.
 * Positions are world yards on map 489 so the same samples feed the 2D and
 * 3D replay views. Real logs would produce the same shapes from the
 * unit_position, damage, heal, slain and aura (flag aura) streams.
 */
import type { MapPositionSample } from "@/pages/Instance/EventsPanels/Map/map.processor";

export type Faction = "alliance" | "horde";
type Role = "runner" | "escort" | "defender" | "mid" | "healer";

export interface BgPlayer {
  guid: string;
  name: string;
  className: string;
  faction: Faction;
  role: Role;
}

/** `flag` is the flag's owner: the Horde flag lives in the Horde base and is carried by Alliance players. */
export interface FlagEvent {
  t: number;
  kind: "pickup" | "drop" | "return" | "capture";
  flag: Faction;
  player: string;
  x: number;
  y: number;
}

export interface KillEvent {
  t: number;
  killer: string;
  victim: string;
  x: number;
  y: number;
  carrier: boolean;
}

export interface MatchMoment {
  t: number;
  kind: "gates" | "pickup" | "capture" | "carrier_kill" | "return" | "fight" | "end";
  faction?: Faction;
  player?: string;
  text: string;
  /** Fights only: how many kills in the window. */
  kills?: number;
}

export interface PlayerBuckets {
  damage: Float64Array;
  healing: Float64Array;
}

export interface CarrierStats {
  guid: string;
  pickups: number;
  caps: number;
  holdMs: number;
  damageTaken: number;
  healingReceived: number;
}

export interface WsgMatch {
  zone: string;
  mapId: number;
  startedAt: string;
  recorder: string;
  server: string;
  durationMs: number;
  winner: Faction;
  premade: Partial<Record<Faction, string>>;
  players: BgPlayer[];
  flagEvents: FlagEvent[];
  kills: KillEvent[];
  moments: MatchMoment[];
  positions: Map<string, MapPositionSample[]>;
  health: Map<string, Float32Array>;
  bucketMs: number;
  buckets: Map<string, PlayerBuckets>;
  carriers: CarrierStats[];
  /** Synthetic team-only counters with no per-player breakdown yet. */
  teamExtras: Record<Faction, { ccApplied: number; dispels: number }>;
}

export const WSG_MAP_ID = 489;
const STEP_MS = 1_000;
const BUCKET_MS = 15_000;
const SPEED = 9; // yd/s with a little sprint/travel form
const RESPAWN_MS = 25_000;

/** World bounds of the playable gulch (x is north, y is west). */
export const WSG_BOUNDS = { minX: 860, maxX: 1600, minY: 1290, maxY: 1630 };

export const WSG_POI = {
  flag: { alliance: { x: 1540, y: 1481 }, horde: { x: 916, y: 1434 } } as Record<Faction, Point>,
  graveyard: { alliance: { x: 1415, y: 1560 }, horde: { x: 1032, y: 1385 } } as Record<Faction, Point>,
  tunnel: { alliance: { x: 1440, y: 1468 }, horde: { x: 1020, y: 1446 } } as Record<Faction, Point>,
  mid: { x: 1230, y: 1460 },
  buffs: [
    { kind: "speed", x: 1450, y: 1395 },
    { kind: "berserk", x: 1330, y: 1585 },
    { kind: "restore", x: 1130, y: 1330 },
    { kind: "speed", x: 1010, y: 1540 },
  ],
};

interface Point {
  x: number;
  y: number;
}

// From the Alliance flag (north) to the Horde flag (south).
const ROUTES: Point[][] = [
  [{ x: 1540, y: 1481 }, { x: 1440, y: 1468 }, { x: 1320, y: 1470 }, { x: 1230, y: 1460 }, { x: 1130, y: 1450 }, { x: 1020, y: 1446 }, { x: 916, y: 1434 }],
  [{ x: 1540, y: 1481 }, { x: 1470, y: 1545 }, { x: 1360, y: 1585 }, { x: 1230, y: 1565 }, { x: 1100, y: 1545 }, { x: 990, y: 1500 }, { x: 916, y: 1434 }],
  [{ x: 1540, y: 1481 }, { x: 1470, y: 1415 }, { x: 1360, y: 1350 }, { x: 1230, y: 1335 }, { x: 1100, y: 1345 }, { x: 990, y: 1385 }, { x: 916, y: 1434 }],
];

const ROSTER: Array<[string, string, Faction, Role]> = [
  ["Lyrae", "druid", "alliance", "runner"],
  ["Brannoc", "warrior", "alliance", "escort"],
  ["Quillon", "rogue", "alliance", "mid"],
  ["Thessaly", "mage", "alliance", "defender"],
  ["Aldwin", "paladin", "alliance", "healer"],
  ["Marrow", "hunter", "alliance", "mid"],
  ["Sefi", "priest", "alliance", "escort"],
  ["Edda", "mage", "alliance", "defender"],
  ["Tovin", "warrior", "alliance", "mid"],
  ["Wrenna", "priest", "alliance", "healer"],
  ["Grukk", "warrior", "horde", "runner"],
  ["Zulrah", "shaman", "horde", "runner"],
  ["Morgash", "hunter", "horde", "defender"],
  ["Vexa", "warlock", "horde", "mid"],
  ["Tahu", "druid", "horde", "escort"],
  ["Krenna", "hunter", "horde", "mid"],
  ["Oshk", "shaman", "horde", "healer"],
  ["Sizz", "mage", "horde", "mid"],
  ["Ragh", "rogue", "horde", "defender"],
  ["Dreva", "priest", "horde", "healer"],
];

type Script =
  | { t: number; kind: "pickup"; player: string; route: number }
  | { t: number; kind: "capture"; player: string }
  | { t: number; kind: "carrier_kill"; killer: string; victim: string }
  | { t: number; kind: "return"; player: string };

const s = (minutes: number, seconds: number) => (minutes * 60 + seconds) * 1000;

// Alliance wins 3-2 at 17:05.
const SCRIPT: Script[] = [
  { t: s(1, 15), kind: "pickup", player: "Lyrae", route: 1 },
  { t: s(1, 25), kind: "pickup", player: "Grukk", route: 2 },
  { t: s(2, 40), kind: "carrier_kill", killer: "Thessaly", victim: "Grukk" },
  { t: s(2, 44), kind: "return", player: "Thessaly" },
  { t: s(3, 5), kind: "capture", player: "Lyrae" },
  { t: s(4, 20), kind: "pickup", player: "Zulrah", route: 0 },
  { t: s(4, 50), kind: "pickup", player: "Lyrae", route: 2 },
  { t: s(7, 10), kind: "carrier_kill", killer: "Morgash", victim: "Lyrae" },
  { t: s(7, 14), kind: "return", player: "Morgash" },
  { t: s(7, 40), kind: "capture", player: "Zulrah" },
  { t: s(9, 0), kind: "pickup", player: "Brannoc", route: 0 },
  { t: s(10, 5), kind: "capture", player: "Brannoc" },
  { t: s(11, 0), kind: "pickup", player: "Grukk", route: 1 },
  { t: s(11, 20), kind: "pickup", player: "Lyrae", route: 1 },
  { t: s(13, 20), kind: "carrier_kill", killer: "Vexa", victim: "Lyrae" },
  { t: s(13, 23), kind: "pickup", player: "Sefi", route: 1 },
  { t: s(14, 20), kind: "capture", player: "Grukk" },
  { t: s(15, 0), kind: "pickup", player: "Zulrah", route: 2 },
  { t: s(16, 20), kind: "carrier_kill", killer: "Edda", victim: "Zulrah" },
  { t: s(16, 22), kind: "return", player: "Edda" },
  { t: s(17, 5), kind: "capture", player: "Sefi" },
];
const DURATION_MS = s(17, 5);
// The midfield brawl: mids and escorts converge, kills spike.
const TEAMFIGHT = { from: s(6, 0), to: s(6, 40) };

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const enemy = (faction: Faction): Faction => (faction === "alliance" ? "horde" : "alliance");
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function routeFor(index: number, carrierFaction: Faction): Point[] {
  // Alliance carriers run south→north (Horde flag home to Alliance base).
  const route = ROUTES[index];
  return carrierFaction === "alliance" ? [...route].reverse() : route;
}

function alongRoute(route: Point[], distance: number): Point {
  let remaining = distance;
  for (let i = 0; i < route.length - 1; i++) {
    const leg = dist(route[i], route[i + 1]);
    if (remaining <= leg) {
      const f = remaining / leg;
      return { x: route[i].x + (route[i + 1].x - route[i].x) * f, y: route[i].y + (route[i + 1].y - route[i].y) * f };
    }
    remaining -= leg;
  }
  return route[route.length - 1];
}

const DAMAGE_RATE: Record<string, number> = { warrior: 150, rogue: 165, mage: 175, warlock: 165, hunter: 150, druid: 95, shaman: 120, paladin: 70, priest: 55 };
const HEAL_RATE: Record<string, number> = { priest: 210, paladin: 190, shaman: 170, druid: 150 };
const MAX_HP: Record<string, number> = { warrior: 5200, rogue: 3900, mage: 3500, warlock: 4300, hunter: 4100, druid: 4600, shaman: 4500, paladin: 4800, priest: 3700 };

export function createWsgMatch(seed = 7): WsgMatch {
  const rng = mulberry32(seed);
  const players: BgPlayer[] = ROSTER.map(([name, className, faction, role], index) => ({ guid: `Player-${index}`, name, className, faction, role }));
  const byName = new Map(players.map((p) => [p.name, p]));
  const guidOf = (name: string) => byName.get(name)!.guid;
  const pos = new Map<string, Point>();
  const deadUntil = new Map<string, number>();
  const diedAt = new Map<string, number>();
  const positions = new Map<string, MapPositionSample[]>(players.map((p) => [p.guid, []]));
  const health = new Map<string, Float32Array>();
  const steps = Math.floor(DURATION_MS / STEP_MS) + 1;
  const buckets = new Map<string, PlayerBuckets>();
  const recentTaken = new Map<string, number>();
  const nBuckets = Math.ceil(DURATION_MS / BUCKET_MS);
  for (const p of players) {
    health.set(p.guid, new Float32Array(steps));
    buckets.set(p.guid, { damage: new Float64Array(nBuckets), healing: new Float64Array(nBuckets) });
    // Start in the base tunnels, slightly spread.
    const tunnel = WSG_POI.tunnel[p.faction];
    pos.set(p.guid, { x: tunnel.x + (rng() - 0.5) * 30, y: tunnel.y + (rng() - 0.5) * 40 });
  }

  const flagEvents: FlagEvent[] = [];
  const kills: KillEvent[] = [];
  const carrierStats = new Map<string, CarrierStats>();
  const statsFor = (guid: string) => {
    let entry = carrierStats.get(guid);
    if (!entry) carrierStats.set(guid, (entry = { guid, pickups: 0, caps: 0, holdMs: 0, damageTaken: 0, healingReceived: 0 }));
    return entry;
  };
  // Flag state, keyed by the flag's owner.
  const carrier: Record<Faction, { guid: string; route: Point[]; pickedAt: number; startDistance: number } | null> = { alliance: null, horde: null };
  const dropped: Record<Faction, Point | null> = { alliance: null, horde: null };
  const isCarrier = (guid: string) => carrier.alliance?.guid === guid || carrier.horde?.guid === guid;
  const scriptQueue = [...SCRIPT];

  const kill = (t: number, killer: string, victim: string) => {
    const at = pos.get(victim)!;
    kills.push({ t, killer, victim, x: at.x, y: at.y, carrier: isCarrier(victim) });
    deadUntil.set(victim, t + RESPAWN_MS);
    diedAt.set(victim, t);
  };
  const alive = (guid: string, t: number) => (deadUntil.get(guid) ?? -1) <= t;

  for (let step = 0; step < steps; step++) {
    const t = step * STEP_MS;

    // 1. Scripted objective events.
    while (scriptQueue.length > 0 && scriptQueue[0].t <= t) {
      const event = scriptQueue.shift()!;
      if (event.kind === "pickup") {
        const player = byName.get(event.player)!;
        const flag = enemy(player.faction);
        const from = dropped[flag] ?? WSG_POI.flag[flag];
        const route = routeFor(event.route, player.faction);
        // A pickup from the ground continues along the route from the nearest point.
        let startDistance = 0;
        if (dropped[flag]) {
          let best = Infinity;
          for (let d = 0; d < 900; d += 5) {
            const gap = dist(alongRoute(route, d), from);
            if (gap < best) [best, startDistance] = [gap, d];
          }
        }
        pos.set(player.guid, { ...from });
        carrier[flag] = { guid: player.guid, route, pickedAt: t, startDistance };
        dropped[flag] = null;
        statsFor(player.guid).pickups++;
        flagEvents.push({ t, kind: "pickup", flag, player: player.guid, ...from });
      } else if (event.kind === "carrier_kill") {
        const victim = guidOf(event.victim);
        const flag = carrier.alliance?.guid === victim ? "alliance" : "horde";
        const at = { ...pos.get(victim)! };
        const killer = guidOf(event.killer);
        pos.set(killer, { x: at.x + 6, y: at.y - 4 });
        kill(t, killer, victim);
        statsFor(victim).holdMs += t - carrier[flag]!.pickedAt;
        carrier[flag] = null;
        dropped[flag] = at;
        flagEvents.push({ t, kind: "drop", flag, player: victim, ...at });
      } else if (event.kind === "return") {
        const player = byName.get(event.player)!;
        const at = dropped[player.faction]!;
        pos.set(player.guid, { ...at });
        dropped[player.faction] = null;
        flagEvents.push({ t, kind: "return", flag: player.faction, player: player.guid, ...at });
      } else {
        const player = byName.get(event.player)!;
        const flag = enemy(player.faction);
        const home = WSG_POI.flag[player.faction];
        pos.set(player.guid, { ...home });
        const stats = statsFor(player.guid);
        stats.caps++;
        stats.holdMs += t - carrier[flag]!.pickedAt;
        carrier[flag] = null;
        flagEvents.push({ t, kind: "capture", flag, player: player.guid, ...home });
      }
    }

    // 2. Respawns.
    for (const p of players) {
      const until = deadUntil.get(p.guid);
      if (until !== undefined && until <= t && diedAt.has(p.guid)) {
        diedAt.delete(p.guid);
        const gy = WSG_POI.graveyard[p.faction];
        pos.set(p.guid, { x: gy.x + (rng() - 0.5) * 12, y: gy.y + (rng() - 0.5) * 12 });
      }
    }

    // 3. Movement.
    const fight = t >= TEAMFIGHT.from && t <= TEAMFIGHT.to;
    for (const [index, p] of players.entries()) {
      if (!alive(p.guid, t)) continue;
      const here = pos.get(p.guid)!;
      const ownFlag = p.faction;
      const enemyFlag = enemy(p.faction);
      const myCarry = carrier[enemyFlag]?.guid === p.guid ? carrier[enemyFlag] : null;
      let target: Point;
      if (myCarry) {
        // Run the route home, then hold in the flag room until our flag is back.
        const distance = myCarry.startDistance + ((t - myCarry.pickedAt) / 1000) * SPEED;
        target = alongRoute(myCarry.route, distance);
        if (dist(target, WSG_POI.flag[ownFlag]) < 10) {
          target = { x: WSG_POI.flag[ownFlag].x + Math.sin(t / 7000 + index) * 14, y: WSG_POI.flag[ownFlag].y + Math.cos(t / 9000) * 18 };
        }
        pos.set(p.guid, target);
        continue;
      }
      const nextPickup = scriptQueue.find((event) => event.kind === "pickup" && event.player === p.name);
      const friendlyCarrier = carrier[enemyFlag];
      const enemyCarrier = carrier[ownFlag];
      const wobble = (amount: number) => ({ x: Math.sin(t / 3100 + index * 1.7) * amount, y: Math.cos(t / 2700 + index * 2.3) * amount });
      if (nextPickup && nextPickup.t - t < 100_000) {
        target = dropped[enemyFlag] ?? WSG_POI.flag[enemyFlag];
      } else if (fight && (p.role === "mid" || p.role === "escort" || p.role === "healer")) {
        const w = wobble(22);
        target = { x: WSG_POI.mid.x + w.x, y: WSG_POI.mid.y + w.y };
      } else if (p.role === "defender" && enemyCarrier) {
        target = pos.get(enemyCarrier.guid)!;
      } else if (p.role === "defender") {
        const w = wobble(25);
        const flag = WSG_POI.flag[ownFlag];
        const tunnel = WSG_POI.tunnel[ownFlag];
        target = { x: (flag.x + tunnel.x) / 2 + w.x, y: (flag.y + tunnel.y) / 2 + w.y };
      } else if ((p.role === "escort" || p.role === "healer") && friendlyCarrier) {
        const c = pos.get(friendlyCarrier.guid)!;
        const w = wobble(10);
        target = { x: c.x + w.x, y: c.y + w.y };
      } else if (enemyCarrier && p.role !== "runner") {
        target = pos.get(enemyCarrier.guid)!;
      } else {
        const w = wobble(40);
        const lean = p.faction === "alliance" ? 30 : -30;
        target = { x: WSG_POI.mid.x + lean + w.x, y: WSG_POI.mid.y + w.y };
      }
      const gap = dist(here, target);
      const move = Math.min(gap, SPEED * (STEP_MS / 1000));
      if (gap > 0.5) pos.set(p.guid, { x: here.x + ((target.x - here.x) / gap) * move, y: here.y + ((target.y - here.y) / gap) * move });
    }

    // 4. Combat: damage to the nearest enemy (carriers first), heals to hurt allies.
    const bucket = Math.min(nBuckets - 1, Math.floor(t / BUCKET_MS));
    const scripted = (guid: string) => isCarrier(guid) || scriptQueue.some((event) => event.t - t < 100_000 && "player" in event && event.player === players.find((p) => p.guid === guid)?.name);
    const takenNow = new Map<string, number>();
    for (const p of players) {
      if (!alive(p.guid, t)) continue;
      const here = pos.get(p.guid)!;
      const foes = players.filter((o) => o.faction !== p.faction && alive(o.guid, t) && dist(here, pos.get(o.guid)!) < 40);
      if (foes.length === 0) continue;
      const target = foes.find((o) => isCarrier(o.guid)) ?? foes.reduce((a, b) => (dist(here, pos.get(a.guid)!) < dist(here, pos.get(b.guid)!) ? a : b));
      const amount = (DAMAGE_RATE[p.className] ?? 100) * (0.6 + rng() * 0.8);
      buckets.get(p.guid)!.damage[bucket] += amount;
      takenNow.set(target.guid, (takenNow.get(target.guid) ?? 0) + amount);
      if (isCarrier(target.guid)) statsFor(target.guid).damageTaken += amount;
    }
    for (const p of players) {
      const rate = HEAL_RATE[p.className];
      if (!rate || !alive(p.guid, t)) continue;
      const here = pos.get(p.guid)!;
      const hurt = players.filter((o) => o.faction === p.faction && alive(o.guid, t) && (takenNow.get(o.guid) ?? 0) > 0 && dist(here, pos.get(o.guid)!) < 40);
      const isHealer = p.role === "healer" || p.role === "escort";
      if (hurt.length === 0 || (!isHealer && rng() < 0.7)) continue;
      const target = hurt.find((o) => isCarrier(o.guid)) ?? hurt[Math.floor(rng() * hurt.length)];
      const amount = rate * (0.5 + rng() * 0.9) * (isHealer ? 1 : 0.3);
      buckets.get(p.guid)!.healing[bucket] += amount;
      if (isCarrier(target.guid)) statsFor(target.guid).healingReceived += amount;
      takenNow.set(target.guid, Math.max(0, (takenNow.get(target.guid) ?? 0) - amount * 0.8));
    }
    for (const p of players) {
      const taken = (recentTaken.get(p.guid) ?? 0) * 0.82 + (takenNow.get(p.guid) ?? 0);
      recentTaken.set(p.guid, taken);
    }

    // 5. Emergent skirmish kills between nearby enemies.
    const killChance = fight ? 0.06 : 0.0065;
    for (const a of players) {
      if (a.faction !== "alliance" || !alive(a.guid, t)) continue;
      for (const h of players) {
        if (h.faction !== "horde" || !alive(h.guid, t) || !alive(a.guid, t)) continue;
        if (dist(pos.get(a.guid)!, pos.get(h.guid)!) > 30 || rng() > killChance) continue;
        const allianceWins = rng() < 0.53;
        const [killer, victim] = allianceWins ? [a, h] : [h, a];
        if (scripted(victim.guid)) continue;
        kill(t, killer.guid, victim.guid);
      }
    }

    // 6. Samples.
    for (const p of players) {
      const here = pos.get(p.guid)!;
      const track = positions.get(p.guid)!;
      const prev = track[track.length - 1];
      const facing = prev && (Math.abs(prev.x - here.x) + Math.abs(prev.y - here.y) > 0.3) ? Math.atan2(here.y - prev.y, here.x - prev.x) : prev?.facing ?? 0;
      track.push({ timestampMs: t, x: here.x, y: here.y, mapId: WSG_MAP_ID, facing });
      const max = MAX_HP[p.className] ?? 4000;
      const dead = !alive(p.guid, t);
      const nextDeath = kills.find((k) => k.victim === p.guid && k.t > t && k.t - t <= 4_000);
      let fraction = dead ? 0 : Math.max(0.12, 1 - (recentTaken.get(p.guid) ?? 0) / max);
      if (!dead && nextDeath) fraction = Math.min(fraction, (nextDeath.t - t) / 5_000);
      health.get(p.guid)![step] = fraction;
    }
  }
  // Kills found after their lead-in was sampled: drop health into each death.
  for (const k of kills) {
    const samples = health.get(k.victim)!;
    for (let back = 1; back <= 4; back++) {
      const i = Math.floor(k.t / STEP_MS) - back;
      if (i >= 0) samples[i] = Math.min(samples[i], back / 5);
    }
  }

  return {
    zone: "Warsong Gulch",
    mapId: WSG_MAP_ID,
    startedAt: "2026-11-09T21:14:00Z",
    recorder: "Thessaly",
    server: "Nordanaar",
    durationMs: DURATION_MS,
    winner: "alliance",
    premade: { alliance: "<Dawnguard> premade ×5" },
    players,
    flagEvents,
    kills,
    moments: buildMoments(players, flagEvents, kills),
    positions,
    health,
    bucketMs: BUCKET_MS,
    buckets,
    carriers: [...carrierStats.values()].sort((a, b) => b.holdMs - a.holdMs),
    teamExtras: { alliance: { ccApplied: 212, dispels: 47 }, horde: { ccApplied: 168, dispels: 31 } },
  };
}

function buildMoments(players: BgPlayer[], flags: FlagEvent[], kills: KillEvent[]): MatchMoment[] {
  const nameOf = (guid: string) => players.find((p) => p.guid === guid)!.name;
  const factionOf = (guid: string) => players.find((p) => p.guid === guid)!.faction;
  const flagName = (flag: Faction) => (flag === "alliance" ? "Alliance flag" : "Horde flag");
  const moments: MatchMoment[] = [{ t: 0, kind: "gates", text: "Gates open" }];
  for (const event of flags) {
    const name = nameOf(event.player);
    const faction = factionOf(event.player);
    if (event.kind === "pickup") moments.push({ t: event.t, kind: "pickup", faction, player: event.player, text: `${name} picks up the ${flagName(event.flag)}` });
    if (event.kind === "return") moments.push({ t: event.t, kind: "return", faction, player: event.player, text: `${flagName(event.flag)} returned by ${name}` });
    if (event.kind === "capture") moments.push({ t: event.t, kind: "capture", faction, player: event.player, text: `${name} captures — ${faction === "alliance" ? "Alliance" : "Horde"} scores` });
  }
  for (const k of kills) {
    if (k.carrier) moments.push({ t: k.t, kind: "carrier_kill", faction: factionOf(k.killer), player: k.killer, text: `${nameOf(k.killer)} kills carrier ${nameOf(k.victim)}` });
  }
  // Fights: 25 s windows with 7+ kills, greedily, non-overlapping.
  const window = 25_000;
  const sorted = [...kills].sort((a, b) => a.t - b.t);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].t - sorted[i].t <= window) j++;
    const count = j - i + 1;
    if (count >= 7) {
      const slice = sorted.slice(i, j + 1);
      const mid = slice.reduce((acc, k) => ({ x: acc.x + k.x / count, y: acc.y + k.y / count }), { x: 0, y: 0 });
      const where = mid.x > 1380 ? "Alliance base" : mid.x < 1080 ? "Horde base" : "Midfield";
      const allianceKills = slice.filter((k) => factionOf(k.killer) === "alliance").length;
      moments.push({ t: sorted[i].t, kind: "fight", kills: count, faction: allianceKills * 2 >= count ? "alliance" : "horde", text: `${where} team fight · ${count} kills in ${Math.round((sorted[j].t - sorted[i].t) / 1000)} s` });
      i = j + 1;
    } else i++;
  }
  return moments.sort((a, b) => a.t - b.t);
}

/** Linear position at `t` from 1 s samples. */
export function positionAt(samples: MapPositionSample[], t: number): MapPositionSample | null {
  if (samples.length === 0) return null;
  const i = Math.min(samples.length - 1, Math.max(0, Math.floor(t / STEP_MS)));
  const a = samples[i];
  const b = samples[Math.min(samples.length - 1, i + 1)];
  const f = Math.max(0, Math.min(1, (t - a.timestampMs) / STEP_MS));
  // A respawn is a teleport, not a run across the map.
  if (Math.hypot(b.x - a.x, b.y - a.y) > 40) return f < 0.5 ? a : b;
  return { ...a, timestampMs: t, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, facing: b.facing };
}

export function healthAt(match: WsgMatch, guid: string, t: number): number {
  const samples = match.health.get(guid);
  if (!samples) return 1;
  return samples[Math.min(samples.length - 1, Math.max(0, Math.floor(t / STEP_MS)))];
}

export function isDead(match: WsgMatch, guid: string, t: number): boolean {
  return match.kills.some((k) => k.victim === guid && k.t <= t && t < k.t + RESPAWN_MS);
}

export interface FlagState {
  carrier: string | null;
  dropped: Point | null;
  since: number;
}

/** Where each flag (keyed by its owner) is at `t`. */
export function flagStateAt(match: WsgMatch, t: number): Record<Faction, FlagState> {
  const state: Record<Faction, FlagState> = { alliance: { carrier: null, dropped: null, since: 0 }, horde: { carrier: null, dropped: null, since: 0 } };
  for (const event of match.flagEvents) {
    if (event.t > t) break;
    const flag = state[event.flag];
    flag.since = event.t;
    if (event.kind === "pickup") Object.assign(flag, { carrier: event.player, dropped: null });
    else if (event.kind === "drop") Object.assign(flag, { carrier: null, dropped: { x: event.x, y: event.y } });
    else Object.assign(flag, { carrier: null, dropped: null });
  }
  return state;
}

export function scoreAt(match: WsgMatch, t: number, players = match.players): Record<Faction, number> {
  const score = { alliance: 0, horde: 0 };
  for (const event of match.flagEvents) {
    if (event.t > t) break;
    if (event.kind === "capture") score[players.find((p) => p.guid === event.player)!.faction]++;
  }
  return score;
}

export interface ScoreRow {
  player: BgPlayer;
  killingBlows: number;
  deaths: number;
  honorableKills: number;
  damage: number;
  healing: number;
  caps: number;
  returns: number;
}

/** The scoreboard as of `t` (partial buckets are prorated). */
export function scoreboardAt(match: WsgMatch, t: number): ScoreRow[] {
  const full = Math.floor(t / match.bucketMs);
  const partial = (t % match.bucketMs) / match.bucketMs;
  const sum = (values: Float64Array) => {
    let total = 0;
    for (let i = 0; i < Math.min(full, values.length); i++) total += values[i];
    if (full < values.length) total += values[full] * partial;
    return total;
  };
  return match.players.map((player) => {
    const kills = match.kills.filter((k) => k.t <= t);
    const teamKills = kills.filter((k) => match.players.find((p) => p.guid === k.killer)!.faction === player.faction);
    const positions = match.positions.get(player.guid)!;
    const honorableKills = teamKills.filter((k) => {
      const here = positionAt(positions, k.t);
      return here && Math.hypot(here.x - k.x, here.y - k.y) < 45 && !isDead(match, player.guid, k.t);
    }).length;
    const bucket = match.buckets.get(player.guid)!;
    return {
      player,
      killingBlows: kills.filter((k) => k.killer === player.guid).length,
      deaths: kills.filter((k) => k.victim === player.guid).length,
      honorableKills,
      damage: sum(bucket.damage),
      healing: sum(bucket.healing),
      caps: match.flagEvents.filter((e) => e.t <= t && e.kind === "capture" && e.player === player.guid).length,
      returns: match.flagEvents.filter((e) => e.t <= t && e.kind === "return" && e.player === player.guid).length,
    };
  });
}
