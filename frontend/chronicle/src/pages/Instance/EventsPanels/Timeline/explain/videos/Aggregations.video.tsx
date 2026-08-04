/**
 * Lesson video: aggregations.
 *
 * The cursor opens the filter menu, clicks "Edit filters" to flip the panel,
 * picks Rolling Avg on the Damage series — flipping back, the line visibly
 * smooths. Ends with three scaled panels side by side: Rolling Avg |
 * Per Second | Cumulative, same data.
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

// Measured cursor targets (stage coordinates).
const FILTER_ICON = { x: 237, y: 152 };
const EDIT_FILTERS_ROW = { x: 324, y: 178 };
const ROLLING_BTN = { x: 271, y: 310 };
const BACK_BTN = { x: 653, y: 155 };

const MENU_FRAME = 85; // filter icon clicked → context menu
const FLIP_FRAME = 140; // "Edit filters" clicked → editor
const PICK_FRAME = 215; // Rolling Avg clicked
const FLIP_BACK_FRAME = 285; // "Back" clicked → chart, line smoothed
const TRIPLE_FRAME = 370; // three panels side by side

const TRIPLE: Array<{ label: string; aggregation: AggregationType }> = [
  { label: "ROLLING AVG (5S)", aggregation: "rolling_avg" },
  { label: "PER SECOND", aggregation: "per_second" },
  { label: "CUMULATIVE", aggregation: "cumulative" },
];

export default function AggregationsVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Rolling avg, per second, cumulative"
        bullets={[
          "'Edit filters' flips the panel",
          "Pick an aggregation per series",
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

  const menuOpen = frame >= MENU_FRAME && frame < FLIP_FRAME;
  const inEditor = frame >= FLIP_FRAME && frame < FLIP_BACK_FRAME;
  const inTriple = frame >= TRIPLE_FRAME;
  const picked = frame >= PICK_FRAME;

  const cursorX = interpolate(
    frame,
    [26, 75, 95, 130, 165, PICK_FRAME - 10, PICK_FRAME + 20, FLIP_BACK_FRAME - 15, FLIP_BACK_FRAME + 40],
    [1140, FILTER_ICON.x, FILTER_ICON.x, EDIT_FILTERS_ROW.x, EDIT_FILTERS_ROW.x, ROLLING_BTN.x, ROLLING_BTN.x, BACK_BTN.x, 1100],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 75, 95, 130, 165, PICK_FRAME - 10, PICK_FRAME + 20, FLIP_BACK_FRAME - 15, FLIP_BACK_FRAME + 40],
    [600, FILTER_ICON.y, FILTER_ICON.y, EDIT_FILTERS_ROW.y, EDIT_FILTERS_ROW.y, ROLLING_BTN.y, ROLLING_BTN.y, BACK_BTN.y, 600],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [MENU_FRAME - 4, MENU_FRAME, MENU_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [FLIP_FRAME - 4, FLIP_FRAME, FLIP_FRAME + 10], [0, 1, 0], clamp);
  const click3 = interpolate(frame, [PICK_FRAME - 4, PICK_FRAME, PICK_FRAME + 10], [0, 1, 0], clamp);
  const click4 = interpolate(frame, [FLIP_BACK_FRAME - 4, FLIP_BACK_FRAME, FLIP_BACK_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2, click3, click4);

  const tripleIn = interpolate(frame, [TRIPLE_FRAME, TRIPLE_FRAME + 16], [0, 1], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 466, 480], [0, 1, 1, 0], clamp);
  const step = inTriple ? 4 : frame >= FLIP_BACK_FRAME ? 3 : frame >= FLIP_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Rolling avg, per second, cumulative" entrance={entrance} />

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
              filterMenu={menuOpen}
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
            ? "Same data, three shapes — rolling for trend, per-second for rates, cumulative for pacing"
            : step === 3
              ? "Click Back — the line reshapes instantly"
              : step === 2
                ? "Pick an aggregation for the series"
                : "Open the filter menu and click 'Edit filters' to flip the panel"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
