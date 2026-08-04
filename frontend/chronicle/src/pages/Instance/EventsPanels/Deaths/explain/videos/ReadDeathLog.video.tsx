/**
 * Lesson video: read the death log — timestamps (wall-clock vs encounter
 * offset), the Killed By attribution tooltip, and the encounter link.
 * 410 frames @ 30fps, 1280x720 (50-frame intro card + 360 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { DeathLogDemo } from "@/pages/Instance/EventsPanels/Deaths/DeathLog.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const YELLOW = "var(--color-class-rogue)";
const BLUE = "var(--color-class-shaman)";

// Measured cursor targets (stage coordinates).
const OFFSET_TOGGLE = { x: 662, y: 152 };
const KILLER_CELL = { x: 292, y: 281 };

const TOGGLE_FRAME = 95; // Encounter offset flipped → relative times
const HOVER_FRAME = 200; // Killed By hovered → attribution tooltip
const LINK_FRAME = 300; // encounter links called out

export default function ReadDeathLogVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Read the death log"
        bullets={[
          "Every death, in order, with its killer",
          "Hover Killed By for the killing blow",
          "Encounter links jump to that pull",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const relativeTime = frame >= TOGGLE_FRAME;
  const killerTooltip = frame >= HOVER_FRAME && frame < LINK_FRAME;

  const cursorX = interpolate(
    frame,
    [26, 85, TOGGLE_FRAME + 20, HOVER_FRAME - 10, LINK_FRAME - 10, LINK_FRAME + 30],
    [1140, OFFSET_TOGGLE.x, OFFSET_TOGGLE.x, KILLER_CELL.x, KILLER_CELL.x, 900],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 85, TOGGLE_FRAME + 20, HOVER_FRAME - 10, LINK_FRAME - 10, LINK_FRAME + 30],
    [600, OFFSET_TOGGLE.y, OFFSET_TOGGLE.y, KILLER_CELL.y, KILLER_CELL.y, 560],
    { ...clamp, easing: entranceEasing },
  );
  const clickPulse = interpolate(frame, [TOGGLE_FRAME - 4, TOGGLE_FRAME, TOGGLE_FRAME + 10], [0, 1, 0], clamp);

  const linkBoxIn = interpolate(frame, [LINK_FRAME, LINK_FRAME + 12], [0, 1], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 346, 360], [0, 1, 1, 0], clamp);
  const step = frame >= LINK_FRAME ? 3 : frame >= HOVER_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Read the death log" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <DeathLogDemo relativeTime={relativeTime} killerTooltip={killerTooltip} />
      </main>

      {/* The encounter-link column. */}
      <div style={{ opacity: linkBoxIn }}>
        <RegionHighlight left={158} top={234} width={81} height={152} color={BLUE} />
      </div>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? (
                <>
                  <span style={{ color: BLUE }}>Encounter links</span> select that pull across the
                  whole page
                </>
              )
            : step === 2
              ? "Hover 'Killed By' — the killing blow: ability, amount, school, and crits"
              : (
                  <>
                    Flip <span style={{ color: YELLOW }}>Encounter offset</span> to see fight time
                    instead of wall-clock time
                  </>
                )
        }
        opacity={captionOpacity}
      />
    </>
  );
}
