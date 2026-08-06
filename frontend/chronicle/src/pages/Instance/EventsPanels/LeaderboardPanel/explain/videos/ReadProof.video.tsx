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

const STEPS: Array<{
  from: number;
  caption: ReactNode;
  regions: Array<{ left: number; top: number; width: number; height: number }>;
}> = [
  {
    from: 20,
    caption: "The header summarizes the run's qualification status",
    regions: [{ left: 1092, top: 188, width: 103, height: 20 }],
  },
  {
    from: 115,
    caption: "Requirements are grouped into Bosses and Trash",
    regions: [
      { left: 85, top: 240, width: 1110, height: 68 },
      { left: 85, top: 336, width: 1110, height: 20 },
    ],
  },
  {
    from: 210,
    caption: "Checks passed; crosses are missing, and ×N is the required count",
    regions: [
      { left: 85, top: 240, width: 1110, height: 68 },
      { left: 85, top: 336, width: 1110, height: 20 },
    ],
  },
];

export default function ReadProofVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Read the speedrun proof"
        bullets={[
          "Requirements are grouped by category",
          "Checks passed; crosses are missing",
          "×N means multiple kills are required",
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
      <VideoHeader title="Read the speedrun proof" entrance={entrance} />
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
