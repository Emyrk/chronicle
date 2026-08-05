/**
 * Lesson video: choose your event streams.
 *
 * The cursor hovers a stream chip (its tooltip explains the stream), clicks
 * it to enable AURA events, then clicks the Damage chip to hide a stream —
 * disabled chips grey out with a struck-through count.
 * 520 frames @ 30fps, 1280x720 (50-frame intro card + 470 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AllActivityDemo } from "@/pages/Instance/EventsPanels/AllActivity/AllActivity.demo";
import type { DemoStream } from "@/pages/Instance/EventsPanels/AllActivity/allActivityDemoData";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Measured cursor targets (stage coordinates).
const AURA_CHIP = { x: 493, y: 193 };
const DAMAGE_CHIP = { x: 175, y: 193 };

const HOVER_FRAME = 100; // aura chip hovered → tooltip
const ENABLE_FRAME = 210; // aura chip clicked → AURA rows join the list
const DISABLE_FRAME = 330; // damage chip clicked → damage rows hidden

export default function StreamsVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Choose your event streams"
        bullets={[
          "Every chip is one stream of raw events",
          "Hover a chip to see what it contains",
          "Click to show or hide that stream",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const streams: DemoStream[] = ["heal", "slain", "ressurection"];
  if (frame < DISABLE_FRAME) streams.unshift("damage");
  if (frame >= ENABLE_FRAME) streams.push("aura");

  const hoveredStream = frame >= HOVER_FRAME && frame < ENABLE_FRAME + 15 ? ("aura" as const) : undefined;

  const cursorX = interpolate(
    frame,
    [26, HOVER_FRAME - 10, ENABLE_FRAME + 25, DISABLE_FRAME - 10, DISABLE_FRAME + 30, DISABLE_FRAME + 80],
    [1140, AURA_CHIP.x, AURA_CHIP.x, DAMAGE_CHIP.x, DAMAGE_CHIP.x, 320],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, HOVER_FRAME - 10, ENABLE_FRAME + 25, DISABLE_FRAME - 10, DISABLE_FRAME + 30, DISABLE_FRAME + 80],
    [600, AURA_CHIP.y, AURA_CHIP.y, DAMAGE_CHIP.y, DAMAGE_CHIP.y, 430],
    { ...clamp, easing: entranceEasing },
  );
  const click1 = interpolate(frame, [ENABLE_FRAME - 4, ENABLE_FRAME, ENABLE_FRAME + 10], [0, 1, 0], clamp);
  const click2 = interpolate(frame, [DISABLE_FRAME - 4, DISABLE_FRAME, DISABLE_FRAME + 10], [0, 1, 0], clamp);
  const clickPulse = Math.max(click1, click2);

  const captionOpacity = interpolate(frame, [8, 18, 456, 470], [0, 1, 1, 0], clamp);
  const step = frame >= DISABLE_FRAME ? 3 : frame >= ENABLE_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Choose your event streams" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <AllActivityDemo enabledStreams={streams} hoveredStream={hoveredStream} />
      </main>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 3
            ? "Click again to hide one — disabled chips grey out, nothing is deleted"
            : step === 2
              ? "Click a chip to enable its stream — AURA events join the list"
              : "Hover any chip to see what that stream contains and its event count"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
