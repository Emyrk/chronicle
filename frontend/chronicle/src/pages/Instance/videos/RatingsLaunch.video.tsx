/**
 * Announcement: Ratings (Peak, Ranked Mastery, Renown) and the rebuilt leaderboards.
 *
 * Peak: your best kill against the current #1, and a new record lowering it.
 * Ranked Mastery: Peak, Form, and Floor blend into the estimate, and five kills
 * complete the Evidence. Renown: boss kills stack into a career total that only
 * grows. Leaderboards: the ratings board, then Guilds mode. Ends on the FAQ.
 * 1110 frames @ 30fps, 1280x720.
 */
import type { ReactNode } from "react";
import { Check, Crown, Flame, Shield, ShieldCheck, Skull, Swords, Users } from "lucide-react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Content-local frames (the content mounts at INTRO_FRAMES - 10).
const PEAK = 0;
const NEW_RECORD = 140;
const MASTERY = 262;
const KILLS = 400;
const RENOWN = 566;
const BOARD = 762;
const CLICK_GUILDS = 880;
const FINALE = 990;
const SCENE_FADE = 18;

const ease = { ...clamp, easing: entranceEasing };

const ACCENT = { peak: "#e2b25a", mastery: "#72aac6", renown: "#b394e6", gold: "#e6c36a" };
const CLASS = {
  warrior: "#C79C6E",
  mage: "#69ccf0",
  rogue: "#fff569",
  shaman: "#0070de",
  hunter: "#abd473",
  warlock: "#9482c9",
};

// Browser window geometry, in stage pixels.
const WINDOW = { left: 112, top: 34, width: 1056, height: 520 };
const BROWSER_BAR = 30;

export default function RatingsLaunchVideo() {
  return (
    <VideoStage>
      <div className="absolute inset-0 bg-[#0e0d12]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_16%,rgba(226,178,90,0.16),transparent_42%),radial-gradient(circle_at_10%_90%,rgba(179,148,230,0.12),transparent_38%)]" />
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Ratings"
        bullets={[
          <>
            <span style={{ color: ACCENT.peak }}>Peak</span>: your best kill against the current #1
          </>,
          <>
            <span style={{ color: ACCENT.mastery }}>Ranked Mastery</span>: what you deliver night after night
          </>,
          <>
            <span style={{ color: ACCENT.renown }}>Renown</span>: your career total
          </>,
          "Rebuilt leaderboards, for characters and guilds",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const show = (from: number, to: number) =>
    interpolate(frame, [from, from + SCENE_FADE, to, to + SCENE_FADE], [0, 1, 1, 0], ease);
  const finale = interpolate(frame, [FINALE, FINALE + 22], [0, 1], ease);

  const url =
    frame < BOARD
      ? "chronicleclassic.com/ratings/faq"
      : "chronicleclassic.com/leaderboards/ratings?instance=Molten+Core";

  return (
    <>
      <div
        className="absolute overflow-hidden rounded-xl border border-white/10 bg-background shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        style={{
          ...WINDOW,
          opacity: entrance * (1 - finale),
          translate: `0 ${interpolate(entrance, [0, 1], [24, 0]) - finale * 20}px`,
        }}
      >
        <BrowserBar url={url} />
        <div className="absolute inset-0" style={{ opacity: show(PEAK - SCENE_FADE, MASTERY) }}>
          <PeakScene frame={frame - PEAK} />
        </div>
        <div className="absolute inset-0" style={{ opacity: show(MASTERY, RENOWN) }}>
          <MasteryScene frame={frame - MASTERY} />
        </div>
        <div className="absolute inset-0" style={{ opacity: show(RENOWN, BOARD) }}>
          <RenownScene frame={frame - RENOWN} />
        </div>
        <div className="absolute inset-0" style={{ opacity: show(BOARD, FINALE + 60) }}>
          <BoardScene frame={frame - BOARD} />
        </div>
      </div>

      <Captions frame={frame} />
      {frame >= FINALE && <Finale progress={finale} />}
    </>
  );
}

function BrowserBar({ url }: { url: string }) {
  return (
    <div
      className="absolute inset-x-0 top-0 flex items-center gap-3 border-b border-white/10 bg-[#0d1117] px-3"
      style={{ height: BROWSER_BAR }}
    >
      <div className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
      </div>
      <div className="rounded-md bg-white/5 px-3 py-0.5 font-mono text-[11px] text-muted-foreground">{url}</div>
    </div>
  );
}

function SceneTitle({ icon, label, color, sub }: { icon: ReactNode; label: string; color: string; sub: string }) {
  return (
    <div className="absolute left-8 right-8 flex items-baseline gap-3" style={{ top: BROWSER_BAR + 22 }}>
      <span className="flex items-center gap-2 font-wow text-[34px] leading-none" style={{ color }}>
        {icon}
        {label}
      </span>
      <span className="text-lg text-muted-foreground">{sub}</span>
    </div>
  );
}

/** Your best kill against the current #1; a new record raises the bar. */
function PeakScene({ frame }: { frame: number }) {
  const record = interpolate(frame, [NEW_RECORD, NEW_RECORD + 40], [1300, 1400], ease);
  const yours = 1200;
  const peak = (yours / record) * 100;
  const flash = interpolate(frame, [NEW_RECORD, NEW_RECORD + 8, NEW_RECORD + 40], [0, 1, 0], clamp);
  const rows = [
    { name: "Ashius", color: CLASS.shaman, dps: record, top: true },
    { name: "Thalra", color: CLASS.warrior, dps: yours, you: true },
    { name: "Morra", color: CLASS.warrior, dps: 1110 },
  ];
  return (
    <>
      <SceneTitle icon={<Flame className="h-8 w-8" />} label="Peak" color={ACCENT.peak} sub="Ragnaros · Fury Warrior" />
      <div className="absolute left-8 right-8" style={{ top: BROWSER_BAR + 104 }}>
        <div className="grid grid-cols-[60px_1fr_200px_200px] border-b border-white/10 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <span>#</span>
          <span>Character</span>
          <span className="text-right">Best kill</span>
          <span className="text-right">Peak</span>
        </div>
        {rows.map((row, i) => {
          const appear = interpolate(frame, [8 + i * 10, 24 + i * 10], [0, 1], ease);
          const score = (row.dps / record) * 100;
          return (
            <div
              key={row.name}
              className="grid h-[66px] grid-cols-[60px_1fr_200px_200px] items-center border-b border-white/5 text-2xl"
              style={{
                opacity: appear,
                translate: `${interpolate(appear, [0, 1], [-16, 0])}px 0`,
                background: row.you ? "rgba(226,178,90,0.07)" : undefined,
              }}
            >
              <span className="font-mono text-lg text-muted-foreground">{i + 1}</span>
              <span className="font-semibold" style={{ color: row.color }}>
                {row.name}
                {row.you && <span className="ml-3 rounded bg-white/10 px-2 py-0.5 text-sm text-foreground">you</span>}
              </span>
              <span
                className="text-right font-mono tabular-nums"
                style={row.top ? { color: flash > 0.05 ? ACCENT.peak : undefined } : undefined}
              >
                {Math.round(row.dps).toLocaleString()}
              </span>
              <span
                className="text-right font-mono tabular-nums"
                style={{ color: row.top ? ACCENT.peak : row.you ? "white" : undefined }}
              >
                {score.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
      <div
        className="absolute left-8 flex items-center gap-4 rounded-lg border border-white/10 bg-black/30 px-5 py-3 font-mono text-xl"
        style={{ top: BROWSER_BAR + 360, opacity: interpolate(frame, [40, 56], [0, 1], ease) }}
      >
        <span className="text-muted-foreground">Your Peak</span>
        <span>
          {yours.toLocaleString()} ÷ {Math.round(record).toLocaleString()} × 100 =
        </span>
        <span className="text-3xl font-semibold" style={{ color: ACCENT.peak }}>
          {peak.toFixed(1)}
        </span>
      </div>
      <div
        className="absolute right-8 rounded-full border px-4 py-1.5 text-lg font-semibold"
        style={{
          top: BROWSER_BAR + 22,
          borderColor: ACCENT.peak,
          color: ACCENT.peak,
          opacity: interpolate(frame, [NEW_RECORD, NEW_RECORD + 10, MASTERY - 20, MASTERY], [0, 1, 1, 0], clamp),
          scale: interpolate(flash, [0, 1], [1, 1.12]),
        }}
      >
        New #1 record!
      </div>
    </>
  );
}

/** Peak, Form, and Floor blend into the estimate; five kills complete the Evidence. */
function MasteryScene({ frame }: { frame: number }) {
  const parts = [
    { label: "Peak", hint: "your best", value: 96, weight: 0.3, color: ACCENT.peak },
    { label: "Form", hint: "your typical recent play", value: 88, weight: 0.5, color: ACCENT.mastery },
    { label: "Floor", hint: "your weaker nights", value: 79, weight: 0.2, color: ACCENT.mastery },
  ];
  const estimate = parts.reduce((sum, p) => sum + p.value * p.weight, 0);
  const kills = Math.min(
    5,
    1 + Math.floor(interpolate(frame, [KILLS - MASTERY, KILLS - MASTERY + 120], [0, 4.999], clamp)),
  );
  const weight = 0.65 + 0.35 * ((kills - 1) / 4);
  const ranked = estimate * weight;
  const evidenceIn = interpolate(frame, [KILLS - MASTERY - 20, KILLS - MASTERY], [0, 1], ease);
  const complete = kills >= 5;
  const done = interpolate(frame, [KILLS - MASTERY + 124, KILLS - MASTERY + 140], [0, 1], ease);
  return (
    <>
      <SceneTitle
        icon={<ShieldCheck className="h-8 w-8" />}
        label="Ranked Mastery"
        color={ACCENT.mastery}
        sub="Ragnaros · one boss"
      />
      <div className="absolute left-8" style={{ top: BROWSER_BAR + 100, width: 560 }}>
        {parts.map((p, i) => {
          const grow = interpolate(frame, [12 + i * 14, 50 + i * 14], [0, 1], ease);
          return (
            <div key={p.label} className="mb-5">
              <div className="mb-1.5 flex items-baseline justify-between text-lg">
                <span>
                  <span className="font-semibold">{p.label}</span>
                  <span className="ml-2 text-base text-muted-foreground">{p.hint}</span>
                </span>
                <span className="font-mono tabular-nums">
                  {Math.round(p.value * grow)}
                  <span className="ml-3 text-base text-muted-foreground">× {Math.round(p.weight * 100)}%</span>
                </span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${p.value * grow}%`, background: p.color, opacity: 0.8 }}
                />
              </div>
            </div>
          );
        })}
        <div
          className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-3 text-xl"
          style={{ opacity: interpolate(frame, [70, 86], [0, 1], ease) }}
        >
          <span className="text-muted-foreground">Mastery estimate</span>
          <span className="font-mono text-2xl tabular-nums">{estimate.toFixed(1)}</span>
        </div>
      </div>

      <div
        className="absolute right-8 rounded-xl border border-white/10 bg-black/30 p-5"
        style={{ top: BROWSER_BAR + 100, width: 360, opacity: evidenceIn }}
      >
        <p className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Evidence</p>
        <div className="mt-3 flex items-center gap-2.5">
          {[1, 2, 3, 4, 5].map((k) => (
            <span
              key={k}
              className="grid h-11 w-11 place-items-center rounded-lg border text-lg font-semibold"
              style={{
                borderColor: k <= kills ? (complete ? "rgb(34 197 94)" : ACCENT.mastery) : "rgba(255,255,255,0.12)",
                background: k <= kills ? (complete ? "rgba(34,197,94,0.18)" : "rgba(114,170,198,0.18)") : "transparent",
                color: k <= kills ? "white" : "rgba(255,255,255,0.3)",
              }}
            >
              <Skull className="h-5 w-5" />
            </span>
          ))}
        </div>
        <p className="mt-3 text-lg">
          <span className="font-mono tabular-nums">{kills}</span> of 5 kills ·{" "}
          {complete ? (
            <span className="inline-flex items-center gap-1 text-green-500" style={{ opacity: done }}>
              <Check className="h-5 w-5" /> complete
            </span>
          ) : (
            <span className="font-mono tabular-nums">{kills * 20}%</span>
          )}
        </p>
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-base text-muted-foreground">Ranked Mastery</p>
          <p className="font-mono text-5xl font-semibold tabular-nums" style={{ color: ACCENT.mastery }}>
            {ranked.toFixed(1)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {complete
              ? "Fully proven: nothing held back."
              : `${Math.round(weight * 100)}% counts until five kills prove it`}
          </p>
        </div>
      </div>
    </>
  );
}

/** Boss kills stack into a career total; bosses carry different weights; clears add a bonus. */
function RenownScene({ frame }: { frame: number }) {
  const tiles = [
    { name: "Lucifron", weight: 1 },
    { name: "Magmadar", weight: 1 },
    { name: "Gehennas", weight: 1 },
    { name: "Garr", weight: 1.2 },
    { name: "Geddon", weight: 1.3 },
    { name: "Golemagg", weight: 1.3 },
    { name: "Majordomo", weight: 1.5 },
    { name: "Ragnaros", weight: 2.2 },
  ];
  const step = 12;
  const shown = tiles.filter((_, i) => frame >= 24 + i * step);
  const clear = interpolate(frame, [24 + tiles.length * step + 10, 24 + tiles.length * step + 26], [0, 1], ease);
  // Illustrative: a career total that only climbs.
  const base = 3120;
  const earned = shown.reduce((sum, t) => sum + Math.round(40 * t.weight), 0) + Math.round(clear * 180);
  const total = base + earned;
  return (
    <>
      <SceneTitle icon={<Crown className="h-8 w-8" />} label="Renown" color={ACCENT.renown} sub="your career total" />
      <div className="absolute left-8 grid grid-cols-4 gap-3" style={{ top: BROWSER_BAR + 104, width: 620 }}>
        {tiles.map((t, i) => {
          const appear = interpolate(frame, [24 + i * step, 34 + i * step], [0, 1], ease);
          return (
            <div
              key={t.name}
              className="flex h-[76px] flex-col justify-between rounded-lg border px-3 py-2"
              style={{
                opacity: appear,
                scale: interpolate(appear, [0, 1], [0.8, 1]),
                borderColor: `rgba(179,148,230,${0.25 + (t.weight - 1) * 0.35})`,
                background: `rgba(179,148,230,${0.06 + (t.weight - 1) * 0.08})`,
              }}
            >
              <span className="flex items-center gap-1.5 text-base font-semibold">
                <Skull className="h-4 w-4 text-red-300/80" />
                {t.name}
              </span>
              <span className="font-mono text-sm" style={{ color: ACCENT.renown }}>
                +{Math.round(40 * t.weight)}
              </span>
            </div>
          );
        })}
        <div
          className="col-span-4 flex items-center justify-between rounded-lg border px-4 py-3 text-lg font-semibold"
          style={{ opacity: clear, borderColor: ACCENT.gold, color: ACCENT.gold, background: "rgba(230,195,106,0.08)" }}
        >
          <span>Full clear bonus</span>
          <span className="font-mono">+180</span>
        </div>
      </div>
      <div
        className="absolute right-8 rounded-xl border border-white/10 bg-black/30 p-6 text-right"
        style={{ top: BROWSER_BAR + 104, width: 300 }}
      >
        <p className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Career Renown</p>
        <p className="mt-1 font-mono text-6xl font-semibold tabular-nums" style={{ color: ACCENT.renown }}>
          {total.toLocaleString()}
        </p>
        <p className="mt-3 text-base text-muted-foreground">Bigger bosses are worth more. It only ever grows.</p>
      </div>
    </>
  );
}

/** The ratings board, then Guilds mode tints the page gold. */
function BoardScene({ frame }: { frame: number }) {
  const guilds = interpolate(frame, [CLICK_GUILDS - BOARD + 4, CLICK_GUILDS - BOARD + 22], [0, 1], ease);
  const isGuilds = guilds > 0.5;
  const characters = [
    {
      peak: ["Ashius", CLASS.shaman, "100.0"],
      mastery: ["Halmira", CLASS.warrior, "92.1"],
      renown: ["Caelnok", CLASS.mage, "12,911"],
    },
    {
      peak: ["Thalra", CLASS.warrior, "92.3"],
      mastery: ["Sylelle", CLASS.hunter, "90.4"],
      renown: ["Fenelle", CLASS.rogue, "11,402"],
    },
    {
      peak: ["Ithelle", CLASS.mage, "91.6"],
      mastery: ["Caelric", CLASS.mage, "89.8"],
      renown: ["Dralas", CLASS.hunter, "10,764"],
    },
    {
      peak: ["Nyxius", CLASS.warlock, "90.2"],
      mastery: ["Ashlas", CLASS.warrior, "88.7"],
      renown: ["Morwen", CLASS.warlock, "10,112"],
    },
  ];
  const guildRows = [
    { peak: ["Cleave", "100.0"], mastery: ["Cleave", "92.5"], renown: ["Cleave", "18,419"] },
    { peak: ["Remnant", "97.4"], mastery: ["Remnant", "92.4"], renown: ["Remnant", "16,441"] },
    { peak: ["Skull Emoji", "95.1"], mastery: ["Skull Emoji", "85.6"], renown: ["Amnesia", "12,361"] },
    { peak: ["The Ashen Banner", "91.9"], mastery: ["The Ashen Banner", "83.5"], renown: ["Die Gilde", "10,112"] },
  ];
  const cols = [
    { key: "peak" as const, label: "Peak", icon: Flame, accent: ACCENT.peak },
    { key: "mastery" as const, label: "Ranked Mastery", icon: Shield, accent: ACCENT.mastery },
    { key: "renown" as const, label: "Renown", icon: Crown, accent: ACCENT.renown },
  ];
  const toggle = { x: 940, y: BROWSER_BAR + 36 };
  const cursorX = interpolate(frame, [40, CLICK_GUILDS - BOARD - 6], [700, toggle.x], ease);
  const cursorY = interpolate(frame, [40, CLICK_GUILDS - BOARD - 6], [420, toggle.y], ease);
  const clicking = interpolate(
    frame,
    [CLICK_GUILDS - BOARD - 2, CLICK_GUILDS - BOARD + 2, CLICK_GUILDS - BOARD + 12],
    [0, 1, 0],
    clamp,
  );
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          opacity: guilds,
          background: "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(230,195,106,0.12), transparent)",
        }}
      />
      <div className="absolute left-8 right-8 flex items-center justify-between" style={{ top: BROWSER_BAR + 18 }}>
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Leaderboards / {isGuilds ? <span style={{ color: ACCENT.gold }}>Guilds / </span> : null}Full clear
          </p>
          <h2 className="font-wow text-3xl">Molten Core</h2>
        </div>
        <div className="flex rounded-md border border-white/10 bg-black/30 p-0.5 text-sm">
          <span
            className="flex items-center gap-1.5 rounded px-3 py-1.5"
            style={
              isGuilds ? { color: "rgba(255,255,255,0.5)" } : { color: "#5b9bd5", background: "rgba(91,155,213,0.16)" }
            }
          >
            <Users className="h-4 w-4" /> Characters
          </span>
          <span
            className="flex items-center gap-1.5 rounded px-3 py-1.5"
            style={
              isGuilds
                ? { color: ACCENT.gold, background: "rgba(230,195,106,0.16)" }
                : { color: "rgba(255,255,255,0.5)" }
            }
          >
            <Swords className="h-4 w-4" /> Guilds
          </span>
        </div>
      </div>
      <div
        className="absolute left-8 right-8 grid grid-cols-3 overflow-hidden rounded-xl border border-white/10 bg-black/20"
        style={{ top: BROWSER_BAR + 100, opacity: interpolate(frame, [6, 22], [0, 1], ease) }}
      >
        {cols.map((c) => (
          <div key={c.key} className="border-r border-white/10 last:border-r-0">
            <div
              className="flex items-center gap-2 border-b border-white/10 px-4 py-3"
              style={{ boxShadow: `inset 0 2px 0 ${c.accent}` }}
            >
              <c.icon className="h-5 w-5" style={{ color: c.accent }} />
              <span className="text-sm font-semibold tracking-wide uppercase">{c.label}</span>
            </div>
            {[0, 1, 2, 3].map((i) => {
              const appear = interpolate(frame, [14 + i * 6, 28 + i * 6], [0, 1], ease);
              const ch = characters[i][c.key];
              const g = guildRows[i][c.key];
              const name = isGuilds ? g[0] : ch[0];
              const value = isGuilds ? g[1] : ch[2];
              return (
                <div
                  key={i}
                  className="flex h-[58px] items-center gap-3 border-b border-white/5 px-4 text-lg last:border-b-0"
                  style={{ opacity: appear }}
                >
                  <span className="w-4 font-mono text-sm text-muted-foreground">{i + 1}</span>
                  <span className="flex-1 truncate font-medium" style={{ color: isGuilds ? undefined : ch[1] }}>
                    {name}
                  </span>
                  <span className="font-mono tabular-nums" style={i === 0 ? { color: c.accent } : undefined}>
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <Cursor x={cursorX} y={cursorY} clicking={clicking} />
    </>
  );
}

const CAPTIONS: { step: number; text: ReactNode; from: number; to: number }[] = [
  {
    step: 1,
    text: (
      <>
        <span style={{ color: ACCENT.peak }}>Peak</span>: your best kill against the current #1
      </>
    ),
    from: 10,
    to: NEW_RECORD - 4,
  },
  { step: 2, text: "A new #1 raises the bar for everyone", from: NEW_RECORD, to: MASTERY - 6 },
  {
    step: 3,
    text: (
      <>
        <span style={{ color: ACCENT.mastery }}>Ranked Mastery</span>: your best, your typical, your weaker nights
      </>
    ),
    from: MASTERY + 10,
    to: KILLS - 6,
  },
  { step: 4, text: "Five kills on a boss completes the Evidence", from: KILLS, to: RENOWN - 6 },
  {
    step: 5,
    text: (
      <>
        <span style={{ color: ACCENT.renown }}>Renown</span>: your career total, and it only grows
      </>
    ),
    from: RENOWN + 10,
    to: BOARD - 6,
  },
  {
    step: 6,
    text: (
      <>
        New leaderboards, for characters and <span style={{ color: ACCENT.gold }}>guilds</span>
      </>
    ),
    from: BOARD + 10,
    to: FINALE - 6,
  },
];

function Captions({ frame }: { frame: number }) {
  return (
    <>
      {CAPTIONS.map((caption) => {
        const opacity = interpolate(
          frame,
          [caption.from, caption.from + 12, caption.to - 10, caption.to],
          [0, 1, 1, 0],
          clamp,
        );
        return opacity > 0 ? (
          <StepCaption key={caption.step} step={caption.step} text={caption.text} opacity={opacity} />
        ) : null;
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
      <div className="flex items-center gap-6">
        <Flame className="h-12 w-12" style={{ color: ACCENT.peak }} />
        <ShieldCheck className="h-12 w-12" style={{ color: ACCENT.mastery }} />
        <Crown className="h-12 w-12" style={{ color: ACCENT.renown }} />
      </div>
      <h2 className="font-wow mt-5 text-[64px] font-bold tracking-tight">Ratings</h2>
      <p className="mt-2 text-2xl text-muted-foreground">Peak, Ranked Mastery, and Renown. On the leaderboards now.</p>
      <p className="mt-8 rounded-full border border-white/15 bg-white/5 px-5 py-2 font-mono text-lg">
        How ratings work: /ratings/faq
      </p>
    </div>
  );
}
