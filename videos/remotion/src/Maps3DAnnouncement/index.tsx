import { AbsoluteFill, Sequence } from "remotion";
import { IntroScene } from "./IntroScene";
import { MapRevealScene } from "./MapRevealScene";
import { WalkingScene } from "./WalkingScene";
import { CombatScene } from "./CombatScene";
import { PanelsScene } from "./PanelsScene";
import { FinaleScene } from "./FinaleScene";

export const MAPS_3D_ANNOUNCEMENT_DURATION = 1052;

export default function Maps3DAnnouncement() {
  return (
    <AbsoluteFill className="bg-[#06080d]">
      <Sequence durationInFrames={145} name="Announcement"><IntroScene /></Sequence>
      <Sequence from={135} durationInFrames={270} name="3D view"><MapRevealScene /></Sequence>
      <Sequence from={395} durationInFrames={150} name="Walking mode"><WalkingScene /></Sequence>
      <Sequence from={535} durationInFrames={237} name="Knockback in context"><CombatScene /></Sequence>
      <Sequence from={762} durationInFrames={200} name="Panels"><PanelsScene /></Sequence>
      <Sequence from={952} durationInFrames={100} name="Finale"><FinaleScene /></Sequence>
    </AbsoluteFill>
  );
}
