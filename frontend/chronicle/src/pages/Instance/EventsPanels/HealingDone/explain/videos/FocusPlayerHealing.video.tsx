/**
 * Lesson video: focus a single healer.
 *
 * The cursor Ctrl+clicks Lightmender's row (a "Ctrl" keycap floats beside
 * the cursor), picks "Focus Lightmender" from the context menu — the panel
 * swaps to their per-spell chart with a Back header — then clicks Back.
 * 470 frames @ 30fps, 1280x720 (50-frame intro card + 420 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { DemoFocusStage } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { PlayerMetricChartHealingDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChartHealing.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Measured cursor targets (stage coordinates).
const LIGHTMENDER_ROW = { x: 300, y: 228 };
const FOCUS_ITEM = { x: 385, y: 254 };
const BACK_BTN = { x: 108, y: 217 };

// The context menu opens where the row was Ctrl+clicked (demo-local coords).
const MENU_AT = { x: LIGHTMENDER_ROW.x - 72 + 4, y: LIGHTMENDER_ROW.y - 132 + 6 };

const MENU_FRAME = 105; // Ctrl+click → row context menu
const FOCUS_FRAME = 195; // "Focus Lightmender" clicked → per-spell view
const BACK_FRAME = 345; // "Back" clicked → roster returns

export default function FocusPlayerHealingVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Focus a single healer"
        bullets={[
          "Ctrl+click a healer row (Cmd on Mac)",
          "Focus swaps the panel to their spells",
          "Back or Esc returns to the roster",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const focusStage: DemoFocusStage =
    frame >= BACK_FRAME ? "idle" : frame >= FOCUS_FRAME ? "focused" : frame >= MENU_FRAME ? "menu" : "idle";

  const cursorX = interpolate(
    frame,
    [26, MENU_FRAME - 15, MENU_FRAME + 25, FOCUS_FRAME - 15, FOCUS_FRAME + 30, BACK_FRAME - 15, BACK_FRAME + 30, BACK_FRAME + 70],
    [1140, LIGHTMENDER_ROW.x, LIGHTMENDER_ROW.x, FOCUS_ITEM.x, FOCUS_ITEM.x, BACK_BTN.x, BACK_BTN.x, 340],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, MENU_FRAME - 15, MENU_FRAME + 25, FOCUS_FRAME - 15, FOCUS_FRAME + 30, BACK_FRAME - 15, BACK_FRAME + 30, BACK_FRAME + 70],
    [600, LIGHTMENDER_ROW.y, LIGHTMENDER_ROW.y, FOCUS_ITEM.y, FOCUS_ITEM.y, BACK_BTN.y, BACK_BTN.y, 430],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [MENU_FRAME - 4, MENU_FRAME, MENU_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [FOCUS_FRAME - 4, FOCUS_FRAME, FOCUS_FRAME + 10], [0, 1, 0], clamp);
  const click3 = interpolate(frame, [BACK_FRAME - 4, BACK_FRAME, BACK_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2, click3);

  // The held "Ctrl" keycap rides beside the cursor through the first click.
  const ctrlFlash = interpolate(frame, [MENU_FRAME - 40, MENU_FRAME - 30, MENU_FRAME + 12, MENU_FRAME + 24], [0, 1, 1, 0], clamp);

  const captionOpacity = interpolate(frame, [8, 18, 406, 420], [0, 1, 1, 0], clamp);
  const step = frame >= BACK_FRAME ? 3 : frame >= FOCUS_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Focus a single healer" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartHealingDemo
          focusStage={focusStage}
          focusMenuAt={MENU_AT}
          classIconBasePath="/c/icons"
        />
      </main>

      {/* Held-modifier keycap riding beside the cursor. */}
      <div
        className="absolute rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] shadow-md"
        style={{ left: cursorX + 18, top: cursorY + 18, opacity: ctrlFlash, zIndex: 220 }}
      >
        Ctrl
      </div>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Back (or Esc) returns to the roster"
            : step === 2
              ? "The panel swaps to Lightmender's spells — with their overheal tails"
              : "Ctrl+click any healer row (Cmd+click on Mac) to open its menu"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
