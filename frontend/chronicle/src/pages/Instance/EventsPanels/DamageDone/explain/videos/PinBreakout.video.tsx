/**
 * Lesson video: open and pin a player breakout.
 *
 * Ported from videos/damage-done-breakout/src/Composition.tsx — a scripted
 * cursor tracks to a player row, clicks, and the real breakout pins.
 * 240 frames @ 30fps, 1280x720.
 */

import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp, entranceEasing } from "./animation";
import { Cursor, StepCaption, VideoHeader } from "./shared";

export default function PinBreakoutVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pinned = frame >= 112;
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const cursorX = interpolate(frame, [20, 92], [1110, 540], { ...clamp, easing: entranceEasing });
  const cursorY = interpolate(frame, [20, 92], [590, 342], { ...clamp, easing: entranceEasing });
  const clickPulse = interpolate(frame, [100, 106, 116], [0, 1, 0], clamp);
  const instructionOpacity = interpolate(frame, [8, 18, 218, 232], [0, 1, 1, 0], clamp);

  return (
    <AbsoluteFill className="dark pointer-events-none select-none overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_38%)]" />
      <VideoHeader title="Open a Damage Done breakout" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo
          pinnedPlayerId={pinned ? "player-4" : undefined}
          classIconBasePath="/c/icons"
        />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={pinned ? 2 : 1}
        text={
          pinned
            ? "The real breakout is now pinned and draggable"
            : "Click a player row to pin its ability breakout"
        }
        opacity={instructionOpacity}
      />
    </AbsoluteFill>
  );
}
