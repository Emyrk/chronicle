import { AbsoluteFill, Sequence } from "remotion";
import { Backdrop } from "./shared";
import { IntroScene } from "./IntroScene";
import { CompareScene } from "./CompareScene";
import { FilterScene } from "./FilterScene";
import { FinaleScene } from "./FinaleScene";

export default function PerformanceHistoryPromo() {
  return (
    <AbsoluteFill>
      <Backdrop />
      <Sequence durationInFrames={155} name="Introduction"><IntroScene /></Sequence>
      <Sequence from={135} durationInFrames={190} name="Compare players"><CompareScene /></Sequence>
      <Sequence from={305} durationInFrames={180} name="Filter and share"><FilterScene /></Sequence>
      <Sequence from={465} durationInFrames={155} name="Finale"><FinaleScene /></Sequence>
    </AbsoluteFill>
  );
}
