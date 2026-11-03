/**
 * Explainer content for the Map panel: the "?" opens what it shows, tips,
 * and the replay map legend (the same legend as /map-legend in Tools & FAQ).
 */

import { MapLegend } from "@/pages/MapLegend/MapLegend";
import type { PanelExplainer } from "../../PanelExplainer/types";

export const mapExplainer: PanelExplainer = {
  summary:
    "Replays the fight on the instance's map, in 3D on the real dungeon where Chronicle has it. " +
    "Every unit is a token on the ground; combat plays out as bolts, hits, rings and floating text, " +
    "and the raid frames, meters and unit frames sit over the map.",

  tips: [
    "Click a unit (on the map or in the raid frames) to select it; its target and its target's target get frames and lines",
    "Pin a unit frame to keep it as a box you can drag anywhere",
    "Press G over the map to walk around in the fight; WASD moves, Space jumps",
    "Render video (in the panel's title row, on a boss fight in the 3D map) films the whole fight with an automatic drone camera: a high, wide opening that eases down onto the fight, then a slow orbit that keeps the boss and most of the raid in frame. It is encoded to a 1080p MP4 in your browser (only the 3D scene, not the frames or meters over it); keep the tab open while it renders",
    "Map settings (the gear) turns effects, cast icons, health bars and the 3D map on and off",
    "On the Summary the map is a mini map: just the replay, without frames or settings. With Replay off it plays the fight (or, with Watch the run, the whole run) on a loop by itself; Expand opens the full Map layout",
  ],

  guide: { title: "Map legend", href: "/map-legend", render: () => <MapLegend /> },
};
