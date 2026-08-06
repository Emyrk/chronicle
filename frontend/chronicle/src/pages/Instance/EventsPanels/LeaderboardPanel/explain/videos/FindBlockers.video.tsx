import type { ReactNode } from "react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";
import { LeaderboardVideoDemo } from "../LeaderboardVideoDemo";
import { BLOCKED_FIXTURE_SPEEDRUN } from "../fixture";

const RED = "var(--color-destructive)";
const STEPS: Array<{
  from: number;
  caption: ReactNode;
  regions: Array<{ left: number; top: number; width: number; height: number; color?: string }>;
}> = [
  {
    from: 20,
    caption: "Start with the Incomplete counter: six of eight proof checks passed",
    regions: [{ left: 1099.5, top: 190, width: 95.5, height: 16, color: RED }],
  },
  {
    from: 115,
    caption: "Scan the proof and eligibility rows for crosses",
    regions: [
      { left: 85, top: 240, width: 1110, height: 44, color: RED },
      { left: 85, top: 312, width: 1110, height: 20, color: RED },
      { left: 85, top: 344, width: 1110, height: 53, color: RED },
    ],
  },
  {
    from: 210,
    caption: "Level violations name the player and their recorded level",
    regions: [{ left: 85, top: 491, width: 1110, height: 49, color: RED }],
  },
];

export default function FindBlockersVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Find qualification blockers"
        bullets={[
          "Start with the Incomplete counter",
          "Scan every cross for the failed check",
          "Level violations name the player",
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
      <VideoHeader title="Find qualification blockers" entrance={entrance} />
      <main
        className="absolute left-[72px] top-[132px]"
        style={{
          opacity: entrance,
          translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px`,
        }}
      >
        <LeaderboardVideoDemo speedrun={BLOCKED_FIXTURE_SPEEDRUN} />
      </main>
      {STEPS.map((step, index) => {
        const until = STEPS[index + 1]?.from ?? 288;
        return (
          <Sequence
            key={step.from}
            from={step.from}
            durationInFrames={until - step.from}
            premountFor={fps}
          >
            {step.regions.map((region, regionIndex) => (
              <RegionHighlight key={regionIndex} {...region} />
            ))}
            <StepCaption step={index + 1} text={step.caption} opacity={1} />
          </Sequence>
        );
      })}
    </>
  );
}
