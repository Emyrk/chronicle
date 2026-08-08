import { CircleHelp } from "lucide-react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ConsumablesLedgerDemo } from "../ConsumablesLedgerDemo";
import { getUnresolvedFixtureResult } from "../fixture";
import { clamp, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { LessonIntro, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

export default function UnresolvedVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}><Content /></Sequence>
      <LessonIntro title="Understand unresolved consumes" bullets={["Confirmed items stay above", "Ambiguous effects stay separate", "Candidates are shown without guessing"]} />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const step = frame >= 205 ? 3 : frame >= 105 ? 2 : 1;
  const opacity = interpolate(frame, [8, 18, 286, 300], [0, 1, 1, 0], clamp);
  const explanationOpacity = interpolate(frame, [96, 108, 286, 300], [0, 1, 1, 0], clamp);

  return (
    <>
      <VideoHeader title="Understand unresolved consumes" entrance={entrance} />
      <main className="absolute left-[72px] top-[132px]" style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}>
        <ConsumablesLedgerDemo view="raid" result={getUnresolvedFixtureResult()} />
      </main>
      {step === 1 && <RegionHighlight left={79} top={256} width={596} height={98} color="var(--color-class-mage)" />}
      {step === 2 && <RegionHighlight left={79} top={354} width={596} height={128} color="#f59e0b" />}
      {step >= 2 && (
        <aside
          className="absolute left-[720px] top-[214px] w-[470px] rounded-xl border border-amber-400/40 bg-card/95 p-6 shadow-xl"
          style={{
            opacity: explanationOpacity,
            translate: `0 ${interpolate(explanationOpacity, [0, 1], [12, 0])}px`,
          }}
        >
          <div className="flex items-center gap-3 text-amber-300">
            <CircleHelp className="h-7 w-7" />
            <h2 className="text-[24px] font-bold">What is an ambiguous consumable?</h2>
          </div>
          <p className="mt-4 text-[20px] leading-relaxed text-foreground">
            Chronicle detected a consumable effect, but more than one item can produce that
            effect. The combat log cannot prove which item was used.
          </p>
          <p className="mt-4 border-l-2 border-amber-400/60 pl-4 text-[17px] leading-relaxed text-muted-foreground">
            Possible items are shown as candidates. Chronicle does not guess or assign a price
            until the exact item is known.
          </p>
        </aside>
      )}
      {step === 3 && (
        <>
          <RegionHighlight left={87} top={413} width={580} height={20} color="#60a5fa" />
          <RegionHighlight left={87} top={459} width={580} height={20} color="#60a5fa" />
        </>
      )}
      <StepCaption step={step} text={step === 1 ? "Confirmed items remain in the normal ranked ledger" : step === 2 ? "Unresolved effects stay in a separate Ambiguous section" : "Candidate items are listed without pretending one is proven"} opacity={opacity} />
    </>
  );
}
