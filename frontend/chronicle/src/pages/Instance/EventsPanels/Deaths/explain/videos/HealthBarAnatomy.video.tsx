/**
 * Lesson video: anatomy of the relative health bar — a labeled diagram.
 *
 * Two REAL RelativeHealthBar instances (one after a damage hit, one after a
 * heal) rendered large, with sequenced callouts: the relative zero, the
 * current marker and net fill, the latest-event pill and arrowhead, the
 * prevented/overheal stripes, and the min/max markers. Callout positions are
 * computed from the component's own scale math, so they are exact.
 * 530 frames @ 30fps, 1280x720 (50-frame intro card + 480 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { RelativeHealthBar } from "@/components/ui/RelativeHealthBar/RelativeHealthBar";
import type { RelativeHealthState } from "@/components/ui/RelativeHealthBar/relativeHealth";
import { clamp, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const YELLOW = "var(--color-class-rogue)";
const BLUE = "var(--color-class-shaman)";
const GREEN = "var(--color-class-hunter)";
const WHITE = "var(--color-class-priest)";
const RED = "#ef4444";

// ── The two crafted states ──
const BOUNDS = { minimum: -6_400, maximum: 1_800 };

/** After a damage hit: 2,800 damage landed, 900 was absorbed. */
const DAMAGE_STATE: RelativeHealthState = {
  current: -5_200,
  minimum: -6_400,
  maximum: 1_800,
  damage: 14_100,
  effectiveHealing: 8_900,
  prevented: 2_300,
  overhealing: 1_250,
  lastTransition: { kind: "damage", from: -2_400, to: -5_200, amount: 2_800, overheal: 0, prevented: 900 },
};

/** After a heal: 2,400 healed, 800 of it overheal. */
const HEAL_STATE: RelativeHealthState = {
  current: -1_300,
  minimum: -6_400,
  maximum: 1_800,
  damage: 11_300,
  effectiveHealing: 10_000,
  prevented: 2_300,
  overhealing: 2_050,
  lastTransition: { kind: "healing", from: -3_700, to: -1_300, amount: 3_200, overheal: 800, prevented: 0 },
};

// ── Diagram geometry (mirrors the component's scale math exactly) ──
const BAR_LEFT = 190; // stage x of each bar's left edge
const BAR_WIDTH = 560; // unscaled component width
const SCALE = 1.6; // visual scale
const VISUAL_WIDTH = BAR_WIDTH * SCALE; // 896
const BAR_A_TOP = 262; // damage bar (scaled bar strip ≈ 38px tall)
const BAR_B_TOP = 452; // heal bar
const BAR_H = 24 * SCALE + 8;

// unitsPerPercent from RelativeHealthBar with these bounds and zeroPercent 50.
const UNITS_PER_PERCENT = Math.max(6_400 / 50, 1_800 / 50) * 1.08;
const pct = (v: number) => 50 + v / UNITS_PER_PERCENT;
const px = (v: number) => BAR_LEFT + (pct(v) / 100) * VISUAL_WIDTH;

const STEPS = [20, 110, 200, 290, 380]; // callout beats

function Label({ x, y, text, color }: { x: number; y: number; text: string; color: string }) {
  return (
    <span
      className="absolute rounded border bg-card/95 px-2 py-0.5 font-mono text-[12px]"
      style={{ left: x, top: y, borderColor: color, color, zIndex: 215, transform: "translateX(-50%)" }}
    >
      {text}
    </span>
  );
}

export default function HealthBarAnatomyVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Anatomy of the health bar"
        bullets={[
          "Logs never record absolute HP",
          "The bar tracks net change from zero",
          "Pills, stripes, and markers explained",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const stepIn = STEPS.map((f, i) => {
    const until = STEPS[i + 1] ?? 470;
    return interpolate(frame, [f, f + 12, until - 10, until], [0, 1, 1, i === STEPS.length - 1 ? 1 : 0], clamp);
  });
  const captionOpacity = interpolate(frame, [8, 18, 466, 480], [0, 1, 1, 0], clamp);
  const step = STEPS.filter((f) => frame >= f).length || 1;

  const captions = [
    "Classic logs never record absolute HP — the bar tracks NET change from a relative zero",
    "The white marker is the current position; red fill left of zero is the deficit",
    "The bright pill is the latest event — the arrowhead shows which way it moved",
    "Striped zones are what didn't change health: absorbed damage, and overheal",
    "Red and green endcaps mark the lowest and highest points seen",
  ];

  return (
    <>
      <VideoHeader title="Anatomy of the health bar" entrance={entrance} />

      <main
        className="absolute inset-0"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <span className="absolute whitespace-nowrap font-mono text-[13px] tracking-[0.1em] text-muted-foreground" style={{ left: BAR_LEFT, top: BAR_A_TOP - 34 }}>
          AFTER A DAMAGE HIT — 2,800, of which 900 was absorbed
        </span>
        <div
          className="absolute"
          style={{ left: BAR_LEFT, top: BAR_A_TOP, width: BAR_WIDTH, transform: `scale(${SCALE})`, transformOrigin: "top left" }}
        >
          <RelativeHealthBar messages={[]} state={DAMAGE_STATE} bounds={BOUNDS} />
        </div>

        <span className="absolute whitespace-nowrap font-mono text-[13px] tracking-[0.1em] text-muted-foreground" style={{ left: BAR_LEFT, top: BAR_B_TOP - 34 }}>
          AFTER A HEAL — 3,200, of which 800 was overheal
        </span>
        <div
          className="absolute"
          style={{ left: BAR_LEFT, top: BAR_B_TOP, width: BAR_WIDTH, transform: `scale(${SCALE})`, transformOrigin: "top left" }}
        >
          <RelativeHealthBar messages={[]} state={HEAL_STATE} bounds={BOUNDS} />
        </div>
      </main>

      {/* 1 — the relative zero baseline (both bars). */}
      <div style={{ opacity: stepIn[0] }}>
        <RegionHighlight left={px(0) - 9} top={BAR_A_TOP - 6} width={18} height={BAR_H} color={WHITE} />
        <RegionHighlight left={px(0) - 9} top={BAR_B_TOP - 6} width={18} height={BAR_H} color={WHITE} />
        <Label x={px(0)} y={BAR_A_TOP - 64} text="relative zero" color={WHITE} />
      </div>

      {/* 2 — current marker + net deficit fill (damage bar). */}
      <div style={{ opacity: stepIn[1] }}>
        <RegionHighlight left={px(-5_200) - 9} top={BAR_A_TOP - 6} width={18} height={BAR_H} color={WHITE} />
        <RegionHighlight left={px(-5_200) + 12} top={BAR_A_TOP - 2} width={px(0) - px(-5_200) - 16} height={BAR_H - 8} color={YELLOW} />
        <Label x={px(-5_200)} y={BAR_A_TOP + BAR_H + 36} text="current" color={WHITE} />
        <Label x={(px(0) + px(-5_200)) / 2} y={BAR_A_TOP - 64} text="net deficit" color={YELLOW} />
      </div>

      {/* 3 — the latest-event pill and arrowhead (damage bar). */}
      <div style={{ opacity: stepIn[2] }}>
        <RegionHighlight left={px(-5_200) - 14} top={BAR_A_TOP + 6} width={px(-2_400) - px(-5_200) + 20} height={BAR_H - 22} color={YELLOW} />
        <Label x={(px(-2_400) + px(-5_200)) / 2} y={BAR_A_TOP + BAR_H + 36} text="latest hit — arrow shows direction" color={YELLOW} />
      </div>

      {/* 4 — prevented stripes (damage bar) and overheal stripes (heal bar). */}
      <div style={{ opacity: stepIn[3] }}>
        <RegionHighlight left={px(-6_100) - 6} top={BAR_A_TOP - 4} width={px(-5_200) - px(-6_100) + 10} height={BAR_H} color={BLUE} />
        <Label x={px(-6_100)} y={BAR_A_TOP - 64} text="prevented (absorbed)" color={BLUE} />
        <RegionHighlight left={px(-1_300) - 4} top={BAR_B_TOP - 4} width={px(-500) - px(-1_300) + 8} height={BAR_H} color={GREEN} />
        <Label x={px(-500)} y={BAR_B_TOP - 64} text="overheal" color={GREEN} />
      </div>

      {/* 5 — min/max endcaps (heal bar footer visible below). */}
      <div style={{ opacity: stepIn[4] }}>
        <RegionHighlight left={px(-6_400) - 9} top={BAR_B_TOP - 6} width={18} height={BAR_H} color={RED} />
        <RegionHighlight left={px(1_800) - 9} top={BAR_B_TOP - 6} width={18} height={BAR_H} color={GREEN} />
        <Label x={px(-6_400)} y={BAR_B_TOP - 64} text="lowest seen" color={RED} />
        <Label x={px(1_800)} y={BAR_B_TOP - 64} text="highest seen" color={GREEN} />
      </div>

      <StepCaption step={step} text={captions[step - 1]} opacity={captionOpacity} />
    </>
  );
}
