/**
 * Lesson video: compare heals across two breakouts.
 *
 * Two Resto Druids (Treesong and Glowmoss) are pinned side by side. The
 * cursor hovers Rejuvenation — the row lights up in BOTH breakouts — then
 * clicks Rejuvenation and Regrowth: the shared selection dims other rows
 * and each footer totals exactly the selected heals.
 * 470 frames @ 30fps, 1280x720 (50-frame intro card + 420 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { DemoBreakoutHover } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { PlayerMetricChartHealingDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChartHealing.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

// Both Druids' breakouts stack on the right of the chart.
const POS_1 = { x: 706, y: 84 }; // Treesong (healer-2)
const POS_2 = { x: 706, y: 330 }; // Glowmoss (healer-5)
const PIN_1_FRAME = 32;
const PIN_2_FRAME = 48;

// Measured row centers in the TOP breakout (rows sorted by healing).
const REJUV_ROW = { x: 800, y: 212 };
const REGROWTH_ROW = { x: 800, y: 262 };

const HOVER_REJUV_FRAME = 105;
const CLICK_1_FRAME = 185;
const HOVER_REGROWTH_FRAME = 245;
const CLICK_2_FRAME = 270;
const HOVER_END_FRAME = 330;

export default function CompareHealersVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Compare two healers' spells"
        bullets={[
          "Pin two healers of the same class",
          "Hover a heal to match it everywhere",
          "Click rows to total a selection",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const pinnedPlayers = new Map<string, { x: number; y: number }>();
  if (frame >= PIN_1_FRAME) pinnedPlayers.set("healer-2", POS_1);
  if (frame >= PIN_2_FRAME) pinnedPlayers.set("healer-5", POS_2);

  const hoveredRow =
    frame >= HOVER_END_FRAME
      ? null
      : frame >= HOVER_REGROWTH_FRAME
        ? "Regrowth"
        : frame >= HOVER_REJUV_FRAME
          ? "Rejuvenation"
          : null;
  const selected =
    frame >= CLICK_2_FRAME
      ? ["Rejuvenation", "Regrowth"]
      : frame >= CLICK_1_FRAME
        ? ["Rejuvenation"]
        : [];
  const breakoutHover: DemoBreakoutHover = { rowId: hoveredRow, selected };

  const cursorX = interpolate(
    frame,
    [26, 100, 230, 250, HOVER_END_FRAME, HOVER_END_FRAME + 50],
    [1140, REJUV_ROW.x, REJUV_ROW.x, REGROWTH_ROW.x, REGROWTH_ROW.x, 1150],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 100, 230, 250, HOVER_END_FRAME, HOVER_END_FRAME + 50],
    [600, REJUV_ROW.y, REJUV_ROW.y, REGROWTH_ROW.y, REGROWTH_ROW.y, 620],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [CLICK_1_FRAME - 4, CLICK_1_FRAME, CLICK_1_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [CLICK_2_FRAME - 4, CLICK_2_FRAME, CLICK_2_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2);

  const captionOpacity = interpolate(frame, [8, 18, 406, 420], [0, 1, 1, 0], clamp);
  const step = frame >= CLICK_1_FRAME ? 3 : frame >= HOVER_REJUV_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Compare two healers' spells" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartHealingDemo
          pinnedPlayers={pinnedPlayers.size > 0 ? pinnedPlayers : undefined}
          breakoutHover={breakoutHover}
          classIconBasePath="/c/icons"
        />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Click heals to select — footers total exactly those rows"
            : step === 2
              ? "Hover a heal — it lights up in every open breakout"
              : "Pin two healers of the same class side by side"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
