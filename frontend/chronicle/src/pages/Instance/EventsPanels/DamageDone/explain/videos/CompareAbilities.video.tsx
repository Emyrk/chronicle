/**
 * Lesson video: compare abilities across two breakouts.
 *
 * Two Fury Warriors (Ragesmash and Gorehowl) are pinned side by side. The
 * cursor hovers Bloodthirst — the row lights up in BOTH breakouts — then
 * clicks Bloodthirst and Whirlwind: the shared selection dims other rows and
 * each footer totals exactly the selected abilities.
 * 470 frames @ 30fps, 1280x720 (50-frame intro card + 420 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type {
  DemoBreakoutHover,
  DemoExtraPlayer,
} from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "./animation";
import { Cursor, LessonIntro, StepCaption, VideoHeader, VideoStage } from "./shared";

/** A second Fury Warrior whose rotation leans on Auto Attack over Bloodthirst. */
const GOREHOWL: DemoExtraPlayer = {
  player: {
    playerID: "player-6",
    playerName: "Gorehowl",
    className: "Warrior",
    specialization: "Fury",
    value: 96_000,
  },
  abilities: [
    { name: "Auto Attack", totalDamage: 41_000, hitCount: 133, critCount: 31, missCount: 10, dodgeCount: 4, immuneCount: 0, parryCount: 3, otherCount: 4 },
    { name: "Bloodthirst", totalDamage: 31_000, hitCount: 30, critCount: 8, missCount: 3, dodgeCount: 1, immuneCount: 0, parryCount: 1, otherCount: 0 },
    { name: "Whirlwind", totalDamage: 24_000, hitCount: 26, critCount: 9, missCount: 2, dodgeCount: 1, immuneCount: 0, parryCount: 0, otherCount: 0 },
  ],
};
const EXTRA_PLAYERS = [GOREHOWL];

// Both warriors' breakouts stack on the right of the chart.
const POS_1 = { x: 706, y: 84 }; // Ragesmash (player-2)
const POS_2 = { x: 706, y: 330 }; // Gorehowl (player-6)
const PIN_1_FRAME = 32;
const PIN_2_FRAME = 48;

// Measured row centers in the TOP breakout (rows sorted by damage).
const BLOODTHIRST_ROW = { x: 800, y: 212 };
const WHIRLWIND_ROW = { x: 800, y: 262 };

const HOVER_BT_FRAME = 105; // Bloodthirst hovered (both tables light up)
const CLICK_1_FRAME = 185; // Bloodthirst selected
const HOVER_WW_FRAME = 245; // Whirlwind hovered
const CLICK_2_FRAME = 270; // Whirlwind added to the selection
const HOVER_END_FRAME = 330; // hover clears; the selection stays

export default function CompareAbilitiesVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Compare two players' abilities"
        bullets={[
          "Pin two players of the same class",
          "Hover an ability to match it everywhere",
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
  if (frame >= PIN_1_FRAME) pinnedPlayers.set("player-2", POS_1);
  if (frame >= PIN_2_FRAME) pinnedPlayers.set("player-6", POS_2);

  // Shared hover/selection, exactly as BreakoutHoverProvider syncs it live.
  const hoveredRow =
    frame >= HOVER_END_FRAME
      ? null
      : frame >= HOVER_WW_FRAME
        ? "Whirlwind"
        : frame >= HOVER_BT_FRAME
          ? "Bloodthirst"
          : null;
  const selected =
    frame >= CLICK_2_FRAME
      ? ["Bloodthirst", "Whirlwind"]
      : frame >= CLICK_1_FRAME
        ? ["Bloodthirst"]
        : [];
  const breakoutHover: DemoBreakoutHover = { rowId: hoveredRow, selected };

  // Cursor: Bloodthirst row → hold → Whirlwind row → hold → drift away.
  const cursorX = interpolate(
    frame,
    [26, 100, 230, 250, HOVER_END_FRAME, HOVER_END_FRAME + 50],
    [1140, BLOODTHIRST_ROW.x, BLOODTHIRST_ROW.x, WHIRLWIND_ROW.x, WHIRLWIND_ROW.x, 1150],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 100, 230, 250, HOVER_END_FRAME, HOVER_END_FRAME + 50],
    [600, BLOODTHIRST_ROW.y, BLOODTHIRST_ROW.y, WHIRLWIND_ROW.y, WHIRLWIND_ROW.y, 620],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [CLICK_1_FRAME - 4, CLICK_1_FRAME, CLICK_1_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [CLICK_2_FRAME - 4, CLICK_2_FRAME, CLICK_2_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2);

  const captionOpacity = interpolate(frame, [8, 18, 406, 420], [0, 1, 1, 0], clamp);
  const step = frame >= CLICK_1_FRAME ? 3 : frame >= HOVER_BT_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Compare two players' abilities" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo
          pinnedPlayers={pinnedPlayers.size > 0 ? pinnedPlayers : undefined}
          breakoutDetail={{ tab: "ability", expanded: false }}
          extraPlayers={EXTRA_PLAYERS}
          breakoutHover={breakoutHover}
          classIconBasePath="/c/icons"
        />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Click abilities to select — footers total exactly those rows"
            : step === 2
              ? "Hover an ability — it lights up in every open breakout"
              : "Pin two players of the same class side by side"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
