import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ConsumablesLedgerDemo } from "../ConsumablesLedgerDemo";
import { clamp, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { LessonIntro, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

const STEPS = [20, 95, 170, 245];

export default function ReadPlayerVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}><Content /></Sequence>
      <LessonIntro
        title="Read one player's consumes"
        bullets={["Search for a consumable", "Choose a player", "Compare the roster bars", "Read uses and fight coverage"]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const step = frame >= STEPS[3] ? 4 : frame >= STEPS[2] ? 3 : frame >= STEPS[1] ? 2 : 1;
  const opacity = interpolate(frame, [8, 18, 316, 330], [0, 1, 1, 0], clamp);

  return (
    <>
      <VideoHeader title="Read one player's consumes" entrance={entrance} />
      <main className="absolute left-[72px] top-[132px]" style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}>
        <ConsumablesLedgerDemo view="player" />
      </main>
      {step === 1 && <RegionHighlight left={79} top={184} width={606} height={32} color="#60a5fa" />}
      {step === 2 && <RegionHighlight left={87} top={218} width={590} height={24} color="var(--color-class-mage)" />}
      {step === 3 && <RegionHighlight left={79} top={243} width={606} height={40} color="var(--color-class-hunter)" />}
      {step === 4 && <RegionHighlight left={79} top={308} width={596} height={98} color="var(--color-class-rogue)" />}
      <StepCaption
        step={step}
        text={step === 1 ? "Use search to find a specific consumable" : step === 2 ? "The header names the player and totals every selected fight" : step === 3 ? "Roster bars make high, low, and zero usage easy to spot" : "Each item row shows uses and the number of fights"}
        opacity={opacity}
      />
    </>
  );
}
