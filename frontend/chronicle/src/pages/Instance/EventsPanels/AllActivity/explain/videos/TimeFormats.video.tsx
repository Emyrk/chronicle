/**
 * Lesson video: three ways to read time.
 *
 * Logs record UTC. The cursor clicks the Time column header to switch to the
 * viewer's local clock, then flips the Encounter offset switch for
 * fight-relative (+m:ss.s) timestamps.
 * 470 frames @ 30fps, 1280x720 (50-frame intro card + 420 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AllActivityDemo } from "@/pages/Instance/EventsPanels/AllActivity/AllActivity.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

const YELLOW = "var(--color-class-rogue)";

// Measured cursor targets (stage coordinates).
const TIME_HEADER = { x: 218, y: 255 };
const OFFSET_TOGGLE = { x: 1178, y: 152 };
const TIME_COLUMN_BOX = { left: 166, top: 244, width: 102, height: 284 };

const LOCAL_FRAME = 110; // Time header clicked → local clock
const OFFSET_FRAME = 260; // Encounter offset flipped → fight-relative times

export default function TimeFormatsVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Three ways to read time"
        bullets={[
          "Logs record UTC — the server's clock",
          "Click the Time header for local time",
          "Encounter offset shows fight time",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const localTime = frame >= LOCAL_FRAME;
  const relativeTime = frame >= OFFSET_FRAME;

  const cursorX = interpolate(
    frame,
    [26, LOCAL_FRAME - 15, LOCAL_FRAME + 30, OFFSET_FRAME - 15, OFFSET_FRAME + 30, OFFSET_FRAME + 80],
    [1140, TIME_HEADER.x, TIME_HEADER.x, OFFSET_TOGGLE.x, OFFSET_TOGGLE.x, 900],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, LOCAL_FRAME - 15, LOCAL_FRAME + 30, OFFSET_FRAME - 15, OFFSET_FRAME + 30, OFFSET_FRAME + 80],
    [600, TIME_HEADER.y, TIME_HEADER.y, OFFSET_TOGGLE.y, OFFSET_TOGGLE.y, 430],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [LOCAL_FRAME - 4, LOCAL_FRAME, LOCAL_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [OFFSET_FRAME - 4, OFFSET_FRAME, OFFSET_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2);

  // The time column stays boxed so the format changes are easy to follow.
  const boxIn = interpolate(frame, [40, 55], [0, 1], clamp);

  const captionOpacity = interpolate(frame, [8, 18, 406, 420], [0, 1, 1, 0], clamp);
  const step = frame >= OFFSET_FRAME ? 3 : frame >= LOCAL_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Three ways to read time" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <AllActivityDemo localTime={localTime} relativeTime={relativeTime} />
      </main>

      <div style={{ opacity: boxIn }}>
        <RegionHighlight {...TIME_COLUMN_BOX} color={YELLOW} />
      </div>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? (
                <>
                  Flip <span style={{ color: YELLOW }}>Encounter offset</span> for fight-relative
                  time — +m:ss.s from the pull
                </>
              )
            : step === 2
              ? "Click the Time header to switch to your local clock"
              : "Combat logs record UTC — the server's clock, not yours"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
