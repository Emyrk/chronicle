/**
 * Lesson video: filter what a panel counts.
 *
 * A scripted cursor clicks the header's filter icon, opens the filter menu,
 * peeks at the filter editor (one "Ability Name: Auto Attack" filter), then
 * closes it — the chart narrows to auto-attack damage and the icon turns
 * green. 440 frames @ 30fps, 1280x720 (50-frame intro + 390 of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { DemoFilterStage } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "./animation";
import { Cursor, LessonIntro, StepCaption, VideoHeader, VideoStage } from "./shared";

// Measured cursor targets (stage coordinates).
const FILTER_ICON = { x: 262, y: 152 };
const EDIT_FILTERS_ROW = { x: 338, y: 178 };
const EDITOR_CLOSE = { x: 672, y: 191 };

const MENU_FRAME = 90; // filter icon clicked → context menu
const EDITOR_FRAME = 150; // "Edit filters" clicked → editor flips open
const APPLY_FRAME = 285; // editor closed → filtered chart

export default function FiltersVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Filter what a panel counts"
        bullets={[
          "The filter icon opens each panel's filters",
          "Filter by ability, hit type, source, or time",
          "Active filters turn the icon green",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const filterStage: DemoFilterStage =
    frame >= APPLY_FRAME
      ? "filtered"
      : frame >= EDITOR_FRAME
        ? "editor"
        : frame >= MENU_FRAME
          ? "menu"
          : "idle";

  // Cursor: filter icon → Edit filters row → editor close → drift clear of the chart.
  const cursorX = interpolate(
    frame,
    [26, 80, 100, 136, 190, 262, APPLY_FRAME + 20, APPLY_FRAME + 70],
    [1140, FILTER_ICON.x, FILTER_ICON.x, EDIT_FILTERS_ROW.x, EDIT_FILTERS_ROW.x, EDITOR_CLOSE.x, EDITOR_CLOSE.x, 1010],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 80, 100, 136, 190, 262, APPLY_FRAME + 20, APPLY_FRAME + 70],
    [600, FILTER_ICON.y, FILTER_ICON.y, EDIT_FILTERS_ROW.y, EDIT_FILTERS_ROW.y, EDITOR_CLOSE.y, EDITOR_CLOSE.y, 500],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [MENU_FRAME - 4, MENU_FRAME, MENU_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [EDITOR_FRAME - 4, EDITOR_FRAME, EDITOR_FRAME + 10], [0, 1, 0], clamp);
  const click3 = interpolate(frame, [APPLY_FRAME - 4, APPLY_FRAME, APPLY_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2, click3);

  const captionOpacity = interpolate(frame, [8, 18, 376, 390], [0, 1, 1, 0], clamp);
  const step = frame >= APPLY_FRAME ? 3 : frame >= EDITOR_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Filter what a panel counts" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo filterStage={filterStage} classIconBasePath="/c/icons" />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Only Auto Attack damage remains — the green icon means filters are active"
            : step === 2
              ? "Filter by ability, school, hit type, source, target, or time range"
              : "Click the filter icon to open a panel's filter menu"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
