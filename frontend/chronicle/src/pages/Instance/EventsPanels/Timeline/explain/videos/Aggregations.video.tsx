/**
 * Lesson video: aggregations.
 *
 * Starts on Sum, flips to the back-side editor and clicks Rolling Avg on the
 * Damage series — flipping back, the line visibly smooths. Ends with three
 * scaled panels side by side: Sum | Rolling Avg | Cumulative, same data.
 * 530 frames @ 30fps, 1280x720 (50-frame intro card + 480 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AggregationType } from "@/pages/Instance/EventsPanels/Timeline/timelineTypes";
import { TimelineDemo, TimelineEditorDemo } from "@/pages/Instance/EventsPanels/Timeline/Timeline.demo";
import { DEMO_DAMAGE_SERIES } from "@/pages/Instance/EventsPanels/Timeline/timelineDemoData";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

// Measured: the "Rolling Avg (5s)" button in the editor's aggregation row.
const ROLLING_BTN = { x: 271, y: 310 };

const FLIP_FRAME = 100; // card flips to the editor
const PICK_FRAME = 170; // Rolling Avg clicked
const FLIP_BACK_FRAME = 240; // back on the chart, line smoothed
const TRIPLE_FRAME = 340; // three panels side by side

const TRIPLE: Array<{ label: string; aggregation: AggregationType }> = [
  { label: "SUM", aggregation: "sum" },
  { label: "ROLLING AVG (5S)", aggregation: "rolling_avg" },
  { label: "CUMULATIVE", aggregation: "cumulative" },
];

export default function AggregationsVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Sum, rolling average, cumulative"
        bullets={[
          "Pick an aggregation on the panel's back",
          "The line reshapes instantly",
          "Same data, three different shapes",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const inEditor = frame >= FLIP_FRAME && frame < FLIP_BACK_FRAME;
  const inTriple = frame >= TRIPLE_FRAME;
  const picked = frame >= PICK_FRAME;

  const cursorX = interpolate(
    frame,
    [26, 130, PICK_FRAME + 20, FLIP_BACK_FRAME + 40],
    [1140, ROLLING_BTN.x, ROLLING_BTN.x, 1100],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 130, PICK_FRAME + 20, FLIP_BACK_FRAME + 40],
    [600, ROLLING_BTN.y, ROLLING_BTN.y, 600],
    { ...clamp, easing: entranceEasing },
  );
  const clickPulse = interpolate(frame, [PICK_FRAME - 4, PICK_FRAME, PICK_FRAME + 10], [0, 1, 0], clamp);

  const tripleIn = interpolate(frame, [TRIPLE_FRAME, TRIPLE_FRAME + 16], [0, 1], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 466, 480], [0, 1, 1, 0], clamp);
  const step = inTriple ? 4 : frame >= FLIP_BACK_FRAME ? 3 : frame >= FLIP_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Sum, rolling average, cumulative" entrance={entrance} />

      {!inTriple ? (
        <main
          className="absolute left-[72px] top-[132px]"
          style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
        >
          {inEditor ? (
            <TimelineEditorDemo activeTab={0} tab0Aggregation={picked ? "rolling_avg" : "sum"} />
          ) : (
            <TimelineDemo
              series={[
                {
                  ...DEMO_DAMAGE_SERIES,
                  aggregation: frame >= FLIP_BACK_FRAME ? "rolling_avg" : "sum",
                },
              ]}
            />
          )}
        </main>
      ) : (
        /* Three panels side by side — same data, three aggregations. */
        <main className="absolute left-[34px] top-[150px] flex gap-6" style={{ opacity: tripleIn }}>
          {TRIPLE.map(({ label, aggregation }) => (
            <div key={aggregation} className="flex flex-col gap-2">
              <span className="font-mono text-[12px] font-semibold tracking-[0.12em] text-muted-foreground">
                {label}
              </span>
              <div style={{ transform: "scale(0.61)", transformOrigin: "top left", width: 620 * 0.61, height: 430 * 0.61 }}>
                <TimelineDemo series={[{ ...DEMO_DAMAGE_SERIES, aggregation }]} />
              </div>
            </div>
          ))}
        </main>
      )}

      {!inTriple && <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />}

      <StepCaption
        step={step}
        text={
          step === 4
            ? "Same data, three shapes — sum for detail, rolling for trend, cumulative for pacing"
            : step === 3
              ? "Back on the front — the line reshapes instantly"
              : step === 2
                ? "Flip the card and pick an aggregation for the series"
                : "Sum is the default — exact totals per one-second bucket"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
