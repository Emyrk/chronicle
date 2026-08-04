/**
 * Lesson video: read the healing chart — bars are effective healing, the pale
 * tail on each bar is overheal, a striped end cap means the overheal ran off
 * the chart, and the value/percent columns.
 * 410 frames @ 30fps, 1280x720 (50-frame intro card + 360 frames of content).
 */

import type { ReactNode } from "react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartHealingDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChartHealing.demo";
import { INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const YELLOW = "var(--color-class-rogue)";
const BLUE = "var(--color-class-shaman)";

interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
}

// Regions measured against the settled render: rows at y=211+32*i, x 77-687.
const STEPS: Array<{ from: number; caption: ReactNode; regions: Region[] }> = [
  {
    from: 20,
    caption: "Each bar is one healer — effective healing, colored by class",
    regions: [{ left: 72, top: 206, width: 472, height: 170 }],
  },
  {
    from: 105,
    caption: (
      <>
        The <span style={{ color: YELLOW }}>pale tail</span> on each bar is overheal — healing
        that overflowed
      </>
    ),
    regions: [
      // Every overheal tail, measured from the rendered stacked segments.
      { left: 531, top: 210, width: 85, height: 36, color: YELLOW },
      { left: 474, top: 242, width: 216, height: 36, color: YELLOW },
      { left: 445, top: 274, width: 71, height: 36, color: YELLOW },
      { left: 417, top: 306, width: 39, height: 36, color: YELLOW },
      { left: 338, top: 338, width: 114, height: 36, color: YELLOW },
      { left: 156, top: 182, width: 130, height: 20, color: YELLOW },
    ],
  },
  {
    from: 190,
    caption: (
      <>
        A <span style={{ color: YELLOW }}>striped end</span> means the overheal ran off the
        chart — there was more than the bar can show
      </>
    ),
    regions: [{ left: 664, top: 242, width: 30, height: 36, color: YELLOW }],
  },
  {
    from: 275,
    caption: (
      <>
        The number is <span style={{ color: BLUE }}>effective healing</span>; the percent is
        their share of the total
      </>
    ),
    regions: [
      { left: 498, top: 208, width: 80, height: 164, color: BLUE },
      { left: 572, top: 208, width: 68, height: 164, color: BLUE },
    ],
  },
];

export default function ReadHealingChartVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Read the healing chart"
        bullets={[
          "Bars are effective healing by healer",
          "The pale tail on a bar is overheal",
          "Stripes mean it ran off the chart",
          "Values and their share of the total",
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
      <VideoHeader title="Read the healing chart" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartHealingDemo classIconBasePath="/c/icons" />
      </main>

      {STEPS.map((step, i) => {
        const until = STEPS[i + 1]?.from ?? 348;
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
