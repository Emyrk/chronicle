/**
 * Announcement: Ranked damage and ranked time.
 *
 * A Garr kill in Damage Done. Turning on Ranked splits every bar into damage
 * that counts toward rankings and Excluded damage (overkill and non-ranked
 * targets), and the meter reorders. A mage's target breakdown shows why. The
 * encounter timeline then shows the ranked window ending at the last ranked
 * death, and the Molten Core ruleset lists each encounter's targets and time.
 * 900 frames @ 30fps, 1280x720.
 */
import type { ReactNode } from "react";
import { ChevronLeft, Clock, Info, Skull, Swords, Trophy } from "lucide-react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, RegionHighlight, StepCaption, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Content-local frames (the content mounts at INTRO_FRAMES - 10).
const CLICK_RANKED = 80;
const SPLIT = 88;
const REORDER = 140;
const CLICK_PLAYER = 228;
const BREAKOUT = 240;
const TIME = 410;
const CLICK_TIME = 514;
const RULESET = 590;
const HIGHLIGHT_GARR = 650;
const FINALE = 790;
const SCENE_FADE = 18;

const ease = { ...clamp, easing: entranceEasing };

// Browser window geometry, in stage pixels.
const WINDOW = { left: 112, top: 34, width: 1056, height: 520 };
const BROWSER_BAR = 30;

// Meter geometry, in window-local pixels.
const METER_TOP = BROWSER_BAR + 96;
const ROW_HEIGHT = 50;
const BAR_LEFT = 220;
const BAR_WIDTH = 560;
const RANKED_BUTTON = { x: 842, y: BROWSER_BAR + 42 };

const HATCH = "repeating-linear-gradient(135deg, rgba(148,163,184,0.5) 0 6px, rgba(148,163,184,0.16) 6px 12px)";

type Player = { name: string; color: string; raw: number; excluded: number };

// Values in thousands. Frostbyte and Emberly AoE'd Firesworn, so much of their
// damage is overkill; Frostbyte also cleaved a wandering Lava Surger.
const PLAYERS: readonly Player[] = [
  { name: "Frostbyte", color: "#69ccf0", raw: 612, excluded: 238 },
  { name: "Gorehowl", color: "#c79c6e", raw: 548, excluded: 41 },
  { name: "Nightshade", color: "#fff569", raw: 537, excluded: 22 },
  { name: "Hexkind", color: "#9482c9", raw: 501, excluded: 64 },
  { name: "Emberly", color: "#69ccf0", raw: 489, excluded: 171 },
  { name: "Talonfury", color: "#abd473", raw: 402, excluded: 19 },
];
const MAX_RAW = Math.max(...PLAYERS.map((p) => p.raw));
const RANKED_ORDER = [...PLAYERS].sort((a, b) => b.raw - b.excluded - (a.raw - a.excluded)).map((p) => p.name);
const FROSTBYTE_RANKED_ROW = RANKED_ORDER.indexOf("Frostbyte");

const TARGETS = [
  { name: "Garr", kind: "boss", ranked: "268k", excluded: "—", why: "" },
  { name: "Firesworn", kind: "add", ranked: "106k", excluded: "182k", why: "Overkill" },
  { name: "Lava Surger", kind: "none", ranked: "—", excluded: "56k", why: "Not a Garr target" },
] as const;

// Garr: a 1:48 encounter whose last ranked target dies at 1:31.
const FIGHT_SECONDS = 108;
const RANKED_SECONDS = 91;
const RANKED_SHARE = RANKED_SECONDS / FIGHT_SECONDS;
const FROSTBYTE_RANKED = 612 - 238;

const ENCOUNTERS = [
  { name: "Lucifron", duration: "1m 12s" },
  { name: "Magmadar", duration: "58s" },
  { name: "Garr", duration: "1m 48s" },
  { name: "Shazzrah", duration: "41s" },
];
const SIDEBAR = { left: 24, top: BROWSER_BAR + 64, width: 296, row: 40, strip: 30 };
const GARR_SIDEBAR_ROW = ENCOUNTERS.findIndex((encounter) => encounter.name === "Garr");
const STRIP_TOP = SIDEBAR.top + (GARR_SIDEBAR_ROW + 1) * SIDEBAR.row;
const TRACK = { left: 360, top: BROWSER_BAR + 128, width: 660, height: 44 };

const RULES: { encounter: string; targets: { name: string; boss: boolean }[] | "boss-only" }[] = [
  { encounter: "Lucifron", targets: [{ name: "Lucifron", boss: true }, { name: "Flamewaker Protector", boss: false }] },
  { encounter: "Magmadar", targets: [{ name: "Magmadar", boss: true }] },
  { encounter: "Garr", targets: [{ name: "Garr", boss: true }, { name: "Firesworn", boss: false }] },
  { encounter: "Shazzrah", targets: "boss-only" },
  { encounter: "Baron Geddon", targets: "boss-only" },
  { encounter: "Golemagg the Incinerator", targets: [{ name: "Golemagg the Incinerator", boss: true }, { name: "Core Rager", boss: false }] },
];
const GARR_RULE_ROW = RULES.findIndex((rule) => rule.encounter === "Garr");

const CHIP = {
  boss: "bg-red-500/15 text-red-200 ring-red-500/30",
  add: "bg-amber-500/10 text-amber-200 ring-amber-500/25",
  none: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};

export default function RankedDamageVideo() {
  return (
    <VideoStage>
      <div className="absolute inset-0 bg-[#140c0a]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(234,88,12,0.22),transparent_42%),radial-gradient(circle_at_12%_88%,rgba(250,204,21,0.1),transparent_36%)]" />
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Ranked damage and ranked time"
        bullets={[
          <>Turn on <strong>Ranked</strong> in Damage Done to match the leaderboards</>,
          <>Overkill and non-ranked targets move to <strong>Excluded</strong></>,
          "Ranked DPS stops the clock when the last ranked target dies",
          "Every encounter's rules are on Leaderboards → Rulesets",
        ]}
      />
    </VideoStage>
  );
}

function k(value: number) {
  return `${Math.round(value)}k`;
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const meter = interpolate(frame, [BREAKOUT, BREAKOUT + SCENE_FADE], [1, 0], ease);
  const breakout = interpolate(frame, [BREAKOUT, BREAKOUT + SCENE_FADE, TIME, TIME + SCENE_FADE], [0, 1, 1, 0], ease);
  const time = interpolate(frame, [TIME, TIME + SCENE_FADE, RULESET, RULESET + SCENE_FADE], [0, 1, 1, 0], ease);
  const ruleset = interpolate(frame, [RULESET, RULESET + SCENE_FADE], [0, 1], ease);
  const finale = interpolate(frame, [FINALE, FINALE + 22], [0, 1], ease);

  // Cursor: to the Ranked toggle, then to Frostbyte's row, then away.
  const playerRow = { x: 300, y: METER_TOP + FROSTBYTE_RANKED_ROW * ROW_HEIGHT + ROW_HEIGHT / 2 };
  const cursorX = interpolate(
    frame,
    [20, CLICK_RANKED - 6, 180, CLICK_PLAYER - 4, BREAKOUT + 30],
    [720, RANKED_BUTTON.x, RANKED_BUTTON.x, playerRow.x, 980],
    ease,
  );
  const cursorY = interpolate(
    frame,
    [20, CLICK_RANKED - 6, 180, CLICK_PLAYER - 4, BREAKOUT + 30],
    [420, RANKED_BUTTON.y, RANKED_BUTTON.y, playerRow.y, 470],
    ease,
  );
  const clicking = Math.max(pulse(frame, CLICK_RANKED), pulse(frame, CLICK_PLAYER));
  const cursorOpacity = interpolate(frame, [12, 24, BREAKOUT + 30, BREAKOUT + 44], [0, 1, 1, 0], clamp);

  const url = frame < RULESET + SCENE_FADE / 2
    ? "chronicleclassic.com/instances/molten-core?encounter=Garr"
    : "chronicleclassic.com/leaderboards/ruleset?instance=Molten+Core";

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
        <div className="absolute inset-0" style={{ opacity: meter }}>
          <MeterScene frame={frame} />
        </div>
        <div className="absolute inset-0" style={{ opacity: breakout }}>
          <BreakoutScene frame={frame - BREAKOUT} />
        </div>
        <div className="absolute inset-0" style={{ opacity: time }}>
          <TimeScene frame={frame - TIME} />
        </div>
        <div className="absolute inset-0" style={{ opacity: ruleset }}>
          <RulesetScene frame={frame - RULESET} />
        </div>
        <div style={{ opacity: cursorOpacity }}>
          <Cursor x={cursorX} y={cursorY} clicking={clicking} />
        </div>
      </div>

      <Captions frame={frame} />
      {frame >= FINALE && <Finale progress={finale} />}
    </>
  );
}

function pulse(frame: number, at: number) {
  return interpolate(frame, [at - 2, at + 2, at + 12], [0, 1, 0], clamp);
}

function BrowserBar({ url }: { url: string }) {
  return (
    <div className="absolute inset-x-0 top-0 flex items-center gap-3 border-b border-white/10 bg-[#0d1117] px-3" style={{ height: BROWSER_BAR }}>
      <div className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
      </div>
      <div className="rounded-md bg-white/5 px-3 py-0.5 font-mono text-[11px] text-muted-foreground">{url}</div>
    </div>
  );
}

function MeterScene({ frame }: { frame: number }) {
  const split = interpolate(frame, [SPLIT, SPLIT + 30], [0, 1], ease);
  const reorder = interpolate(frame, [REORDER, REORDER + 34], [0, 1], ease);
  const ranked = frame >= CLICK_RANKED;

  return (
    <>
      <div className="absolute left-6 right-6 flex items-center justify-between" style={{ top: BROWSER_BAR + 16 }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Molten Core · Garr · 1:48</p>
          <h2 className="mt-0.5 text-2xl font-bold">Damage Done</h2>
        </div>
      </div>
      <div className="absolute flex items-center gap-2" style={{ left: RANKED_BUTTON.x - 46, top: RANKED_BUTTON.y - 13 }}>
        <span
          className={
            ranked
              ? "flex items-center gap-1.5 rounded border border-[color:var(--tertiary)]/40 bg-[color:var(--tertiary)]/20 px-3 py-1 text-sm font-medium text-[color:var(--tertiary)]"
              : "flex items-center gap-1.5 rounded border border-transparent bg-muted/60 px-3 py-1 text-sm text-muted-foreground"
          }
        >
          <Trophy className="h-4 w-4" />
          Ranked
        </span>
        <span className="rounded border border-transparent bg-muted/60 px-3 py-1 text-sm text-muted-foreground">Ranks</span>
      </div>

      <div
        className="absolute flex text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        style={{ top: METER_TOP - 26, left: 0, right: 0 }}
      >
        <span className="absolute" style={{ left: 820 }}>Damage</span>
        <span className="absolute" style={{ left: 930, opacity: split }}>Excluded</span>
      </div>

      {PLAYERS.map((player, rawIndex) => {
        const rankedIndex = RANKED_ORDER.indexOf(player.name);
        const top = METER_TOP + interpolate(reorder, [0, 1], [rawIndex, rankedIndex]) * ROW_HEIGHT;
        const rankedValue = player.raw - player.excluded;
        const solid = (interpolate(split, [0, 1], [player.raw, rankedValue]) / MAX_RAW) * BAR_WIDTH;
        const hatched = ((player.excluded * split) / MAX_RAW) * BAR_WIDTH;
        const rank = (reorder > 0.5 ? rankedIndex : rawIndex) + 1;
        return (
          <div key={player.name} className="absolute inset-x-0" style={{ top, height: ROW_HEIGHT }}>
            <span className="absolute top-3 w-6 text-right font-mono text-sm text-muted-foreground" style={{ left: 24 }}>
              {rank}
            </span>
            <span className="absolute top-2.5 text-lg font-semibold" style={{ left: 64, color: player.color }}>
              {player.name}
            </span>
            <div className="absolute top-2 h-7 overflow-hidden rounded-sm bg-white/5" style={{ left: BAR_LEFT, width: BAR_WIDTH }}>
              <div className="absolute inset-y-0 left-0" style={{ width: solid, background: player.color, opacity: 0.8 }} />
              <div className="absolute inset-y-0" style={{ left: solid, width: hatched, background: HATCH }} />
            </div>
            <span className="absolute top-2.5 font-mono text-lg font-semibold tabular-nums" style={{ left: 820 }}>
              {k(interpolate(split, [0, 1], [player.raw, rankedValue]))}
            </span>
            <span className="absolute top-2.5 font-mono text-lg tabular-nums text-slate-400" style={{ left: 930, opacity: split }}>
              {k(player.excluded)}
            </span>
          </div>
        );
      })}
    </>
  );
}

function BreakoutScene({ frame }: { frame: number }) {
  const statsIn = interpolate(frame, [96, 114], [0, 1], ease);
  return (
    <>
      <div className="absolute left-6 flex items-center gap-2" style={{ top: BROWSER_BAR + 20 }}>
        <ChevronLeft className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-2xl font-bold" style={{ color: "#69ccf0" }}>Frostbyte</h2>
        <span className="ml-2 text-sm text-muted-foreground">Damage Done · Garr</span>
      </div>
      <div className="absolute left-6 flex gap-1 rounded-md bg-muted/40 p-1 text-sm" style={{ top: BROWSER_BAR + 64 }}>
        <span className="rounded px-3 py-1 text-muted-foreground">Abilities</span>
        <span className="rounded bg-white/10 px-3 py-1 font-medium">Targets</span>
      </div>

      <div className="absolute left-6 right-6" style={{ top: BROWSER_BAR + 116 }}>
        <div className="grid grid-cols-[240px_170px_140px_140px_1fr] border-b border-white/10 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Target</span>
          <span>Counts toward</span>
          <span>Ranked</span>
          <span>Excluded</span>
          <span>Why</span>
        </div>
        {TARGETS.map((target, i) => {
          const appear = interpolate(frame, [14 + i * 16, 30 + i * 16], [0, 1], ease);
          const why = interpolate(frame, [52 + i * 16, 66 + i * 16], [0, 1], ease);
          return (
            <div
              key={target.name}
              className="grid h-14 grid-cols-[240px_170px_140px_140px_1fr] items-center border-b border-white/5 text-lg"
              style={{ opacity: appear, translate: `${interpolate(appear, [0, 1], [-16, 0])}px 0` }}
            >
              <span className="font-semibold">{target.name}</span>
              <span>
                <span className={`rounded-md px-2 py-0.5 text-sm font-medium ring-1 ${CHIP[target.kind]}`}>
                  {target.kind === "boss" ? "Boss" : target.kind === "add" ? "Add" : "Not ranked"}
                </span>
              </span>
              <span className="font-mono tabular-nums">{target.ranked}</span>
              <span className="font-mono tabular-nums text-slate-400">{target.excluded}</span>
              <span className="text-base text-amber-200" style={{ opacity: why }}>{target.why}</span>
            </div>
          );
        })}
      </div>

      <div
        className="absolute left-6 right-6 flex items-center gap-3 rounded-lg border border-[color:var(--tertiary)]/25 bg-[color:var(--tertiary)]/5 px-4 py-3 text-base text-muted-foreground"
        style={{ top: BROWSER_BAR + 360, opacity: statsIn }}
      >
        <Info className="h-5 w-5 shrink-0 text-[color:var(--tertiary)]" />
        <span>
          Hits <strong className="text-foreground">1,284</strong> · Crit <strong className="text-foreground">31.4%</strong> ·
          Biggest hit <strong className="text-foreground">4,912</strong>: hit stats still count every original hit.
        </span>
      </div>
    </>
  );
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function TimeScene({ frame }: { frame: number }) {
  const click = CLICK_TIME - TIME;
  const band = interpolate(frame, [20, 50], [0, 1], ease);
  const labels = interpolate(frame, [46, 60], [0, 1], ease);
  const dps = interpolate(frame, [62, 90], [0, 1], ease);
  const filtered = interpolate(frame, [click, click + 14], [0, 1], ease);
  const stripIn = interpolate(frame, [26, 40], [0, 1], ease);
  const ranked = TRACK.width * RANKED_SHARE;

  const strip = { x: SIDEBAR.left + SIDEBAR.width / 2, y: STRIP_TOP + SIDEBAR.strip / 2 };
  const cursorX = interpolate(frame, [64, click - 6], [720, strip.x], ease);
  const cursorY = interpolate(frame, [64, click - 6], [440, strip.y], ease);
  const cursorOpacity = interpolate(frame, [58, 68, click + 40, click + 54], [0, 1, 1, 0], clamp);

  return (
    <>
      <p className="absolute text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ left: SIDEBAR.left + 8, top: SIDEBAR.top - 26 }}>
        Encounters
      </p>
      {ENCOUNTERS.map((encounter, i) => {
        const selected = i === GARR_SIDEBAR_ROW;
        const top = SIDEBAR.top + i * SIDEBAR.row + (i > GARR_SIDEBAR_ROW ? SIDEBAR.strip + 8 : 0);
        return (
          <div
            key={encounter.name}
            className={`absolute flex items-center gap-2 rounded-md px-3 text-base ${selected ? "bg-primary-darker font-semibold text-primary-foreground" : "text-muted-foreground"}`}
            style={{ left: SIDEBAR.left, top, width: SIDEBAR.width, height: SIDEBAR.row - 4 }}
          >
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="flex-1">{encounter.name}</span>
            <span className="font-mono text-sm opacity-70">{encounter.duration}</span>
          </div>
        );
      })}
      <div
        className={`absolute flex items-center justify-between overflow-hidden rounded border px-2 text-xs font-semibold ${filtered > 0.5 ? "border-emerald-400/80 text-emerald-50" : "border-emerald-400/40 text-emerald-200"}`}
        style={{ left: SIDEBAR.left + 8, top: STRIP_TOP, width: SIDEBAR.width - 16, height: SIDEBAR.strip - 4, opacity: stripIn }}
      >
        <span
          className="absolute inset-y-0 left-0"
          style={{ width: `${RANKED_SHARE * 100}%`, background: `rgba(16,185,129,${0.15 + filtered * 0.2})` }}
        />
        <span className="relative">Ranked</span>
        <span className="relative font-mono font-normal">1m 31s</span>
      </div>

      <div className="absolute" style={{ left: TRACK.left, top: BROWSER_BAR + 24 }}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Molten Core · Garr</p>
        <h2 className="mt-0.5 text-2xl font-bold">Encounter timeline</h2>
      </div>
      <div
        className="absolute flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200"
        style={{ left: TRACK.left + TRACK.width - 236, top: BROWSER_BAR + 34, width: 236, opacity: filtered }}
      >
        <Clock className="h-4 w-4" />
        Time range 0:00 – {clock(RANKED_SECONDS)}
      </div>

      <div className="absolute overflow-hidden rounded-md bg-white/5" style={TRACK}>
        <div className="absolute inset-y-0 left-0 bg-emerald-500/35" style={{ width: ranked * band }} />
        <div className="absolute inset-y-0" style={{ left: ranked, right: 0, background: HATCH, opacity: labels * (1 - filtered * 0.6) }} />
        <div className="absolute inset-y-0 w-0.5 bg-red-400" style={{ left: ranked - 1, opacity: labels }} />
      </div>
      <div className="absolute font-mono text-xs text-muted-foreground" style={{ left: TRACK.left, top: TRACK.top + TRACK.height + 6 }}>0:00</div>
      <div className="absolute font-mono text-xs text-muted-foreground" style={{ left: TRACK.left + TRACK.width - 30, top: TRACK.top + TRACK.height + 6 }}>{clock(FIGHT_SECONDS)}</div>
      <div
        className="absolute flex items-center gap-1.5 text-sm font-semibold text-red-300"
        style={{ left: TRACK.left + ranked - 170, top: TRACK.top - 26, width: 166, justifyContent: "flex-end", opacity: labels }}
      >
        <Skull className="h-3.5 w-3.5" />
        Garr dies · {clock(RANKED_SECONDS)}
      </div>
      <div
        className="absolute flex items-center justify-center text-sm font-semibold text-slate-100 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
        style={{ left: TRACK.left + ranked, top: TRACK.top, width: TRACK.width - ranked, height: TRACK.height, opacity: labels }}
      >
        Cleanup
      </div>

      <div
        className="absolute rounded-lg border border-white/10 bg-white/[0.03] px-5 py-4"
        style={{ left: TRACK.left, top: TRACK.top + 104, width: TRACK.width, opacity: dps, translate: `0 ${interpolate(dps, [0, 1], [12, 0])}px` }}
      >
        <p className="text-sm text-muted-foreground"><span className="font-semibold" style={{ color: "#69ccf0" }}>Frostbyte</span> · ranked DPS</p>
        <div className="mt-2 flex items-baseline gap-4 font-mono tabular-nums">
          <span className="text-lg text-slate-500 line-through">{k(FROSTBYTE_RANKED)} ÷ {clock(FIGHT_SECONDS)} = {(FROSTBYTE_RANKED / FIGHT_SECONDS).toFixed(1)}k</span>
          <span className="text-2xl font-semibold text-emerald-300">{k(FROSTBYTE_RANKED)} ÷ {clock(RANKED_SECONDS)} = {(FROSTBYTE_RANKED / RANKED_SECONDS).toFixed(1)}k</span>
        </div>
      </div>

      <div style={{ opacity: cursorOpacity }}>
        <Cursor x={cursorX} y={cursorY} clicking={pulse(frame, click)} />
      </div>
    </>
  );
}

function RulesetScene({ frame }: { frame: number }) {
  const rowTop = BROWSER_BAR + 196;
  const rowHeight = 44;
  return (
    <>
      <div
        className="absolute left-6 right-6 overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(100deg,rgba(124,45,18,0.55),rgba(30,20,16,0.6)_60%,rgba(15,15,20,0.4))] px-5 py-4"
        style={{ top: BROWSER_BAR + 16 }}
      >
        <p className="text-xs text-muted-foreground">Leaderboards · Rulesets</p>
        <h2 className="mt-1 flex items-baseline gap-2 text-2xl font-bold">
          Molten Core <span className="text-lg font-normal text-muted-foreground">Ruleset</span>
        </h2>
      </div>

      <div className="absolute left-6 right-6 flex items-center justify-between" style={{ top: BROWSER_BAR + 124 }}>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[color:var(--tertiary)]/15 text-[color:var(--tertiary)]">
            <Swords className="h-4 w-4" />
          </div>
          <div>
            <p className="text-base font-semibold">DPS ranking targets</p>
            <p className="text-sm text-muted-foreground">Effective damage to these targets counts, timed until the last one dies.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />Boss</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Add</span>
        </div>
      </div>

      {RULES.map((rule, i) => {
        const appear = interpolate(frame, [14 + i * 6, 28 + i * 6], [0, 1], ease);
        return (
          <div
            key={rule.encounter}
            className="absolute left-6 right-6 flex items-center border-b border-white/5"
            style={{ top: rowTop + i * rowHeight, height: rowHeight, opacity: appear }}
          >
            <span className="flex w-[300px] items-center gap-2 font-semibold">
              <Skull className="h-4 w-4 text-red-400/80" />
              {rule.encounter}
            </span>
            <span className="flex gap-1.5">
              {rule.targets === "boss-only" ? (
                <span className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-medium ring-1 ${CHIP.boss}`}>
                  <Skull className="h-3 w-3" />
                  Boss targets only
                </span>
              ) : (
                rule.targets.map((target) => (
                  <span key={target.name} className={`rounded-md px-2 py-0.5 text-sm font-medium ring-1 ${target.boss ? CHIP.boss : CHIP.add}`}>
                    {target.name}
                  </span>
                ))
              )}
            </span>
            <span className="ml-auto flex items-center gap-1.5 pr-2 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-emerald-300" />
              First engage → last {rule.targets === "boss-only" ? "boss" : "target"} death
            </span>
          </div>
        );
      })}

      {/* Sequence offsets are relative to the content timeline, not this scene. */}
      <Sequence from={HIGHLIGHT_GARR} layout="none">
        <RegionHighlight left={16} top={rowTop + GARR_RULE_ROW * rowHeight + 2} width={WINDOW.width - 32} height={rowHeight - 4} color="#fbbf24" />
      </Sequence>
    </>
  );
}

const CAPTIONS: { step: number; text: ReactNode; from: number; to: number }[] = [
  { step: 1, text: <>Turn on <span className="text-[color:var(--tertiary)]">Ranked</span> in Damage Done</>, from: 20, to: 132 },
  { step: 2, text: "Overkill and off-target damage move to Excluded", from: 140, to: 236 },
  { step: 3, text: "See exactly which damage was excluded, and why", from: BREAKOUT + 10, to: TIME - 6 },
  { step: 4, text: "Ranked time stops when the last ranked target dies", from: TIME + 10, to: CLICK_TIME - 6 },
  { step: 5, text: <>Click <span className="text-emerald-300">Ranked</span> under the encounter to filter to it</>, from: CLICK_TIME, to: RULESET - 6 },
  { step: 6, text: "Every encounter's targets and time on Leaderboards → Rulesets", from: RULESET + 10, to: FINALE - 6 },
];

function Captions({ frame }: { frame: number }) {
  return (
    <>
      {CAPTIONS.map((caption) => {
        const opacity = interpolate(frame, [caption.from, caption.from + 12, caption.to - 10, caption.to], [0, 1, 1, 0], clamp);
        return opacity > 0 ? <StepCaption key={caption.step} step={caption.step} text={caption.text} opacity={opacity} /> : null;
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
      <Trophy className="h-14 w-14 text-amber-300" />
      <h2 className="font-wow mt-4 text-[64px] font-bold tracking-tight">Ranked damage</h2>
      <p className="mt-2 text-2xl text-muted-foreground">See the damage, and the time, that counts.</p>
      <p className="mt-8 rounded-full border border-white/15 bg-white/5 px-5 py-2 font-mono text-lg">/leaderboards/rulesets</p>
    </div>
  );
}
