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

const BLUE = "var(--color-class-shaman)";
const STEPS: Array<{
  from: number;
  caption: ReactNode;
  regions: Array<{ left: number; top: number; width: number; height: number; color?: string }>;
}> = [
  {
    from: 20,
    caption: "Compare current parser and addon versions with the minimums",
    regions: [{ left: 85, top: 368, width: 1110, height: 53, color: BLUE }],
  },
  {
    from: 115,
    caption: "The data source must support trusted speedrun timing",
    regions: [{ left: 85, top: 433, width: 1110, height: 29, color: BLUE }],
  },
  {
    from: 210,
    caption: "DPS Rankings confirms whether player ranking data was recorded",
    regions: [{ left: 85, top: 474, width: 1110, height: 29, color: BLUE }],
  },
];

export default function EligibilityChecksVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Check leaderboard eligibility"
        bullets={[
          "Tooling versions meet their minimums",
          "The log has an eligible data source",
          "DPS rankings were recorded",
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
      <VideoHeader title="Check leaderboard eligibility" entrance={entrance} />
      <main
        className="absolute left-[72px] top-[132px]"
        style={{
          opacity: entrance,
          translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px`,
        }}
      >
        <LeaderboardVideoDemo />
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
