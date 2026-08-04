/**
 * Lesson video: open and pin player breakouts.
 *
 * A scripted cursor pins the Afflicted breakout, pins a second one for
 * Ragesmash, then drags the second by its header to a new spot.
 * 470 frames @ 30fps, 1280x720 (50-frame intro card + 420 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Rows sit at y=211+32*i once the entrance settles; Afflicted is row 4,
// Ragesmash row 2. Breakouts are ~340 wide.
const PIN_1_FRAME = 112; // Afflicted pinned
const PIN_2_FRAME = 196; // Ragesmash pinned
const DRAG_START = 250;
const DRAG_END = 320;

const POS_1 = { x: 716, y: 96 };
const POS_2_FROM = { x: 780, y: 260 };
const POS_2_TO = { x: 880, y: 430 };

export default function PinBreakoutVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Open and pin a player breakout"
        bullets={[
          "Click a player row to pin its breakout",
          "Open a second player to compare rotations",
          "Drag a breakout by its header to arrange",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  // ── Cursor choreography ──
  // 1) travel to Afflicted (row 4), click at ~104
  // 2) travel to Ragesmash (row 2), click at ~188
  // 3) travel to breakout 2's header, hold, drag it down-right
  const cursorX = interpolate(
    frame,
    [20, 92, 130, 176, 216, 246, DRAG_START, DRAG_END],
    [1110, 440, 440, 350, 350, POS_2_FROM.x + 24, POS_2_FROM.x + 24, POS_2_TO.x + 24],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [20, 92, 130, 176, 216, 246, DRAG_START, DRAG_END],
    [590, 296, 296, 232, 232, POS_2_FROM.y + 12, POS_2_FROM.y + 12, POS_2_TO.y + 12],
    { ...clamp, easing: entranceEasing },
  );
  const clickPulse1 = interpolate(frame, [100, 106, 116], [0, 1, 0], clamp);
  const clickPulse2 = interpolate(frame, [184, 190, 200], [0, 1, 0], clamp);
  const grabPulse = interpolate(
    frame,
    [DRAG_START - 6, DRAG_START, DRAG_END, DRAG_END + 10],
    [0, 1, 1, 0],
    clamp,
  );
  const clickPulse = Math.max(clickPulse1, clickPulse2, grabPulse * 0.6);

  // ── Pinned breakouts (controlled positions; #2 follows the drag) ──
  const pos2X = interpolate(frame, [DRAG_START, DRAG_END], [POS_2_FROM.x, POS_2_TO.x], {
    ...clamp,
    easing: entranceEasing,
  });
  const pos2Y = interpolate(frame, [DRAG_START, DRAG_END], [POS_2_FROM.y, POS_2_TO.y], {
    ...clamp,
    easing: entranceEasing,
  });
  const pinnedPlayers = new Map<string, { x: number; y: number }>();
  if (frame >= PIN_1_FRAME) pinnedPlayers.set("player-4", POS_1);
  if (frame >= PIN_2_FRAME) pinnedPlayers.set("player-2", { x: pos2X, y: pos2Y });

  const captionOpacity = interpolate(frame, [8, 18, 398, 412], [0, 1, 1, 0], clamp);
  const step = frame >= DRAG_START ? 3 : frame >= PIN_2_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Open a Damage Done breakout" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo
          pinnedPlayers={pinnedPlayers.size > 0 ? pinnedPlayers : undefined}
          classIconBasePath="/c/icons"
        />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Drag a breakout by its header to arrange your workspace"
            : step === 2
              ? "Open a second breakout to compare rotations"
              : "Click a player row to pin its ability breakout"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
