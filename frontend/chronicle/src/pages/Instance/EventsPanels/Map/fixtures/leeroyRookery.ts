import type { VideoTimestamp } from "@/api/typesGenerated";
import type { MapCameraMark } from "../cameraPath";
import leeroyRookeryJson from "./leeroyRookery.json";
import type { MapFixture } from "./mapFixture";

/**
 * The Leeroy Jenkins charge into the Rookery (Upper Blackrock Spire, map 229),
 * rebuilt from the 2005 video: hand keyframes from frame annotations, real egg
 * spawns, observed death times. Built by scripts/leeroy/build-fixture.mjs;
 * see scripts/leeroy/README.md for what is observed and what is not.
 */
export const leeroyRookery = leeroyRookeryJson as MapFixture;

/** The guild's own upload of the original video ("A Rough Go - Leeroy Jenkins"). */
export const LEEROY_VIDEO_URL = "https://www.youtube.com/watch?v=jbq5dsQ-l9M";

// The fixture's log clock starts at video 1:28 (annotations.json `clip`).
const CLIP_FROM_VIDEO_SECONDS = 88;
const CLIP_TO_VIDEO_SECONDS = 140;

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
 * The money shot, in world yards (map 229): over the raid at the top of the
 * Hall of Binding's stairs, down to the terrace as Leeroy runs past, low among
 * the eggs as he lands in them, then up and wide over the pile-in. Shots look
 * in from the south and west (the upper hall blocks the north-east).
 * Timestamps are milliseconds from the clip start (video 1:28).
 */
const LEEROY_CHARGE_WORLD: readonly WorldCameraMark[] = [
  { label: "Planning", timestampMs: 0, position: [116, -298, 150], target: [131, -313, 111] },
  { label: "Alright chums", timestampMs: 4_600, position: [116, -300, 138], target: [129, -314, 110] },
  { label: "Leeroy at the door", timestampMs: 6_800, position: [100, -298, 126], target: [114, -314, 106] },
  { label: "Into the eggs", timestampMs: 9_200, position: [83, -297, 101], target: [98, -312, 92] },
  { label: "Pile-in", timestampMs: 13_000, position: [79, -325, 105], target: [95, -310, 92] },
  { label: "Wide", timestampMs: 21_000, position: [58, -288, 136], target: [92, -312, 92] },
  { label: "Wipe", timestampMs: 44_000, position: [70, -298, 118], target: [90, -318, 92] },
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
