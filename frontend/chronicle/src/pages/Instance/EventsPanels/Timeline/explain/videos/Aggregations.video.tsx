/**
 * Lesson video: aggregations. The same damage data morphs through Sum →
 * Rolling Average → Cumulative (applied via the panel's real aggregation
 * registry).
 * 470 frames @ 30fps, 1280x720 (50-frame intro card + 420 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AggregationType } from "@/pages/Instance/EventsPanels/Timeline/timelineTypes";
import { TimelineDemo } from "@/pages/Instance/EventsPanels/Timeline/Timeline.demo";
import { DEMO_DAMAGE_SERIES } from "@/pages/Instance/EventsPanels/Timeline/timelineDemoData";
import { clamp, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  LessonIntro,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const ROLLING_FRAME = 150;
const CUMULATIVE_FRAME = 290;

const MODE_LABEL: Record<string, string> = {
  sum: "Sum",
  rolling_avg: "Rolling Avg (5s)",
  cumulative: "Cumulative",
};

export default function AggregationsVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Sum, rolling average, cumulative"
        bullets={[
          "Sum: exact totals per bucket",
          "Rolling average smooths the spikes",
          "Cumulative climbs to the fight total",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const aggregation: AggregationType =
    frame >= CUMULATIVE_FRAME ? "cumulative" : frame >= ROLLING_FRAME ? "rolling_avg" : "sum";

  const captionOpacity = interpolate(frame, [8, 18, 406, 420], [0, 1, 1, 0], clamp);
  const step = frame >= CUMULATIVE_FRAME ? 3 : frame >= ROLLING_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Sum, rolling average, cumulative" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <TimelineDemo series={[{ ...DEMO_DAMAGE_SERIES, aggregation }]} />
      </main>

      {/* Current aggregation, as it appears in the back-side editor. */}
      <div
        className="absolute rounded bg-primary/20 px-2.5 py-1 font-mono text-[13px] font-medium text-primary"
        style={{ left: 132, top: 186, opacity: entrance }}
      >
        {MODE_LABEL[aggregation]}
      </div>

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Cumulative climbs to the fight total — great for pacing comparisons"
            : step === 2
              ? "Rolling average smooths the spikes to show the trend"
              : "Sum shows the exact total per one-second bucket — set per series on the panel's back"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
