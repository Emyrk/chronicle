/**
 * Lesson video: expand a death recap — click a death row to see the last ten
 * seconds of incoming damage, heals, and absorbs, killing blow first.
 * 470 frames @ 30fps, 1280x720 (50-frame intro card + 420 frames of content).
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
const GREEN = "var(--color-class-hunter)";

// Measured cursor target: Blazewing's row (row index 1).
const BLAZEWING_ROW = { x: 300, y: 281 };

const EXPAND_FRAME = 110; // row clicked → recap expands
const BLOW_FRAME = 200; // killing blow called out
const HEALS_FRAME = 310; // heals called out

// Measured recap regions.
const BLOW_BOX = { left: 86, top: 351, width: 592, height: 23 };
const HEAL_BOXES = [
  { left: 86, top: 394, width: 592, height: 21 }, // Chain Heal
  { left: 86, top: 436, width: 592, height: 21 }, // Power Word: Shield absorb
  { left: 86, top: 457, width: 592, height: 21 }, // Renew
  // Flash Heal (top 520) is clipped behind the panel footer — no box.
];

export default function DeathRecapExpandVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Expand a death recap"
        bullets={[
          "Click a death to expand its recap",
          "The last ten seconds, newest first",
          "See what the healers managed",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const expanded = frame >= EXPAND_FRAME;

  const cursorX = interpolate(frame, [26, 95, EXPAND_FRAME + 25, EXPAND_FRAME + 60], [1140, BLAZEWING_ROW.x, BLAZEWING_ROW.x, 900], {
    ...clamp,
    easing: entranceEasing,
  });
  const cursorY = interpolate(frame, [26, 95, EXPAND_FRAME + 25, EXPAND_FRAME + 60], [600, BLAZEWING_ROW.y, BLAZEWING_ROW.y, 620], {
    ...clamp,
    easing: entranceEasing,
  });
  const clickPulse = interpolate(frame, [EXPAND_FRAME - 4, EXPAND_FRAME, EXPAND_FRAME + 10], [0, 1, 0], clamp);

  const blowBoxIn = interpolate(frame, [BLOW_FRAME, BLOW_FRAME + 12, HEALS_FRAME - 10, HEALS_FRAME], [0, 1, 1, 0], clamp);
  const healBoxIn = interpolate(frame, [HEALS_FRAME, HEALS_FRAME + 12], [0, 1], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 406, 420], [0, 1, 1, 0], clamp);
  const step = frame >= HEALS_FRAME ? 3 : frame >= BLOW_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Expand a death recap" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <DeathLogDemo expandedIndex={expanded ? 1 : undefined} />
      </main>

      <div style={{ opacity: blowBoxIn }}>
        <RegionHighlight {...BLOW_BOX} color={YELLOW} />
      </div>
      <div style={{ opacity: healBoxIn }}>
        {HEAL_BOXES.map((box) => (
          <RegionHighlight key={box.top} {...box} color={GREEN} />
        ))}
      </div>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? (
                <>
                  <span style={{ color: GREEN }}>Heals and absorbs</span> show what the healers
                  managed before the end
                </>
              )
            : step === 2
              ? (
                  <>
                    The <span style={{ color: YELLOW }}>killing blow</span> sits at the top —
                    newest first
                  </>
                )
              : "Click a death to expand its recap — the last ten seconds of incoming events"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
