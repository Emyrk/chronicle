/** Equipment lesson: read a talent build. 410 frames @ 30fps. */
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EquipmentDemo } from "../../Equipment.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

const TAB_FRAME = 90;
const TREE_FRAME = 190;
const LINK_FRAME = 300;

export default function ReadTalentsVideo() {
  return <VideoStage>
    <Sequence from={INTRO_FRAMES - 10}><Content /></Sequence>
    <LessonIntro title="Read a talent build" bullets={["Open the Talents subtab", "Inspect exact ranks in all three trees", "Jump to the talent builder"]} />
  </VideoStage>;
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  // Keep the old view through the click pulse, then switch tabs. This makes
  // the cursor visibly land on the real Talents tab before the layout changes.
  const talents = frame >= TAB_FRAME + 6;
  const cursorX = interpolate(frame, [26, TAB_FRAME - 12, TAB_FRAME + 22, LINK_FRAME - 15, LINK_FRAME + 25], [1140, 149, 149, 603, 603], { ...clamp, easing: entranceEasing });
  const cursorY = interpolate(frame, [26, TAB_FRAME - 12, TAB_FRAME + 22, LINK_FRAME - 15, LINK_FRAME + 25], [600, 227, 227, 270, 270], { ...clamp, easing: entranceEasing });
  const click = interpolate(frame, [TAB_FRAME - 4, TAB_FRAME, TAB_FRAME + 10], [0, 1, 0], clamp);
  const step = frame >= LINK_FRAME ? 3 : frame >= TREE_FRAME ? 2 : 1;
  const captionOpacity = interpolate(frame, [8, 18, 346, 360], [0, 1, 1, 0], clamp);
  return <>
    <VideoHeader title="Read a talent build" entrance={entrance} />
    <main className="absolute left-[72px] top-[132px]" style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}><EquipmentDemo tab={talents ? "talents" : "gear"} /></main>
    {talents && step === 1 && <RegionHighlight left={122} top={213} width={55} height={29} color="var(--primary)" />}
    {step === 2 && <RegionHighlight left={79} top={247} width={606} height={324} color="var(--color-class-mage)" />}
    {step === 3 && <RegionHighlight left={535} top={260} width={137} height={20} color="var(--color-class-rogue)" />}
    <Cursor x={cursorX} y={cursorY} clicking={click} />
    <StepCaption step={step} opacity={captionOpacity} text={step === 3 ? "Open the captured allocation in the full talent builder" : step === 2 ? "Rank badges show exactly where every captured point was spent" : "The player summary gives the three-tree split, then Talents opens the full build"} />
  </>;
}
