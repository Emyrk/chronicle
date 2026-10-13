import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { MapPositionSample } from "./map.processor";
import { FULL_MAP_VIEWPORT, latestPositionAt, type MapPoint } from "./mapModel";
import MapView3D from "./MapView3D";
import { addEffectEvent, createEncounterEffects, type EncounterEffects, type ReplayEffectEvent } from "./replayEffects";
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

// School per class (chronicleproto School): melee classes swing, the rest cast.
const CLASS_SCHOOL: Record<string, number> = { hunter: 2, mage: 6, warlock: 7, shaman: 5, priest: 3, paladin: 3, druid: 8 };
const HEALERS = new Set(["priest", "paladin", "druid", "shaman"]);
const MELEE = new Set(["warrior", "rogue"]);
const BOSS_GUIDS = new Set(["Boss"]);

// Deterministic combat: melee swings, spell hits with cast bars, heals,
// periodic ticks, boss AoE pulses, interrupts, and a few deaths that are
// resurrected later.
function syntheticEffects(players: number): EncounterEffects {
  const events: ReplayEffectEvent[] = [];
  const base = { amount: 1000, crit: false, periodic: false, melee: false, aoe: false, castTimeMs: 0, spellId: 1 };
  for (let index = 0; index < players; index++) {
    const guid = `Player-${index}`;
    const cls = CLASSES[index % CLASSES.length];
    const school = CLASS_SCHOOL[cls] ?? 2;
    const period = MELEE.has(cls) ? 1_500 + (index % 3) * 200 : 2_500 + (index % 4) * 300;
    for (let t = 500 + index * 97; t < DURATION_MS; t += period) {
      const crit = (t / period) % 5 < 1;
      if (MELEE.has(cls)) {
        events.push({ ...base, timestampMs: t, kind: "damage", source: guid, target: "Boss", school: 2, melee: true, crit, spellId: null });
      } else if (HEALERS.has(cls) && index % 2 === 0) {
        const target = `Player-${(index * 7 + Math.floor(t / 1000)) % players}`;
        events.push({ ...base, timestampMs: t - 1_500, kind: "cast_start", source: guid, target, school, castTimeMs: 1_500 });
        events.push({ ...base, timestampMs: t, kind: "cast_go", source: guid, target, school });
        events.push({ ...base, timestampMs: t, kind: "heal", source: guid, target, school, crit });
      } else {
        events.push({ ...base, timestampMs: t - 2_000, kind: "cast_start", source: guid, target: "Boss", school, castTimeMs: 2_000 });
        events.push({ ...base, timestampMs: t, kind: "cast_go", source: guid, target: "Boss", school });
        events.push({ ...base, timestampMs: t, kind: "damage", source: guid, target: "Boss", school, crit });
        events.push({ ...base, timestampMs: t + 1_000, kind: "damage", source: guid, target: "Boss", school, periodic: true });
      }
    }
  }
  for (let t = 4_000; t < DURATION_MS; t += 6_000) {
    events.push({ ...base, timestampMs: t - 2_500, kind: "cast_start", source: "Boss", target: "", school: 4, castTimeMs: 2_500 });
    if (t % 18_000 === 10_000) {
      events.push({ ...base, timestampMs: t - 1_000, kind: "interrupt", source: "Player-3", target: "Boss", school: 2 });
      continue;
    }
    events.push({ ...base, timestampMs: t, kind: "cast_go", source: "Boss", target: "", school: 4, aoe: true });
    for (let index = 0; index < players; index += 3) {
      events.push({ ...base, timestampMs: t, kind: "damage", source: "Boss", target: `Player-${index}`, school: 4 });
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

const FULL_VIEW = { viewport: FULL_MAP_VIEWPORT, key: "full" };

function SyntheticReplay({ players, playbackSpeed, mutedEvery, effects }: { players: number; playbackSpeed: number; mutedEvery: number; effects: boolean }) {
  const [units] = useState(() => syntheticUnits(players));
  const [fx] = useState(() => syntheticEffects(players));
  const [cursorMs, setCursorMs] = useState(0);

  // Mirrors SyncModeContext: coarse 100 ms ticks scaled by playback speed.
  useEffect(() => {
    const id = setInterval(() => setCursorMs((previous) => (previous + 100 * playbackSpeed) % DURATION_MS), 100);
    return () => clearInterval(id);
  }, [playbackSpeed]);

  const markers = units.flatMap((unit, index): MapSceneMarker[] => {
    const sample = latestPositionAt(unit.positions, cursorMs);
    if (!sample) return [];
    return [{
      ...unit,
      sample,
      point: projectSample(sample),
      muted: mutedEvery > 0 && unit.kind === "player" && index % mutedEvery !== 0,
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

/** Hit wobble, beams, cast/AoE rings, interrupts and deaths at 1x. */
export const Effects: Story = {
  args: { players: 10, playbackSpeed: 1, effects: true },
};

/** Effect density: a 40-player raid at 4x speed, capped primitives. */
export const EffectsFortyPlayersAt4x: Story = {
  args: { players: 40, playbackSpeed: 4, effects: true },
};
