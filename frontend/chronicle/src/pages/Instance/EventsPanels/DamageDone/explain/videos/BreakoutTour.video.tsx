/**
 * Lesson video: tour the breakout panel.
 *
 * Shadowmeld's breakout starts pinned; a scripted cursor expands "More
 * detail", flips the min/avg/max toggle, then switches to the By Target tab.
 * 470 frames @ 30fps, 1280x720 (50-frame intro card + 420 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { DemoBreakoutDetail } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "./animation";
import { Cursor, LessonIntro, StepCaption, VideoHeader, VideoStage } from "./shared";

// Shadowmeld's breakout pins as the entrance settles, to the right of the chart.
const BREAKOUT_POS = { x: 706, y: 96 };
const PINNED_PLAYERS = new Map([["player-1", BREAKOUT_POS]]);
const PIN_FRAME = 20; // portaled breakouts skip the chart's entrance fade

// Measured control positions inside the pinned breakout (cursor click targets).
const MORE_DETAIL_BTN = { x: 1006, y: 169 };
const MINMAX_BTN = { x: 1055, y: 170 };
const BY_TARGET_TAB = { x: 799, y: 141 };

const EXPAND_FRAME = 96; // "More detail" clicked
const MINMAX_FRAME = 206; // min/avg/max toggle clicked
const TARGET_FRAME = 316; // "By Target" tab clicked

export default function BreakoutTourVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Inside the breakout panel"
        bullets={[
          "'More detail' expands every hit type",
          "The ↕ toggle shows min / avg / max",
          "'By Target' shows who the damage hit",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  // ── Cursor choreography: More detail → min/avg/max → By Target ──
  const cursorX = interpolate(
    frame,
    [26, 88, 140, 198, 250, 308],
    [1140, MORE_DETAIL_BTN.x, MORE_DETAIL_BTN.x, MINMAX_BTN.x, MINMAX_BTN.x, BY_TARGET_TAB.x],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 88, 140, 198, 250, 308],
    [600, MORE_DETAIL_BTN.y, MORE_DETAIL_BTN.y, MINMAX_BTN.y, MINMAX_BTN.y, BY_TARGET_TAB.y],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [EXPAND_FRAME - 4, EXPAND_FRAME, EXPAND_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [MINMAX_FRAME - 4, MINMAX_FRAME, MINMAX_FRAME + 10], [0, 1, 0], clamp);
  const click3 = interpolate(frame, [TARGET_FRAME - 4, TARGET_FRAME, TARGET_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2, click3);

  // ── Breakout state follows the clicks ──
  const breakoutDetail: DemoBreakoutDetail =
    frame >= TARGET_FRAME
      ? { expanded: true, viewMode: "minmax", tab: "target" }
      : frame >= MINMAX_FRAME
        ? { expanded: true, viewMode: "minmax", tab: "ability" }
        : frame >= EXPAND_FRAME
          ? { expanded: true, viewMode: "percent", tab: "ability" }
          : { expanded: false, tab: "ability" };

  const captionOpacity = interpolate(frame, [8, 18, 398, 412], [0, 1, 1, 0], clamp);
  const step = frame >= TARGET_FRAME ? 3 : frame >= MINMAX_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Inside the breakout panel" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo
          pinnedPlayers={frame >= PIN_FRAME ? PINNED_PLAYERS : undefined}
          breakoutDetail={breakoutDetail}
          classIconBasePath="/c/icons"
        />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "'By Target' breaks the same damage down by who it hit"
            : step === 2
              ? "The ↕ toggle shows min / avg / max damage per hit type"
              : "'More detail' expands every hit type — hits, crits, misses, and more"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
