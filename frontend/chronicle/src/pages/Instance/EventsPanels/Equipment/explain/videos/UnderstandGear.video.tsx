/** Equipment lesson: read gear and enchants. 380 frames @ 30fps. */
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EquipmentDemo } from "../../Equipment.demo";
import { clamp, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { LessonIntro, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

const QUALITY_FRAME = 105;
const ENCHANT_FRAME = 220;

export default function UnderstandGearVideo() {
  return <VideoStage>
    <Sequence from={INTRO_FRAMES - 10}><Content /></Sequence>
    <LessonIntro title="Read gear and enchants" bullets={["Every row is one equipment slot", "Colors show item quality", "Green subtitles show enchants"]} />
  </VideoStage>;
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const step = frame >= ENCHANT_FRAME ? 3 : frame >= QUALITY_FRAME ? 2 : 1;
  const captionOpacity = interpolate(frame, [8, 18, 316, 330], [0, 1, 1, 0], clamp);
  return <>
    <VideoHeader title="Read gear and enchants" entrance={entrance} />
    <main className="absolute left-[72px] top-[132px]" style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}><EquipmentDemo /></main>
    {step === 1 && <RegionHighlight left={79} top={243} width={606} height={206} color="var(--color-class-mage)" />}
    {step === 2 && <><RegionHighlight left={79} top={243} width={297} height={206} color="var(--color-quality-epic)" /><RegionHighlight left={388} top={243} width={297} height={206} color="var(--color-quality-rare)" /></>}
    {step === 3 && <><RegionHighlight left={109} top={258} width={93} height={16} color="var(--color-quality-uncommon)" /><RegionHighlight left={418} top={287} width={110} height={16} color="var(--color-quality-uncommon)" /><RegionHighlight left={109} top={431} width={112} height={16} color="var(--color-quality-uncommon)" /></>}
    <StepCaption step={step} opacity={captionOpacity} text={step === 3 ? "Green subtitles identify the enchant applied to that item" : step === 2 ? "Item borders and names use the familiar WoW quality colors" : "The two-column list follows fixed equipment slots from head to weapons"} />
  </>;
}
