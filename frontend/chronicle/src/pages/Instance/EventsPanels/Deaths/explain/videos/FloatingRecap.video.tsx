/**
 * Lesson video: the floating death recap.
 *
 * The ↗ button opens a draggable breakout (the REAL IncomingEventsBreakout):
 * the cursor drags it, then scrubs the shared fight cursor — the relative
 * health bar replays the final seconds of the death.
 * 530 frames @ 30fps, 1280x720 (50-frame intro card + 480 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { DeathLogDemo } from "@/pages/Instance/EventsPanels/Deaths/DeathLog.demo";
import { BLAZEWING_DEATH_OFFSET } from "@/pages/Instance/EventsPanels/Deaths/deathLogDemoData";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

// Measured cursor targets (stage coordinates).
const FLOAT_BTN = { x: 669, y: 281 }; // ↗ on Blazewing's row
const FLOAT_FROM = { x: 616, y: 0 }; // demo-local floating position
const FLOAT_TO = { x: 700, y: 16 };

const OPEN_FRAME = 100; // ↗ clicked → floating breakout
const DRAG_START = 160;
const DRAG_END = 230;
const SCRUB_START = 290; // fight cursor scrubs through the death
const SCRUB_END = 440;

export default function FloatingRecapVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="The floating death recap"
        bullets={[
          "↗ opens a draggable recap window",
          "Every hit, heal, and absorb listed",
          "Scrub time — the health bar replays",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const open = frame >= OPEN_FRAME;
  const floatX = interpolate(frame, [DRAG_START, DRAG_END], [FLOAT_FROM.x, FLOAT_TO.x], {
    ...clamp,
    easing: entranceEasing,
  });
  const floatY = interpolate(frame, [DRAG_START, DRAG_END], [FLOAT_FROM.y, FLOAT_TO.y], {
    ...clamp,
    easing: entranceEasing,
  });

  // Fight cursor: parked nine seconds before the death while the window is
  // open (so the health bar has state), then scrubbed through to the death.
  const fightOffset = open
    ? Math.round(
        interpolate(
          frame,
          [SCRUB_START, SCRUB_END],
          [BLAZEWING_DEATH_OFFSET - 9_000, BLAZEWING_DEATH_OFFSET],
          clamp,
        ),
      )
    : null;

  // Cursor: ↗ button → drag the floating header → ride the shared fight
  // cursor through the event list.
  const stageFloatX = 72 + floatX;
  const stageFloatY = 132 + floatY;
  const cursorX = interpolate(
    frame,
    [26, 90, DRAG_START, DRAG_END],
    [1140, FLOAT_BTN.x, stageFloatX + 200, stageFloatX + 200],
    { ...clamp, easing: entranceEasing },
  );
  // Scrub path: measured stage positions of the breakout's shared-cursor line
  // as it climbs the list and the list auto-scrolls under it (valid for
  // FLOAT_TO and these fixtures — re-probe if either changes).
  const preScrubY = interpolate(
    frame,
    [26, 90, DRAG_START, DRAG_END, SCRUB_START - 10],
    [600, FLOAT_BTN.y, stageFloatY + 14, stageFloatY + 14, 561],
    { ...clamp, easing: entranceEasing },
  );
  const scrubY = interpolate(
    frame,
    [SCRUB_START - 10, 310, 340, 370, 385, 400, SCRUB_END],
    [561, 532, 494, 451, 417, 393, 390],
    clamp,
  );
  const cursorY = frame < SCRUB_START - 10 ? preScrubY : scrubY;
  const clickOpen = interpolate(frame, [OPEN_FRAME - 4, OPEN_FRAME, OPEN_FRAME + 10], [0, 1, 0], clamp);
  const grab = interpolate(frame, [DRAG_START - 6, DRAG_START, DRAG_END, DRAG_END + 10], [0, 1, 1, 0], clamp);
  const clickPulse = Math.max(clickOpen, grab * 0.6);

  const captionOpacity = interpolate(frame, [8, 18, 466, 480], [0, 1, 1, 0], clamp);
  const step = frame >= SCRUB_START ? 3 : frame >= DRAG_START ? 2 : 1;

  return (
    <>
      <VideoHeader title="The floating death recap" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <DeathLogDemo
          floating={open ? { x: floatX, y: floatY } : undefined}
          fightOffset={fightOffset}
        />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Scrub the fight cursor — the health bar replays the final seconds"
            : step === 2
              ? "Drag it anywhere — open several to compare deaths"
              : "The ↗ button opens a floating recap window"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
