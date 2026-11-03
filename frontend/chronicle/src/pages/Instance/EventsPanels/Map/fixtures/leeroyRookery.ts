import type { VideoTimestamp } from "@/api/typesGenerated";
import type { MapCameraMark } from "../cameraPath";
import leeroyRookeryJson from "./leeroyRookery.json";
import type { MapFixture } from "./mapFixture";

/**
 * The Leeroy Jenkins run into the Rookery (Upper Blackrock Spire, map 229),
 * rebuilt from the 2005 video. Player positions and deaths are per Internet
 * Historian's map (2017), fan approximation: the dots of his "Leeroy Jenkins |
 * Map of the Players" (https://youtu.be/IAOLAw0k2DU) tracked frame by frame
 * and mapped onto the real Rookery. Eggs are real spawns. Built by
 * scripts/leeroy/build-fixture.mjs; see scripts/leeroy/README.md for what is
 * observed, what is his, and what is illustrative.
 */
export const leeroyRookery = leeroyRookeryJson as MapFixture;

/** The guild's own upload of the original video ("A Rough Go - Leeroy Jenkins"). */
export const LEEROY_VIDEO_URL = "https://www.youtube.com/watch?v=jbq5dsQ-l9M";

// The fixture's log clock starts at video 1:24 (annotations.json `clip`).
const CLIP_FROM_VIDEO_SECONDS = 84;
const CLIP_TO_VIDEO_SECONDS = 170;

function clockAt(offsetSeconds: number): string {
  return new Date(Date.parse(leeroyRookery.encounter.startTime) + offsetSeconds * 1000).toISOString().slice(11, 19);
}

/**
 * Sync points for the YouTube overlay: video time to log (UTC) time, one
 * second of video per second of log, so scrubbing either side stays aligned.
 */
export const LEEROY_VIDEO_TIMESTAMPS: readonly VideoTimestamp[] = [CLIP_FROM_VIDEO_SECONDS, CLIP_TO_VIDEO_SECONDS].map((videoSeconds) => {
  const clock = clockAt(videoSeconds - CLIP_FROM_VIDEO_SECONDS);
  return { video_time_seconds: videoSeconds, raw_ocr: "", server_time: clock, utc_time: clock, confidence: 1 };
});

type WorldPoint = [x: number, y: number, z: number];
interface WorldCameraMark { label: string; timestampMs: number; position: WorldPoint; target: WorldPoint }

/**
 * The money shot, in world yards (map 229), following the run on Internet
 * Historian's map: Leeroy alone through the west door and among the eggs, the
 * raid pouring in after him, the pile-in, then the wipe and Anfrony's run for
 * the south-west corner. Shots look in from the south and west (the upper hall
 * blocks the north-east). Timestamps are milliseconds from the clip start
 * (video 1:24).
 */
const LEEROY_CHARGE_WORLD: readonly WorldCameraMark[] = [
  // Below z ~114: the mesh has walkways over the Rookery at z 116-125, and the
  // scene keeps the camera under what is above it.
  { label: "Leeroy at the door", timestampMs: 0, position: [88, -270, 106], target: [108, -258, 92] },
  { label: "Leeroy Jenkins!", timestampMs: 2_600, position: [84, -274, 104], target: [100, -264, 92] },
  { label: "Alone among the eggs", timestampMs: 8_000, position: [66, -250, 108], target: [84, -270, 92] },
  { label: "The raid pours in", timestampMs: 11_000, position: [84, -272, 108], target: [106, -258, 92] },
  { label: "Pile-in", timestampMs: 16_000, position: [64, -252, 110], target: [86, -266, 92] },
  { label: "Wide", timestampMs: 26_000, position: [52, -292, 112], target: [84, -268, 92] },
  { label: "Wipe", timestampMs: 46_000, position: [54, -284, 110], target: [82, -258, 92] },
  { label: "Run for the corner", timestampMs: 56_000, position: [52, -276, 108], target: [60, -246, 96] },
  { label: "At least I have chicken", timestampMs: 86_000, position: [52, -290, 112], target: [82, -262, 92] },
];

/**
 * The charge camera for a ground: scene units follow mapPointToScene on a
 * canvas spanning `bounds` (GROUND_WIDTH 100 across world Y), and heights
 * scale the same way from `baseZ` (the mesh puts world z 0 at scene 0; the
 * flat placeholder puts the Rookery floor there).
 */
export function leeroyChargeCamera(bounds: { minX: number; maxX: number; minY: number; maxY: number }, baseZ: number): MapCameraMark[] {
  const scale = 100 / (bounds.maxY - bounds.minY);
  const toScene = ([x, y, z]: WorldPoint): [number, number, number] => [
    (bounds.maxY - y - (bounds.maxY - bounds.minY) / 2) * scale,
    (z - baseZ) * scale,
    (bounds.maxX - x - (bounds.maxX - bounds.minX) / 2) * scale,
  ];
  return LEEROY_CHARGE_WORLD.map((mark) => ({
    label: mark.label,
    timestampMs: mark.timestampMs,
    position: toScene(mark.position),
    target: toScene(mark.target),
    fov: 45,
    near: 0.05,
    far: 2000,
  }));
}

/** The Rookery floor height: the flat placeholder ground sits here. */
export const LEEROY_FLOOR_Z = 91.5;
