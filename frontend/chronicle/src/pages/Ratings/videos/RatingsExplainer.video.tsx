/**
 * Announcement: the /ratings explainer.
 *
 * Follows the page top to bottom. The overview: two per-kill metrics
 * (Performance, Parse) and three ratings built from them (Peak, Mastery,
 * Renown). Then the example player's Nefarian kills through each lens: the
 * benchmark line, the best kill for Peak, the Floor/Form/Peak bands for
 * Mastery, and a flat award per kill for Renown. "My data" swaps in your own
 * character's kills. Last, a new server record raises the benchmark and
 * Peak dips. Every number comes from ratingMath, the page's own formulas.
 * 1010 frames @ 30fps, 1280x720 (INTRO_FRAMES - 10 + FINALE + 80).
 */
import type { ReactNode } from "react";
import { BarChart3, Percent } from "lucide-react";
import { interpolate, interpolateColors, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes";
import { MASTERY_WEIGHTS, normalize, ratePlayerBoss, type Band } from "../ratingMath";

// Content-local frames (the content mounts at INTRO_FRAMES - 10).
const OVERVIEW_END = 160;
const PEAK_CLICK = 280;
const MASTERY_CLICK = 370;
const RENOWN_CLICK = 500;
const MINE_CLICK = 585;
const MINE_MASTERY_CLICK = 640;
const LENS_END = 710;
const DRAG_FROM = 760;
const DRAG_TO = 830;
const FINALE = 880;
const FADE = 12;

const ease = { ...clamp, easing: entranceEasing };

// Browser window, in stage pixels; everything below is window-local.
const WINDOW = { left: 112, top: 34, width: 1056, height: 520 };
const BAR = 30;
const INNER_W = 1008;

// Lens scene layout.
const TABS_Y = BAR + 78;
const TAB_W = (INNER_W - 4 * 8) / 5;
const CARD_Y = BAR + 124;
const CARD_H = WINDOW.height - CARD_Y - 16;
const CHART = { x: 24 + 320, y: CARD_Y + 30, w: INNER_W - 320 - 24, h: 236 };
const TOGGLE = { right: 24, y: BAR + 16 };

const PEAK = METRIC_THEMES.peak;
const MASTERY = METRIC_THEMES.mastery;
const RENOWN = METRIC_THEMES.renown;

type Lens = "performance" | "parse" | "peak" | "mastery" | "renown";

interface Dataset {
  boss: string;
  cohort: string;
  unit: "DPS" | "HPS";
  kills: number[];
  benchmark: number;
  award: number;
}

// The page's example player: a Fury Warrior's Nefarian kills, in order.
const EXAMPLE: Dataset = {
  boss: "Nefarian",
  cohort: "Fury Warrior",
  unit: "DPS",
  kills: [1000, 820, 1120, 1080, 1060, 1150, 1090, 1130, 1070, 1140],
  benchmark: 1180,
  award: 9,
};
// "My data": an illustrative linked character.
const MINE: Dataset = {
  boss: "Chromaggus",
  cohort: "Holy Priest",
  unit: "HPS",
  kills: [690, 742, 615, 760, 731, 770, 705],
  benchmark: 845,
  award: 2,
};
const NEW_RECORD = 1300;

const LENSES: { id: Lens; label: string; icon: ReactNode }[] = [
  { id: "performance", label: "Performance", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "parse", label: "Parse", icon: <Percent className="h-4 w-4" /> },
  { id: "peak", label: "Peak", icon: <PEAK.icon className="h-4 w-4" style={{ color: PEAK.accent }} /> },
  { id: "mastery", label: "Mastery", icon: <MASTERY.icon className="h-4 w-4" style={{ color: MASTERY.accent }} /> },
  { id: "renown", label: "Renown", icon: <RENOWN.icon className="h-4 w-4" style={{ color: RENOWN.accent }} /> },
];

// Lens changes, in order. The page opens on the example's Performance.
const LENS_STEPS: { at: number; lens: Lens }[] = [
  { at: -Infinity, lens: "performance" },
  { at: PEAK_CLICK, lens: "peak" },
  { at: MASTERY_CLICK, lens: "mastery" },
  { at: RENOWN_CLICK, lens: "renown" },
  { at: MINE_MASTERY_CLICK, lens: "mastery" },
];

// Bar colors match the page's Tailwind classes.
const BAND_COLOR: Record<Band, string> = { ignored: "#3f3f46", floor: "#10b981", form: "#38bdf8", peak: "#fbbf24" };
const BAND_LABEL: Record<Band, string> = {
  peak: "Peak (best kill)",
  form: "Form (the rest)",
  floor: "Floor (next 20%)",
  ignored: "Ignored (bottom 20%)",
};
const SKY = "#0ea5e9";
const DIM = "#3f3f46";
const VIOLET = "#8b5cf6";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtInt = (n: number) => Math.round(n).toLocaleString();

export default function RatingsExplainerVideo() {
  return (
    <VideoStage>
      <div className="absolute inset-0 bg-[#0d0b16]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_16%,rgba(226,178,90,0.14),transparent_42%),radial-gradient(circle_at_10%_90%,rgba(179,148,230,0.14),transparent_38%)]" />
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="How Ratings Work"
        bullets={[
          <>
            <span style={{ color: PEAK.accent }}>Peak</span>: the best you have ever done
          </>,
          <>
            <span style={{ color: MASTERY.accent }}>Mastery</span>: what to expect from you, kill after kill
          </>,
          <>
            <span style={{ color: RENOWN.accent }}>Renown</span>: how much content you have done
          </>,
          "See it all with an example, or with your own kills",
        ]}
      />
    </VideoStage>
  );
}

function pulse(frame: number, at: number) {
  return interpolate(frame, [at - 2, at + 2, at + 12], [0, 1, 0], clamp);
}

/** 0 → 1 over a short ramp starting at `at`. */
function on(frame: number, at: number, length = 10) {
  return interpolate(frame, [at, at + length], [0, 1], ease);
}

/** Visible between two frames, fading at both ends. */
function between(frame: number, from: number, to: number) {
  return interpolate(frame, [from, from + FADE, to - FADE, to], [0, 1, 1, 0], clamp);
}

/** The active lens, the one before it, and how far the change has gone. */
function lensAt(frame: number) {
  let i = 0;
  while (i + 1 < LENS_STEPS.length && frame >= LENS_STEPS[i + 1].at) i++;
  const step = LENS_STEPS[i];
  return { lens: step.lens, prev: LENS_STEPS[Math.max(0, i - 1)].lens, t: i === 0 ? 1 : on(frame, step.at, 12) };
}

function tabCenter(lens: Lens) {
  const i = LENSES.findIndex((l) => l.id === lens);
  return { x: 24 + i * (TAB_W + 8) + TAB_W / 2, y: TABS_Y + 18 };
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const finale = interpolate(frame, [FINALE, FINALE + 22], [0, 1], ease);

  const overviewVis = between(frame, -FADE, OVERVIEW_END);
  const lensVis = between(frame, OVERVIEW_END - 6, LENS_END);
  const benchVis = between(frame, LENS_END - 6, FINALE + 30);

  const mine = { x: WINDOW.width - TOGGLE.right - 48, y: TOGGLE.y + 15 };
  const thumb = benchThumb(frame);
  const path: [number, { x: number; y: number }][] = [
    [16, { x: 640, y: 420 }],
    [OVERVIEW_END - 10, { x: 700, y: 360 }],
    [PEAK_CLICK - 12, tabCenter("peak")],
    [PEAK_CLICK + 10, tabCenter("peak")],
    [MASTERY_CLICK - 12, tabCenter("mastery")],
    [MASTERY_CLICK + 10, tabCenter("mastery")],
    [RENOWN_CLICK - 12, tabCenter("renown")],
    [RENOWN_CLICK + 10, tabCenter("renown")],
    [MINE_CLICK - 12, mine],
    [MINE_CLICK + 8, mine],
    [MINE_MASTERY_CLICK - 12, tabCenter("mastery")],
    [MINE_MASTERY_CLICK + 10, tabCenter("mastery")],
    [DRAG_FROM - 14, thumb.start],
    [DRAG_FROM, thumb.start],
    [DRAG_TO, thumb.end],
    [DRAG_TO + 20, { x: thumb.end.x + 30, y: thumb.end.y + 40 }],
  ];
  const frames = path.map(([at]) => at);
  const cursorX = interpolate(frame, frames, path.map(([, p]) => p.x), ease);
  const cursorY = interpolate(frame, frames, path.map(([, p]) => p.y), ease);
  const dragging = frame >= DRAG_FROM - 2 && frame <= DRAG_TO ? 0.6 : 0;
  const clicking = Math.max(dragging, ...[PEAK_CLICK, MASTERY_CLICK, RENOWN_CLICK, MINE_CLICK, MINE_MASTERY_CLICK].map((at) => pulse(frame, at)));
  const cursorOpacity = interpolate(frame, [180, 196, DRAG_TO + 24, DRAG_TO + 40], [0, 1, 1, 0], clamp);

  return (
    <>
      <div
        className="absolute overflow-hidden rounded-xl border border-white/10 bg-background shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        style={{ ...WINDOW, opacity: entrance * (1 - finale), translate: `0 ${interpolate(entrance, [0, 1], [24, 0]) - finale * 20}px` }}
      >
        {overviewVis > 0 && <OverviewScene frame={frame} opacity={overviewVis} />}
        {lensVis > 0 && <LensScene frame={frame} opacity={lensVis} />}
        {benchVis > 0 && <BenchmarkScene frame={frame} opacity={benchVis} />}
        <BrowserBar url="chronicleclassic.com/ratings" />
        <div style={{ opacity: cursorOpacity }}>
          <Cursor x={cursorX} y={cursorY} clicking={clicking} />
        </div>
      </div>
      <Captions frame={frame} />
      {frame >= FINALE && <Finale progress={finale} />}
    </>
  );
}

function BrowserBar({ url }: { url: string }) {
  return (
    <div className="absolute inset-x-0 top-0 flex items-center gap-2 border-b border-white/10 bg-[#16131f] px-3" style={{ height: BAR }}>
      <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      <span className="ml-3 rounded bg-white/5 px-3 py-0.5 font-mono text-[11px] text-slate-400">{url}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

const METRIC_CARDS = [
  { icon: <BarChart3 className="h-5 w-5" />, title: "Performance", question: "What did I do on this fight?", body: "Your raw DPS or HPS on one boss kill." },
  {
    icon: <Percent className="h-5 w-5" />,
    title: "Parse",
    question: "How well did I do on this fight compared to my peers?",
    body: "That performance scored 0–100 against kills from the 60 days before the raid.",
  },
];
const RATING_CARDS = [
  { theme: PEAK, title: "Peak", body: "Your best kill against the best kill ever recorded in your cohort." },
  { theme: MASTERY, title: "Mastery", body: "Your best kill, your typical kills, and your weaker kills, blended." },
  { theme: RENOWN, title: "Renown", body: "Points for every boss you've killed. It only goes up." },
];

function OverviewScene({ frame, opacity }: { frame: number; opacity: number }) {
  const card = (at: number) => {
    const t = on(frame, at, 14);
    return { opacity: t, translate: `0 ${interpolate(t, [0, 1], [10, 0])}px` };
  };
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      <div className="absolute" style={{ left: 24, top: BAR + 18 }}>
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Understanding your stats</p>
        <p className="mt-0.5 text-[26px] font-bold">How Ratings Work</p>
        <p className="text-[12px] text-muted-foreground">
          Two numbers describe what you did on one boss kill. Three ratings summarize your whole history on a boss.
        </p>
      </div>
      <div className="absolute rounded-xl border border-white/10 bg-card p-4" style={{ left: 24, top: BAR + 106, width: INNER_W, height: 360 }}>
        <p className="mb-2 text-[12px] font-semibold">Per-kill metrics</p>
        <div className="grid grid-cols-2 gap-3">
          {METRIC_CARDS.map((m, i) => (
            <OverviewCard key={m.title} {...m} style={card(18 + i * 10)} />
          ))}
        </div>
        <p className="mb-2 mt-4 text-[12px] font-semibold" style={card(48)}>
          Ratings <span className="font-normal text-muted-foreground">(your whole history, built from those kills)</span>
        </p>
        <div className="grid grid-cols-3 gap-3">
          {RATING_CARDS.map((r, i) => (
            <OverviewCard
              key={r.title}
              icon={<r.theme.icon className="h-5 w-5" />}
              accent={r.theme.accent}
              title={r.title}
              question={r.theme.question!}
              body={r.body}
              style={card(58 + i * 12)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function OverviewCard({ icon, title, question, body, accent, style }: {
  icon: ReactNode;
  title: string;
  question: string;
  body: string;
  accent?: string;
  style: { opacity: number; translate: string };
}) {
  return (
    <div className="h-full rounded-lg border border-white/10 bg-background/40 p-3" style={{ ...style, boxShadow: accent ? `inset 0 2px 0 ${accent}` : undefined }}>
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="inline-flex rounded-md p-1 text-muted-foreground"
          style={accent ? { color: accent, backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)` } : { backgroundColor: "rgba(255,255,255,0.06)" }}
        >
          {icon}
        </span>
        <span className="text-[14px] font-semibold" style={accent ? { color: accent } : undefined}>{title}</span>
      </div>
      <p className="mb-1 text-[12px] font-medium italic text-foreground/85">{question}</p>
      <p className="text-[12px] leading-snug text-muted-foreground">{body}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lenses                                                              */
/* ------------------------------------------------------------------ */

function LensScene({ frame, opacity }: { frame: number; opacity: number }) {
  const { lens, prev, t } = lensAt(frame);
  const usingMine = frame >= MINE_CLICK + 8;
  const data = usingMine ? MINE : EXAMPLE;
  // The chart dips while the data source swaps.
  const swap = interpolate(frame, [MINE_CLICK, MINE_CLICK + 8, MINE_CLICK + 18], [1, 0, 1], clamp);
  const picker = on(frame, MINE_CLICK + 8, 12);
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      <div className="absolute" style={{ left: 24, top: BAR + 14 }}>
        <p className="text-[20px] font-semibold">See It in Action</p>
        {usingMine ? (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground" style={{ opacity: picker }}>
            <PickerBox label="Character" value="Lunaris (Nordanaar)" />
            <PickerBox label="Raid" value="Blackwing Lair" />
            <PickerBox label="Boss" value="Chromaggus · Holy Priest · HPS" />
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">One example player&apos;s Nefarian kills as a Fury Warrior, viewed through each lens.</p>
        )}
      </div>
      <SourceToggle frame={frame} mine={frame >= MINE_CLICK} />
      <div className="absolute flex gap-2" style={{ left: 24, top: TABS_Y }}>
        {LENSES.map((l) => {
          const active = l.id === lens;
          return (
            <span
              key={l.id}
              className={`flex h-9 items-center justify-center gap-2 rounded-lg border text-[13px] font-medium ${active ? "border-sky-400 bg-sky-500/10 text-foreground" : "border-white/10 bg-card text-muted-foreground"}`}
              style={{ width: TAB_W }}
            >
              {l.icon}
              {l.label}
            </span>
          );
        })}
      </div>
      <div className="absolute rounded-xl border border-white/10 bg-card" style={{ left: 24, top: CARD_Y, width: INNER_W, height: CARD_H }} />
      <div className="absolute" style={{ left: 44, top: CARD_Y + 22, width: 270, opacity: swap }}>
        <Explanation frame={frame} lens={lens} data={data} changedAt={scoreChangedAt(frame)} />
      </div>
      <div className="absolute" style={{ left: CHART.x, top: CHART.y, opacity: swap }}>
        <KillBars frame={frame} data={data} lens={lens} prev={prev} t={t} benchmark={data.benchmark} width={CHART.w} height={CHART.h} />
      </div>
    </div>
  );
}

/** When the shown score last changed: a lens click or the data swap. */
function scoreChangedAt(frame: number) {
  return [PEAK_CLICK, MASTERY_CLICK, RENOWN_CLICK, MINE_CLICK + 8, MINE_MASTERY_CLICK].filter((at) => frame >= at).at(-1) ?? OVERVIEW_END;
}

function PickerBox({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <span className="rounded-md border border-white/15 bg-background px-2 py-0.5 text-[11px] text-foreground">{value}</span>
    </span>
  );
}

function SourceToggle({ frame, mine }: { frame: number; mine: boolean }) {
  return (
    <div className="absolute flex rounded-lg border border-white/10 bg-card p-1 text-[12px] font-medium" style={{ right: TOGGLE.right, top: TOGGLE.y }}>
      <span className={`rounded-md px-3 py-1 ${!mine ? "bg-sky-500/15 text-foreground" : "text-muted-foreground"}`}>Example player</span>
      <span
        className={`rounded-md px-3 py-1 ${mine ? "bg-sky-500/15 text-foreground" : "text-muted-foreground"}`}
        style={{ scale: String(1 - pulse(frame, MINE_CLICK) * 0.06) }}
      >
        My data
      </span>
    </div>
  );
}

function Explanation({ frame, lens, data, changedAt }: { frame: number; lens: Lens; data: Dataset; changedAt: number }) {
  const rating = ratePlayerBoss(data.kills, data.benchmark);
  // Scores count up each time the lens or the data changes.
  const count = (value: number) => value * on(frame, changedAt + 4, 18);
  switch (lens) {
    case "performance":
    case "parse":
      return (
        <div>
          <p className="text-[19px] font-semibold">Performance</p>
          <p className="mt-0.5 text-[12px] font-medium italic">What did I do on this fight?</p>
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
            The {data.unit} actually done on each kill. Everything else on this page starts from these numbers.
          </p>
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
            The dashed line is the <strong className="text-foreground">benchmark</strong>: the best {fmtInt(data.benchmark)} {data.unit} any{" "}
            {data.cohort} on the server has ever done on {data.boss}.
          </p>
        </div>
      );
    case "peak":
      return (
        <div>
          <p className="text-[19px] font-semibold">Peak</p>
          <p className="mt-0.5 text-[12px] font-medium italic" style={{ color: PEAK.accent }}>{PEAK.question}</p>
          <p className="mt-2 text-[12px] text-muted-foreground">Your single best kill, against the benchmark.</p>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            100 × {fmtInt(rating.rawPeak)} ÷ {fmtInt(data.benchmark)}
          </p>
          <Score label="Peak" value={fmt(count(rating.peak))} />
          <p className="mt-1 text-[11px] text-muted-foreground">Capped at 100. One great kill is enough.</p>
        </div>
      );
    case "mastery":
      return (
        <div>
          <p className="text-[19px] font-semibold">Mastery</p>
          <p className="mt-0.5 text-[12px] font-medium italic" style={{ color: MASTERY.accent }}>{MASTERY.question}</p>
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
            Sort kills worst to best. The worst 20% are ignored, the next 20% are your Floor, the best is your Peak, and
            the rest are your Form.
          </p>
          <div className="mt-2 space-y-0.5 font-mono text-[11px]">
            <WeightRow band="peak" label="Peak" weight={MASTERY_WEIGHTS.peak} value={rating.peak} />
            <WeightRow band="form" label="Form" weight={MASTERY_WEIGHTS.form} value={rating.form} />
            <WeightRow band="floor" label="Floor" weight={MASTERY_WEIGHTS.floor} value={rating.floor} />
          </div>
          <Score label="Mastery" value={fmt(count(rating.mastery))} />
        </div>
      );
    case "renown":
      return (
        <div>
          <p className="text-[19px] font-semibold">Renown</p>
          <p className="mt-0.5 text-[12px] font-medium italic" style={{ color: RENOWN.accent }}>{RENOWN.question}</p>
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
            Every boss has a Renown award. Each kill earns it, however you performed. Harder bosses are worth more.
          </p>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            {data.boss}: {data.kills.length} kills × {data.award} = {data.kills.length * data.award}
          </p>
          <Score label={`${data.boss} Renown`} value={fmtInt(count(data.kills.length * data.award))} />
        </div>
      );
  }
}

function Score({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3">
      <p className="text-[12px] font-medium text-sky-300">{label}</p>
      <p className="text-[44px] font-bold leading-none tabular-nums text-sky-200">{value}</p>
    </div>
  );
}

function WeightRow({ band, label, weight, value }: { band: Band; label: string; weight: number; value: number }) {
  return (
    <p className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAND_COLOR[band] }} />
      <span className="w-10 text-foreground">{label}</span>
      <span className="text-muted-foreground">
        {Math.round(weight * 100)}% × {fmt(value)} = <span className="text-foreground">{fmt(weight * value)}</span>
      </span>
    </p>
  );
}

function barColor(lens: Lens, band: Band, isPeak: boolean) {
  switch (lens) {
    case "mastery":
      return BAND_COLOR[band];
    case "peak":
      return isPeak ? BAND_COLOR.peak : DIM;
    case "renown":
      return VIOLET;
    default:
      return SKY;
  }
}

/** The page's kill chart: one bar per kill, a dashed benchmark line, per-lens colors and labels. */
function KillBars({ frame, data, lens, prev, t, benchmark, width, height, axisMax: fixedMax }: {
  frame: number;
  data: Dataset;
  lens: Lens;
  prev: Lens;
  t: number;
  benchmark: number;
  width: number;
  height: number;
  axisMax?: number;
}) {
  const rating = ratePlayerBoss(data.kills, benchmark);
  const bandByIndex = new Map(rating.bands.map((b) => [b.index, b.band]));
  const peakIndex = rating.bands.at(-1)?.index ?? -1;
  const axisMin = Math.min(...data.kills) * 0.75;
  const axisMax = fixedMax ?? Math.max(benchmark, ...data.kills) * 1.15;
  const pct = (v: number) => (v - axisMin) / (axisMax - axisMin);
  const heightFor = (l: Lens, v: number) => (l === "renown" ? 0.6 : pct(v));
  const lineVis = interpolate(t, [0, 1], [prev === "renown" ? 0 : 1, lens === "renown" ? 0 : 1]);
  const gap = 10;
  const barW = (width - gap * (data.kills.length - 1)) / data.kills.length;
  return (
    <div className="relative" style={{ width, height: height + 24 }}>
      <div className="absolute inset-x-0 border-t border-dashed border-amber-300/60" style={{ top: height * (1 - pct(benchmark)), opacity: lineVis }}>
        <span className="absolute -top-5 left-0 text-[11px] text-amber-300/80">Benchmark {fmtInt(benchmark)}</span>
      </div>
      {data.kills.map((value, i) => {
        const band = bandByIndex.get(i) ?? "form";
        const isPeak = i === peakIndex;
        const color = interpolateColors(t, [0, 1], [barColor(prev, band, isPeak), barColor(lens, band, isPeak)]);
        const h = height * interpolate(t, [0, 1], [heightFor(prev, value), heightFor(lens, value)]);
        const label =
          lens === "renown" ? <span className="text-violet-300">+{data.award}</span>
            : lens === "peak" ? (isPeak ? <span className="text-amber-300">{fmtInt(value)}</span> : null)
              : fmtInt(value);
        return (
          <div key={i} className="absolute bottom-6" style={{ left: i * (barW + gap), width: barW, height: h }}>
            <span className="absolute inset-x-0 -top-5 text-center text-[11px] tabular-nums text-muted-foreground">{label}</span>
            <span className="absolute inset-0 rounded-t" style={{ background: color, scale: lens === "peak" && isPeak ? `1 ${1 + pulse(frame, PEAK_CLICK + 6) * 0.04}` : undefined, transformOrigin: "bottom" }} />
          </div>
        );
      })}
      <div className="absolute inset-x-0 bottom-0 flex h-6 border-t border-white/10 pt-1 text-[11px] text-muted-foreground" style={{ gap }}>
        {data.kills.map((_, i) => (
          <span key={i} className="text-center" style={{ width: barW }}>#{i + 1}</span>
        ))}
      </div>
      {lens === "mastery" && (
        <div className="absolute flex gap-4 text-[11px] text-muted-foreground" style={{ top: height + 32, opacity: t }}>
          {(["peak", "form", "floor", "ignored"] as Band[]).map((b) => (
            <span key={b} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAND_COLOR[b] }} />
              {BAND_LABEL[b]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Benchmark                                                           */
/* ------------------------------------------------------------------ */

const BENCH_CARD = { x: 24 + 520, y: BAR + 70, w: INNER_W - 520 };
const SLIDER = { x: BENCH_CARD.x + 20, y: BAR + 70 + 170, w: BENCH_CARD.w - 40 };

function benchmarkAt(frame: number) {
  return interpolate(frame, [DRAG_FROM, DRAG_TO], [EXAMPLE.benchmark, NEW_RECORD], ease);
}

function benchThumb(frame: number) {
  const max = EXAMPLE.benchmark * 1.3;
  const x = (b: number) => SLIDER.x + ((b - EXAMPLE.benchmark) / (max - EXAMPLE.benchmark)) * SLIDER.w;
  return {
    start: { x: x(EXAMPLE.benchmark), y: SLIDER.y + 6 },
    end: { x: x(NEW_RECORD), y: SLIDER.y + 6 },
    at: x(benchmarkAt(frame)),
  };
}

function BenchmarkScene({ frame, opacity }: { frame: number; opacity: number }) {
  const benchmark = benchmarkAt(frame);
  const rawPeak = Math.max(...EXAMPLE.kills);
  const thumb = benchThumb(frame);
  const max = EXAMPLE.benchmark * 1.3;
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      <div className="absolute" style={{ left: 24, top: BAR + 18, width: 480 }}>
        <p className="text-[22px] font-semibold">Why Ratings Change</p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Peak and Mastery are measured against the <strong className="text-foreground">best kill ever recorded</strong> in
          your cohort. If someone beats it, your ratings go down a bit, even if you haven&apos;t raided since. Your kills
          and their parses stay the same.
        </p>
      </div>
      <div className="absolute" style={{ left: 24, top: BAR + 170 }}>
        <KillBars frame={frame} data={EXAMPLE} lens="peak" prev="peak" t={1} benchmark={benchmark} width={470} height={240} axisMax={max * 1.05} />
      </div>
      <div className="absolute rounded-lg border border-white/10 bg-card p-5" style={{ left: BENCH_CARD.x, top: BENCH_CARD.y, width: BENCH_CARD.w, height: 210 }}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-[13px]">
          <div>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">Today</span>
            <p className="mt-1 text-muted-foreground">Benchmark {fmtInt(EXAMPLE.benchmark)}</p>
            <p className="text-[34px] font-bold tabular-nums">{fmt(normalize(rawPeak, EXAMPLE.benchmark))}</p>
            <p className="text-[11px] text-muted-foreground">Peak</p>
          </div>
          <span className="text-muted-foreground">→</span>
          <div>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">After a new record</span>
            <p className="mt-1 text-muted-foreground">Benchmark {fmtInt(benchmark)}</p>
            <p className="text-[34px] font-bold tabular-nums text-sky-300">{fmt(normalize(rawPeak, benchmark))}</p>
            <p className="text-[11px] text-muted-foreground">Peak</p>
          </div>
        </div>
      </div>
      <div className="absolute text-[12px] text-muted-foreground" style={{ left: SLIDER.x, top: SLIDER.y - 26 }}>
        New server record: <strong className="tabular-nums text-foreground">{fmtInt(benchmark)} DPS</strong>
      </div>
      <div className="absolute h-1.5 rounded-full bg-white/10" style={{ left: SLIDER.x, top: SLIDER.y + 4, width: SLIDER.w }}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-sky-500" style={{ width: thumb.at - SLIDER.x }} />
      </div>
      <span className="absolute h-4 w-4 rounded-full border-2 border-white bg-sky-500" style={{ left: thumb.at - 8, top: SLIDER.y - 1 }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Captions and finale                                                 */
/* ------------------------------------------------------------------ */

const CAPTIONS: { step: number; text: ReactNode; from: number; to: number }[] = [
  { step: 1, text: "Two numbers per kill. Three ratings for your whole history.", from: 16, to: OVERVIEW_END },
  { step: 2, text: <>Every kill, against the <span className="text-amber-300">benchmark</span>: your spec&apos;s best ever</>, from: OVERVIEW_END + 10, to: PEAK_CLICK - 2 },
  { step: 3, text: <><span style={{ color: PEAK.accent }}>Peak</span>: your single best kill against the benchmark</>, from: PEAK_CLICK + 4, to: MASTERY_CLICK - 2 },
  { step: 4, text: <><span style={{ color: MASTERY.accent }}>Mastery</span>: your best, typical and weaker kills, blended</>, from: MASTERY_CLICK + 4, to: RENOWN_CLICK - 2 },
  { step: 5, text: <><span style={{ color: RENOWN.accent }}>Renown</span>: every kill earns the boss&apos;s award</>, from: RENOWN_CLICK + 4, to: MINE_CLICK - 2 },
  { step: 6, text: <>Switch to <span className="text-sky-300">My data</span> to see your own kills</>, from: MINE_CLICK + 4, to: LENS_END },
  { step: 7, text: "A new server record raises the benchmark, and ratings dip", from: LENS_END + 8, to: FINALE - 4 },
];

function Captions({ frame }: { frame: number }) {
  return (
    <>
      {CAPTIONS.map((c) => {
        const opacity = interpolate(frame, [c.from, c.from + 12, c.to - 10, c.to], [0, 1, 1, 0], clamp);
        return opacity > 0 ? <StepCaption key={c.step} step={c.step} text={c.text} opacity={opacity} /> : null;
      })}
    </>
  );
}

function Finale({ progress }: { progress: number }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center text-center"
      style={{ opacity: progress, translate: `0 ${interpolate(progress, [0, 1], [18, 0])}px` }}
    >
      <div className="flex gap-6">
        {[PEAK, MASTERY, RENOWN].map((theme) => (
          <theme.icon key={theme.label} className="h-14 w-14" style={{ color: theme.accent }} />
        ))}
      </div>
      <h2 className="font-wow mt-4 text-[64px] font-bold tracking-tight">How Ratings Work</h2>
      <p className="mt-2 text-2xl text-muted-foreground">Peak, Mastery and Renown, explained with your own kills.</p>
      <div className="mt-8 flex gap-3 font-mono text-lg">
        {[PEAK, { ...MASTERY, label: "Mastery" }, RENOWN].map((theme) => (
          <span key={theme.label} className="rounded-full border bg-white/5 px-5 py-2" style={{ borderColor: `${theme.accent}66`, color: theme.accent }}>
            {theme.label}
          </span>
        ))}
        <span className="rounded-full border border-white/15 bg-white/5 px-5 py-2">/ratings</span>
      </div>
    </div>
  );
}
