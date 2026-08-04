/**
 * Lesson video: raid durability background — bars behind the lines shade
 * from green to red as the raid takes losses.
 * 380 frames @ 30fps, 1280x720 (50-frame intro card + 330 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TimelineDemo } from "@/pages/Instance/EventsPanels/Timeline/Timeline.demo";
import { DEMO_DAMAGE_SERIES } from "@/pages/Instance/EventsPanels/Timeline/timelineDemoData";
import { clamp, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const YELLOW = "var(--color-class-rogue)";

const BARS_FRAME = 120; // durability background appears

export default function RaidDurabilityVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Raid durability background"
        bullets={[
          "Background bars estimate raid health",
          "Green fades to red as players drop",
          "Needs a single selected encounter",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const durability = frame >= BARS_FRAME;
  const lateBarsBoxIn = interpolate(frame, [200, 212], [0, 1], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 316, 330], [0, 1, 1, 0], clamp);
  const step = frame >= 200 ? 3 : frame >= BARS_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Raid durability background" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <TimelineDemo series={[DEMO_DAMAGE_SERIES]} durability={durability} />
      </main>

      {/* Call out the fading end-of-fight bars. */}
      <div style={{ opacity: lateBarsBoxIn }}>
        {/* The last ~30s of the fight, where bars shrink and redden. */}
        <RegionHighlight left={530} top={250} width={148} height={240} color={YELLOW} />
      </div>

      <StepCaption
        step={step}
        text={
          step === 3
            ? (
                <>
                  <span style={{ color: YELLOW }}>Shorter, redder bars</span> — the raid is
                  taking losses
                </>
              )
            : step === 2
              ? "Set Background to 'Raid Durability' on the panel's back — bars appear behind the lines"
              : "The chart can shade estimated raid health behind your series"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
