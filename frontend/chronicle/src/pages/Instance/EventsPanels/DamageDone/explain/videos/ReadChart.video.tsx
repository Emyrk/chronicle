/**
 * Lesson video: read the damage chart — sequenced callouts over the demo
 * chart (rows, values, percentages). 300 frames @ 30fps, 1280x720.
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp } from "./animation";
import { StepCaption, VideoHeader, VideoStage } from "./shared";

/** Pulsing highlight ring over a chart region (frame-driven, no CSS animation). */
function RegionHighlight({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Local frame inside the Sequence — pulse twice per second.
  const pulse = 0.5 + 0.5 * Math.sin((frame / fps) * Math.PI * 2);
  const appear = interpolate(frame, [0, 8], [0, 1], clamp);
  return (
    <div
      className="border-class-rogue absolute rounded-md border-2"
      style={{
        left,
        top,
        width,
        height,
        opacity: appear * interpolate(pulse, [0, 1], [0.45, 1]),
        zIndex: 210,
      }}
    />
  );
}

// Regions measured against the settled render: rows at y=193+32*i, x 77-687.
const STEPS: Array<{ from: number; caption: string; region: { left: number; top: number; width: number; height: number } }> = [
  {
    from: 20,
    caption: "Each bar is one player — longer bar, larger share",
    region: { left: 72, top: 188, width: 420, height: 170 },
  },
  {
    from: 115,
    caption: "The number is the value; the percent is their share of the total",
    region: { left: 488, top: 188, width: 204, height: 170 },
  },
  {
    from: 210,
    caption: "Rows are ranked — #1 is your top damage source",
    region: { left: 72, top: 188, width: 120, height: 40 },
  },
];

export default function ReadChartVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  return (
    <VideoStage>
      <VideoHeader title="Read the damage chart" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo classIconBasePath="/c/icons" />
      </main>

      {STEPS.map((step, i) => {
        const until = STEPS[i + 1]?.from ?? 288;
        return (
          <Sequence key={step.from} from={step.from} durationInFrames={until - step.from} premountFor={fps}>
            <RegionHighlight {...step.region} />
            <StepCaption step={i + 1} text={step.caption} opacity={1} />
          </Sequence>
        );
      })}
    </VideoStage>
  );
}
