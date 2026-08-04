/**
 * Lesson video: filter what a panel counts.
 *
 * A scripted cursor clicks the header's filter icon, opens the filter menu,
 * flips to the filter editor, clicks the ability-name input, types
 * "Auto Attack", presses Enter (the name commits as a chip), then clicks
 * "Back" — the chart narrows to auto-attack damage and the icon turns green.
 * 500 frames @ 30fps, 1280x720 (50-frame intro + 450 of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type {
  DemoFilterEditorState,
  DemoFilterStage,
} from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "./animation";
import { Cursor, LessonIntro, StepCaption, VideoHeader, VideoStage } from "./shared";

// Measured cursor targets (stage coordinates).
const FILTER_ICON = { x: 262, y: 152 };
const EDIT_FILTERS_ROW = { x: 338, y: 178 };
const INPUT_BOX = { x: 250, y: 279 };
const BACK_BTN = { x: 653, y: 195 };

const TYPED_NAME = "Auto Attack";

const MENU_FRAME = 90; // filter icon clicked → context menu
const EDITOR_FRAME = 150; // "Edit filters" clicked → editor flips open
const INPUT_FRAME = 195; // ability-name input clicked (caret appears)
const TYPE_START = 205; // typing begins…
const TYPE_END = 260; // …last character lands
const ENTER_FRAME = 275; // Enter pressed → chip commits
const APPLY_FRAME = 345; // "Back" clicked → filtered chart

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
          "Type an ability name and press Enter",
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

  // The chip input: characters land one by one, then Enter commits the chip.
  const typedChars = Math.floor(
    interpolate(frame, [TYPE_START, TYPE_END], [0, TYPED_NAME.length], clamp),
  );
  const focused = frame >= INPUT_FRAME && frame < ENTER_FRAME;
  const filterEditor: DemoFilterEditorState = {
    typed: TYPED_NAME.slice(0, typedChars),
    chip: frame >= ENTER_FRAME,
    caret: focused && Math.floor(frame / 16) % 2 === 0,
    enterFlash: interpolate(
      frame,
      [ENTER_FRAME - 6, ENTER_FRAME - 2, ENTER_FRAME + 18, ENTER_FRAME + 28],
      [0, 1, 1, 0],
      clamp,
    ),
  };

  // Cursor: filter icon → Edit filters → input box → Back button → drift clear.
  const cursorX = interpolate(
    frame,
    [26, 80, 100, 136, 160, 190, ENTER_FRAME + 25, ENTER_FRAME + 60, APPLY_FRAME + 20, APPLY_FRAME + 70],
    [1140, FILTER_ICON.x, FILTER_ICON.x, EDIT_FILTERS_ROW.x, EDIT_FILTERS_ROW.x, INPUT_BOX.x, INPUT_BOX.x, BACK_BTN.x, BACK_BTN.x, 1010],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 80, 100, 136, 160, 190, ENTER_FRAME + 25, ENTER_FRAME + 60, APPLY_FRAME + 20, APPLY_FRAME + 70],
    [600, FILTER_ICON.y, FILTER_ICON.y, EDIT_FILTERS_ROW.y, EDIT_FILTERS_ROW.y, INPUT_BOX.y, INPUT_BOX.y, BACK_BTN.y, BACK_BTN.y, 500],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [MENU_FRAME - 4, MENU_FRAME, MENU_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [EDITOR_FRAME - 4, EDITOR_FRAME, EDITOR_FRAME + 10], [0, 1, 0], clamp);
  const click3 = interpolate(frame, [INPUT_FRAME - 4, INPUT_FRAME, INPUT_FRAME + 10], [0, 1, 0], clamp);
  const click4 = interpolate(frame, [APPLY_FRAME - 4, APPLY_FRAME, APPLY_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2, click3, click4);

  const captionOpacity = interpolate(frame, [8, 18, 436, 450], [0, 1, 1, 0], clamp);
  const step = frame >= APPLY_FRAME ? 3 : frame >= EDITOR_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Filter what a panel counts" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo
          filterStage={filterStage}
          filterEditor={filterEditor}
          classIconBasePath="/c/icons"
        />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Only Auto Attack damage remains — the green icon means filters are active"
            : step === 2
              ? "Type an ability name and press Enter to add the filter"
              : "Click the filter icon to open a panel's filter menu"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
