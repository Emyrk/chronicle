/**
 * Lesson video: the quick filters.
 *
 * The cursor clicks the source filter, types "Ragnaros" (the list narrows as
 * each character lands), clears it with the ×, then types "Chain Heal" into
 * the ability filter.
 * 530 frames @ 30fps, 1280x720 (50-frame intro card + 480 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AllActivityDemo } from "@/pages/Instance/EventsPanels/AllActivity/AllActivity.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Measured cursor targets (stage coordinates).
const SOURCE_INPUT = { x: 756, y: 193 };
const SOURCE_CLEAR = { x: 808, y: 193 };
const ABILITY_INPUT = { x: 892, y: 193 };

const SOURCE_NAME = "Ragnaros";
const ABILITY_NAME = "Chain Heal";

const FOCUS_SOURCE = 95; // source input clicked → caret
const TYPE_SOURCE_START = 105;
const TYPE_SOURCE_END = 160; // "Ragnaros" fully typed
const CLEAR_FRAME = 260; // × clicked → filter clears
const FOCUS_ABILITY = 300; // ability input clicked
const TYPE_ABILITY_START = 310;
const TYPE_ABILITY_END = 375; // "Chain Heal" fully typed

export default function QuickFiltersVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Quick filters"
        bullets={[
          "Filter by source, ability, or target",
          "The list narrows as you type",
          "The × clears a filter instantly",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const sourceChars = Math.floor(interpolate(frame, [TYPE_SOURCE_START, TYPE_SOURCE_END], [0, SOURCE_NAME.length], clamp));
  const sourceTyped = frame >= CLEAR_FRAME ? "" : SOURCE_NAME.slice(0, sourceChars);
  const abilityChars = Math.floor(interpolate(frame, [TYPE_ABILITY_START, TYPE_ABILITY_END], [0, ABILITY_NAME.length], clamp));
  const abilityTyped = ABILITY_NAME.slice(0, abilityChars);

  const caret = frame >= FOCUS_ABILITY ? ("ability" as const) : frame >= FOCUS_SOURCE && frame < CLEAR_FRAME ? ("source" as const) : undefined;

  const cursorX = interpolate(
    frame,
    [26, FOCUS_SOURCE - 10, CLEAR_FRAME - 25, CLEAR_FRAME + 10, FOCUS_ABILITY - 10, TYPE_ABILITY_END + 30, TYPE_ABILITY_END + 80],
    [1140, SOURCE_INPUT.x, SOURCE_CLEAR.x, SOURCE_CLEAR.x, ABILITY_INPUT.x, ABILITY_INPUT.x, 620],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, FOCUS_SOURCE - 10, CLEAR_FRAME - 25, CLEAR_FRAME + 10, FOCUS_ABILITY - 10, TYPE_ABILITY_END + 30, TYPE_ABILITY_END + 80],
    [600, SOURCE_INPUT.y, SOURCE_CLEAR.y, SOURCE_CLEAR.y, ABILITY_INPUT.y, ABILITY_INPUT.y, 430],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [FOCUS_SOURCE - 4, FOCUS_SOURCE, FOCUS_SOURCE + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [CLEAR_FRAME - 4, CLEAR_FRAME, CLEAR_FRAME + 10], [0, 1, 0], clamp);
  const click3 = interpolate(frame, [FOCUS_ABILITY - 4, FOCUS_ABILITY, FOCUS_ABILITY + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2, click3);

  const captionOpacity = interpolate(frame, [8, 18, 466, 480], [0, 1, 1, 0], clamp);
  const step = frame >= FOCUS_ABILITY ? 3 : frame >= CLEAR_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Quick filters" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <AllActivityDemo
          sourceTyped={sourceTyped}
          abilityTyped={abilityTyped}
          caret={caret}
          caretOn={Math.floor(frame / 16) % 2 === 0}
        />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "The ability filter works the same — filters stack with each other"
            : step === 2
              ? "The × clears a filter instantly"
              : "Type into a quick filter — the list narrows as you type"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
