/**
 * Lesson video: the panel's advanced filters.
 *
 * A scripted cursor clicks the header's filter icon, opens the filter menu,
 * flips to the filter editor, types "Lava Burst" as an ability-name chip,
 * presses Enter, then clicks "Back" — only Lava Burst events remain and the
 * filter icon turns green.
 * 500 frames @ 30fps, 1280x720 (50-frame intro card + 450 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { DemoFilterEditorState, DemoFilterStage } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { AllActivityDemo } from "@/pages/Instance/EventsPanels/AllActivity/AllActivity.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Measured cursor targets (stage coordinates).
const FILTER_ICON = { x: 240, y: 152 };
const EDIT_FILTERS_ROW = { x: 338, y: 178 };
const INPUT_BOX = { x: 300, y: 239 };
const BACK_BTN = { x: 1169, y: 155 };

const TYPED_NAME = "Lava Burst";

const MENU_FRAME = 90; // filter icon clicked → context menu
const EDITOR_FRAME = 150; // "Edit filters" clicked → editor flips open
const INPUT_FRAME = 195; // ability-name input clicked (caret appears)
const TYPE_START = 205;
const TYPE_END = 255;
const ENTER_FRAME = 275; // Enter pressed → chip commits
const APPLY_FRAME = 345; // "Back" clicked → filtered list

export default function AdvancedFiltersVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Advanced panel filters"
        bullets={[
          "The filter icon opens the full editor",
          "Filter by ability, source, or time range",
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
    frame >= APPLY_FRAME ? "filtered" : frame >= EDITOR_FRAME ? "editor" : frame >= MENU_FRAME ? "menu" : "idle";

  const typedChars = Math.floor(interpolate(frame, [TYPE_START, TYPE_END], [0, TYPED_NAME.length], clamp));
  const focused = frame >= INPUT_FRAME && frame < ENTER_FRAME;
  const filterEditor: DemoFilterEditorState = {
    typed: TYPED_NAME.slice(0, typedChars),
    chip: frame >= ENTER_FRAME,
    caret: focused && Math.floor(frame / 16) % 2 === 0,
    enterFlash: interpolate(frame, [ENTER_FRAME - 6, ENTER_FRAME - 2, ENTER_FRAME + 18, ENTER_FRAME + 28], [0, 1, 1, 0], clamp),
  };

  const cursorX = interpolate(
    frame,
    [26, 80, 100, 136, 160, 190, ENTER_FRAME + 25, ENTER_FRAME + 60, APPLY_FRAME + 20, APPLY_FRAME + 70],
    [1140, FILTER_ICON.x, FILTER_ICON.x, EDIT_FILTERS_ROW.x, EDIT_FILTERS_ROW.x, INPUT_BOX.x, INPUT_BOX.x, BACK_BTN.x, BACK_BTN.x, 900],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 80, 100, 136, 160, 190, ENTER_FRAME + 25, ENTER_FRAME + 60, APPLY_FRAME + 20, APPLY_FRAME + 70],
    [600, FILTER_ICON.y, FILTER_ICON.y, EDIT_FILTERS_ROW.y, EDIT_FILTERS_ROW.y, INPUT_BOX.y, INPUT_BOX.y, BACK_BTN.y, BACK_BTN.y, 480],
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
      <VideoHeader title="Advanced panel filters" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <AllActivityDemo filterStage={filterStage} filterEditor={filterEditor} />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Only Lava Burst events remain — the green icon means filters are active"
            : step === 2
              ? "Type an ability name and press Enter to add the filter"
              : "Click the filter icon to open the panel's filter menu"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
