/**
 * Lesson video: read the damage chart — sequenced callouts over the demo
 * chart (rows, values, percentages). 350 frames @ 30fps, 1280x720
 * (50-frame intro card + 300 frames of content).
 */

import type { ReactNode } from "react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { INTRO_FRAMES } from "./animation";
import { LessonIntro, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "./shared";

const YELLOW = "var(--color-class-rogue)";
const BLUE = "var(--color-class-shaman)";

interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
}

// Regions measured against the settled render: rows at y=211+32*i, x 77-687;
// value column x 540-620, percent column x 619-681.
const STEPS: Array<{ from: number; caption: ReactNode; regions: Region[] }> = [
  {
    from: 20,
    caption: "Each bar is one player, colored by class — longer bar, larger share",
    regions: [{ left: 72, top: 206, width: 472, height: 170 }],
  },
  {
    from: 115,
    caption: (
      <>
        The number is the <span style={{ color: YELLOW }}>value</span>; the{" "}
        <span style={{ color: BLUE }}>percent</span> is their share of the total
      </>
    ),
    regions: [
      { left: 538, top: 208, width: 82, height: 164, color: YELLOW },
      { left: 621, top: 208, width: 60, height: 164, color: BLUE },
    ],
  },
  {
    from: 210,
    caption: "Rows are ranked — #1 is your top damage source",
    regions: [{ left: 73, top: 208, width: 618, height: 36 }],
  },
];

export default function ReadChartVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Read the damage chart"
        bullets={[
          "Bars are players, colored by class",
          "Values and their share of the total",
          "Rows are ranked by damage",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  return (
    <>
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
            {step.regions.map((region, r) => (
              <RegionHighlight key={r} {...region} />
            ))}
            <StepCaption step={i + 1} text={step.caption} opacity={1} />
          </Sequence>
        );
      })}
    </>
  );
}
