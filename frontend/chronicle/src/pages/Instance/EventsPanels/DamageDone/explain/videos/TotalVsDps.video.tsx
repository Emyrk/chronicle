/**
 * Lesson video: total damage versus DPS — a scripted cursor flips the
 * Per Second toggle and the chart values change while order holds.
 * 270 frames @ 30fps, 1280x720.
 */

import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp, entranceEasing } from "./animation";
import { Cursor, StepCaption, VideoHeader, VideoStage } from "./shared";

/** Pulsing ring over the demo header's Per second toggle. */
function ToggleHighlight({ highlight }: { highlight: number }) {
  return (
    <div
      className="absolute rounded-lg"
      style={{
        left: 565,
        top: 138,
        width: 122,
        height: 30,
        boxShadow: `0 0 0 ${highlight * 2}px var(--color-class-rogue)`,
        zIndex: 205,
      }}
    />
  );
}

const TOGGLE_FRAME = 120;

export default function TotalVsDpsVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const perSecond = frame >= TOGGLE_FRAME;

  const cursorX = interpolate(frame, [25, 100], [1080, 614], { ...clamp, easing: entranceEasing });
  const cursorY = interpolate(frame, [25, 100], [560, 148], { ...clamp, easing: entranceEasing });
  const clickPulse = interpolate(frame, [108, 116, 128], [0, 1, 0], clamp);
  const toggleHighlight = interpolate(frame, [96, 108, 150, 165], [0, 1, 1, 0], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 250, 264], [0, 1, 1, 0], clamp);

  return (
    <VideoStage>
      <VideoHeader title="Total damage versus DPS" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo classIconBasePath="/c/icons" perSecond={perSecond} />
      </main>

      <ToggleHighlight highlight={toggleHighlight} />
      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={perSecond ? 2 : 1}
        text={
          perSecond
            ? "Same order, new numbers — every value is now per second"
            : "Totals reward time alive; per-second rewards throughput"
        }
        opacity={captionOpacity}
      />
    </VideoStage>
  );
}
