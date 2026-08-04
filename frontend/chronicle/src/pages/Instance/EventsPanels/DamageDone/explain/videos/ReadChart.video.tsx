/**
 * Lesson video: read the damage chart — sequenced callouts over the demo
 * chart (rows, values, percentages). 300 frames @ 30fps, 1280x720.
 */

import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp } from "./animation";
import { StepCaption, VideoHeader } from "./shared";

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

const STEPS: Array<{ from: number; caption: string; region: { left: number; top: number; width: number; height: number } }> = [
  {
    from: 20,
    caption: "Each bar is one player — longer bar, larger share",
    region: { left: 90, top: 218, width: 420, height: 190 },
  },
  {
    from: 115,
    caption: "The number is the value; the percent is their share of the total",
    region: { left: 480, top: 218, width: 200, height: 190 },
  },
  {
    from: 210,
    caption: "Rows are ranked — #1 is your top damage source",
    region: { left: 90, top: 218, width: 130, height: 40 },
  },
];

export default function ReadChartVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  return (
    <AbsoluteFill className="dark pointer-events-none select-none overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_38%)]" />
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
    </AbsoluteFill>
  );
}
