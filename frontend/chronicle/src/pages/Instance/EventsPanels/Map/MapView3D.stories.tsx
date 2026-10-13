import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { MapPositionSample } from "./map.processor";
import { latestPositionAt, type MapPoint } from "./mapModel";
import MapView3D from "./MapView3D";
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

function SyntheticReplay({ players, playbackSpeed, mutedEvery }: { players: number; playbackSpeed: number; mutedEvery: number }) {
  const [units] = useState(() => syntheticUnits(players));
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
        onUnavailable={() => console.warn("WebGL unavailable")}
      />
    </div>
  );
}

const meta = {
  title: "Instance/Map/MapView3D",
  component: SyntheticReplay,
  parameters: { layout: "centered" },
  args: { players: 40, playbackSpeed: 4, mutedEvery: 0 },
} satisfies Meta<typeof SyntheticReplay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FortyPlayersAt4x: Story = {};

export const WithSelection: Story = {
  args: { players: 20, playbackSpeed: 1, mutedEvery: 3 },
};
