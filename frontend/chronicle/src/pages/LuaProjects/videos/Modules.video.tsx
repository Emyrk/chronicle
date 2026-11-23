/**
 * Announcement: community modules.
 *
 * Follows a module from the gallery to a raid: browse /modules, open
 * chronicle/RadarDurability, Track it, pick it from the instance panel picker
 * under Modules, and watch the radar replay a Nefarian kill. Then the Module
 * Workshop driven by Claude Code over Chronicle's MCP: connect the tab, ask
 * for a radar, watch the Lua and preview fill in, and tag a release.
 *
 * The radar is a stand-in drawn in SVG from a scripted fight, following the
 * module's README: players round the circle, distance from the centre is
 * seconds of safety, mobs on the outer ring, heals as green lines, deaths as
 * red crosses, raid health and healer mana as arcs. The other gallery rows
 * are illustrative.
 * 1040 frames @ 30fps, 1280x720 (INTRO_FRAMES - 10 + FINALE + 110).
 */
import type { ReactNode } from "react";
import { Check, ChevronDown, Code2, LayoutGrid, Play, Radar, Search, Star, Tag, Terminal } from "lucide-react";
import { interpolate, Sequence, useCurrentFrame } from "remotion";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Content-local frames (the content mounts at INTRO_FRAMES - 10).
const GALLERY_CLICK = 110;
const PAGE_START = 130;
const TRACK_CLICK = 230;
const INSTANCE_START = 290;
const PICKER_OPEN = 330;
const PICK_CLICK = 380;
const FIGHT_FROM = 400;
const FIGHT_TO = 610;
const WORKSHOP_START = 630;
const RELEASE_CLICK = 830;
const FINALE = 880;
const FADE = 14;

export const MODULES_VIDEO_DURATION = INTRO_FRAMES - 10 + FINALE + 110;

const ease = { ...clamp, easing: entranceEasing };

// Browser window, in stage pixels; everything inside is window-local.
const WINDOW = { left: 112, top: 34, width: 1056, height: 520 };
const BAR = 30;
const INNER_W = WINDOW.width;

const GREEN = "#4ade80";
const RED = "#ef4444";
const PURPLE = "#c084fc";
const SKY = "#38bdf8";
// Claude's brand orange.
const CLAUDE = "#d97757";

/* ------------------------------------------------------------------ */
/* Scripted fight                                                      */
/* ------------------------------------------------------------------ */

type Klass = "WARRIOR" | "PALADIN" | "HUNTER" | "ROGUE" | "PRIEST" | "MAGE" | "WARLOCK" | "DRUID";

// The module's class colours.
const CLASS_COLOR: Record<Klass, string> = {
  WARRIOR: "#c79c6e",
  PALADIN: "#f58cba",
  HUNTER: "#abd473",
  ROGUE: "#fff569",
  PRIEST: "#ffffff",
  MAGE: "#69ccf0",
  WARLOCK: "#9482c9",
  DRUID: "#ff7d0a",
};

// Raid order. 0 is the main tank; 2-6 heal.
const RAID: { name: string; klass: Klass }[] = [
  { name: "Brakka", klass: "WARRIOR" },
  { name: "Holdfast", klass: "WARRIOR" },
  { name: "Lumina", klass: "PRIEST" },
  { name: "Seraphel", klass: "PRIEST" },
  { name: "Ironpaw", klass: "DRUID" },
  { name: "Kaelis", klass: "PALADIN" },
  { name: "Aldric", klass: "PALADIN" },
  { name: "Vex", klass: "ROGUE" },
  { name: "Shade", klass: "ROGUE" },
  { name: "Pyra", klass: "MAGE" },
  { name: "Frostine", klass: "MAGE" },
  { name: "Ember", klass: "MAGE" },
  { name: "Morwen", klass: "WARLOCK" },
  { name: "Grimsby", klass: "WARLOCK" },
  { name: "Talon", klass: "HUNTER" },
  { name: "Arrowyn", klass: "HUNTER" },
  { name: "Grunt", klass: "WARRIOR" },
  { name: "Bladeson", klass: "WARRIOR" },
  { name: "Thistle", klass: "DRUID" },
  { name: "Nyx", klass: "ROGUE" },
];
const TANK = 0;
const DIES = 13;
const DEATH_AT = 0.505;

// Raid-wide hits: who, how hard, and how long until they are healed back.
const BLASTS = [
  { at: 0.22, amount: 0.38, recover: 0.16, hits: [7, 8, 9, 11, 13, 14, 16, 17, 19] },
  { at: 0.47, amount: 0.62, recover: 0.24, hits: [2, 4, 7, 9, 10, 11, 12, 13, 15, 16, 18, 19] },
  { at: 0.74, amount: 0.34, recover: 0.14, hits: [3, 5, 8, 10, 12, 14, 17, 18] },
];

// Heals being cast (dashed, healer to target) then landing (solid flash).
const HEALS: { at: number; dur: number; from: number; to: number }[] = [
  ...Array.from({ length: 12 }, (_, k) => ({ at: 0.03 + k * 0.08, dur: 0.05, from: k % 2 ? 5 : 2, to: TANK })),
  { at: 0.23, dur: 0.05, from: 3, to: 13 },
  { at: 0.25, dur: 0.05, from: 4, to: 9 },
  { at: 0.475, dur: 0.05, from: 3, to: 13 },
  { at: 0.48, dur: 0.05, from: 6, to: 10 },
  { at: 0.5, dur: 0.05, from: 4, to: 11 },
  { at: 0.53, dur: 0.05, from: 3, to: 19 },
  { at: 0.56, dur: 0.05, from: 6, to: 16 },
  { at: 0.75, dur: 0.05, from: 4, to: 12 },
  { at: 0.77, dur: 0.05, from: 3, to: 18 },
];

const BOSS_CAST = { from: 0.42, to: 0.47, spell: "Shadow Flame" };

const frac = (x: number) => x - Math.floor(x);

function health(i: number, p: number): number {
  if (i === DIES && p >= DEATH_AT) return 0;
  if (i === TANK) return 0.5 + 0.45 * frac(p * 13 + 0.3);
  let h = 1 - 0.05 * (1 + Math.sin(i * 3.1 + p * 21));
  for (const b of BLASTS) {
    if (!b.hits.includes(i)) continue;
    const d = p - b.at;
    if (d >= 0) h -= b.amount * Math.max(0, 1 - d / (i === DIES ? b.recover * 3 : b.recover));
  }
  return Math.max(0.03, Math.min(1, h));
}

// Seconds of safety: lower health and a boss on you both pull you in.
function safety(i: number, p: number): number {
  const h = health(i, p);
  return i === TANK ? 7 * h ** 1.8 : 12 * h ** 1.6;
}

// Ring radius (0..1) for seconds of safety: the 1, 3, 5 and 10s rings.
const SAFETY_STOPS = [0, 1, 3, 5, 10, 14];
const RADIUS_STOPS = [0.05, 0.2, 0.42, 0.6, 0.86, 0.94];
const ringRadius = (s: number) => interpolate(s, SAFETY_STOPS, RADIUS_STOPS, clamp);

/* ------------------------------------------------------------------ */
/* The radar                                                           */
/* ------------------------------------------------------------------ */

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

// A pie that empties like a clock as health drops.
function Pie({ x, y, r, fill, color, faded }: { x: number; y: number; r: number; fill: number; color: string; faded: boolean }) {
  const a = Math.min(fill, 0.9999) * Math.PI * 2;
  const end = polar(x, y, r, a);
  return (
    <g opacity={faded ? 0.5 : 1}>
      <circle cx={x} cy={y} r={r} fill="#0b0b12" stroke={color} strokeOpacity={0.6} strokeWidth={1} />
      {fill > 0 && (
        <path d={`M ${x} ${y} L ${x} ${y - r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${end.x} ${end.y} Z`} fill={color} />
      )}
    </g>
  );
}

// An arc on the radar's left or right edge, filling from the bottom up.
function EdgeArc({ cx, cy, r, side, fill, color, top }: { cx: number; cy: number; r: number; side: "left" | "right"; fill: number; color: string; top?: { fill: number; color: string } }) {
  const span = (Math.PI * 2) / 3;
  const start = side === "left" ? 1.5 * Math.PI - span / 2 : 0.5 * Math.PI + span / 2;
  const dir = side === "left" ? 1 : -1;
  const path = (from: number, to: number) => {
    const a = polar(cx, cy, r, start + dir * span * from);
    const b = polar(cx, cy, r, start + dir * span * to);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${b.x} ${b.y}`;
  };
  return (
    <g fill="none" strokeLinecap="round" strokeWidth={7}>
      <path d={path(0, 1)} stroke="white" strokeOpacity={0.08} />
      {fill > 0 && <path d={path(0, fill)} stroke={color} />}
      {top && top.fill > 0 && <path d={path(1 - top.fill, 1)} stroke={top.color} />}
    </g>
  );
}

const raidHealthColor = (h: number) => (h > 0.75 ? "#22c55e" : h > 0.5 ? "#eab308" : RED);

function RadarView({ p, frame, size }: { p: number; frame: number; size: number }) {
  const c = size / 2;
  const R = size * 0.36;
  const n = RAID.length;
  const angleOf = (i: number) => (i / n) * Math.PI * 2;
  const dash = -frame * 1.2;

  const pos = RAID.map((_, i) => polar(c, c, R * ringRadius(safety(i, p)), angleOf(i)));
  const deathPos = (() => {
    const t = interpolate(p, [DEATH_AT, DEATH_AT + 0.04], [0, 1], ease);
    return polar(c, c, R * 1.1 * t, angleOf(DIES));
  })();

  const closest = RAID.map((_, i) => i)
    .filter((i) => !(i === DIES && p >= DEATH_AT) && safety(i, p) < 5)
    .sort((a, b) => safety(a, p) - safety(b, p))
    .slice(0, 3);

  const alive = RAID.map((_, i) => i).filter((i) => !(i === DIES && p >= DEATH_AT));
  const raidHealth = alive.reduce((sum, i) => sum + health(i, p), 0) / n;
  const deadShare = (n - alive.length) / n;
  const mana = 0.92 - 0.5 * p - 0.06 * Math.max(0, Math.min(1, (p - 0.47) * 8));

  const casting = p >= BOSS_CAST.from && p < BOSS_CAST.to;
  const boss = polar(c, c, R * 1.18, angleOf(TANK));
  const bossColor = casting ? PURPLE : RED;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[1, 3, 5, 10].map((s) => (
        <circle key={s} cx={c} cy={c} r={R * ringRadius(s)} fill="none" stroke={s === 3 ? RED : "white"} strokeOpacity={s === 3 ? 0.45 : 0.1} strokeWidth={1} />
      ))}
      <circle cx={c} cy={c} r={R * 1.18} fill="none" stroke="white" strokeOpacity={0.05} />
      <EdgeArc cx={c} cy={c} r={R * 1.32} side="left" fill={raidHealth} color={raidHealthColor(raidHealth)} top={{ fill: deadShare, color: RED }} />
      <EdgeArc cx={c} cy={c} r={R * 1.32} side="right" fill={mana} color={SKY} />

      {/* The boss on the outer ring, hitting the main tank. */}
      <line x1={boss.x} y1={boss.y} x2={pos[TANK].x} y2={pos[TANK].y} stroke={bossColor} strokeWidth={1.5} strokeDasharray="5 4" strokeDashoffset={dash} />
      <Pie x={boss.x} y={boss.y} r={13} fill={1 - 0.9 * p} color={bossColor} faded={false} />
      {casting && (
        <text x={boss.x + 18} y={boss.y + 4} fill={PURPLE} fontSize={12} fontWeight={600}>
          {BOSS_CAST.spell}
        </text>
      )}

      {/* Heals being cast, then landing. */}
      {HEALS.map((h, k) => {
        const end = h.at + h.dur;
        if (p < h.at || p > end + 0.02 || (h.to === DIES && end > DEATH_AT)) return null;
        const landed = p >= end;
        return (
          <line
            key={k}
            x1={pos[h.from].x}
            y1={pos[h.from].y}
            x2={pos[h.to].x}
            y2={pos[h.to].y}
            stroke={GREEN}
            strokeWidth={landed ? 3 : 1.5}
            strokeOpacity={landed ? interpolate(p, [end, end + 0.02], [0.9, 0], clamp) : 0.8}
            strokeDasharray={landed ? undefined : "4 4"}
            strokeDashoffset={dash}
          />
        );
      })}

      {RAID.map((m, i) => {
        if (i === DIES && p >= DEATH_AT) return null;
        const h = health(i, p);
        return <Pie key={m.name} x={pos[i].x} y={pos[i].y} r={8} fill={h} color={CLASS_COLOR[m.klass]} faded={h > 0.97} />;
      })}

      {p >= DEATH_AT && (
        <g stroke={RED} strokeWidth={3} strokeLinecap="round">
          <line x1={deathPos.x - 6} y1={deathPos.y - 6} x2={deathPos.x + 6} y2={deathPos.y + 6} />
          <line x1={deathPos.x + 6} y1={deathPos.y - 6} x2={deathPos.x - 6} y2={deathPos.y + 6} />
        </g>
      )}

      {closest.map((i) => (
        <text key={i} x={pos[i].x + 11} y={pos[i].y + 4} fill={CLASS_COLOR[RAID[i].klass]} fontSize={11} fontWeight={600}>
          {RAID[i].name}
        </text>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Cursor                                                              */
/* ------------------------------------------------------------------ */

// Stage-pixel waypoints: [frame, x, y]. Clicks pulse at the listed frames.
const PATH: [number, number, number][] = [
  [0, 900, 640],
  [GALLERY_CLICK - 30, 330, 274],
  [GALLERY_CLICK, 330, 274],
  [TRACK_CLICK - 40, 900, 200],
  [TRACK_CLICK, 1062, 108],
  [PICKER_OPEN - 30, 1000, 330],
  [PICKER_OPEN, 722, 137],
  [PICK_CLICK - 20, 736, 243],
  [PICK_CLICK, 736, 243],
  [FIGHT_FROM + 20, 1100, 520],
  [RELEASE_CLICK - 40, 900, 300],
  [RELEASE_CLICK, 1100, 88],
  [FINALE, 1100, 88],
];
const CLICKS = [GALLERY_CLICK, TRACK_CLICK, PICKER_OPEN, PICK_CLICK, RELEASE_CLICK];

function cursorAt(frame: number) {
  const frames = PATH.map(([f]) => f);
  return {
    x: interpolate(frame, frames, PATH.map(([, x]) => x), ease),
    y: interpolate(frame, frames, PATH.map(([, , y]) => y), ease),
    clicking: Math.max(0, ...CLICKS.map((at) => interpolate(frame, [at - 2, at + 3, at + 14], [0, 1, 0], clamp))),
  };
}

/* ------------------------------------------------------------------ */
/* Browser window and scenes                                           */
/* ------------------------------------------------------------------ */

function sceneOpacity(frame: number, from: number, to: number) {
  return interpolate(frame, [from, from + FADE, to - FADE, to], [0, 1, 1, 0], clamp);
}

function BrowserWindow({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div
      className="absolute overflow-hidden rounded-xl border border-white/10 bg-background shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
      style={{ left: WINDOW.left, top: WINDOW.top, width: WINDOW.width, height: WINDOW.height }}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3" style={{ height: BAR }}>
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-3 rounded bg-white/5 px-3 py-0.5 font-mono text-[11px] text-muted-foreground">chronicleclassic.com{url}</span>
      </div>
      <div className="relative" style={{ height: WINDOW.height - BAR }}>
        {children}
      </div>
    </div>
  );
}

const GALLERY = [
  { author: "chronicle", name: "RadarDurability", description: "The raid as a radar, replayed from the log: who was close to dying, and when.", stars: 1, tag: "v4", updated: "today" },
  { author: "pizzarota", name: "SunderWatch", description: "Sunder Armor stacks on every boss, and who kept them up.", stars: 14, tag: "v7", updated: "3 days ago" },
  { author: "moonglade", name: "HotUptime", description: "Rejuvenation and Regrowth uptime on the tanks, fight by fight.", stars: 9, tag: "v2", updated: "1 week ago" },
  { author: "ironforge-ops", name: "InterruptDuty", description: "Who kicked what, and which casts got through.", stars: 6, tag: "v3", updated: "2 weeks ago" },
];

function GalleryScene({ frame, opacity }: { frame: number; opacity: number }) {
  const hover = interpolate(frame, [GALLERY_CLICK - 25, GALLERY_CLICK - 10], [0, 1], clamp);
  return (
    <div className="absolute inset-0 px-8 pt-6" style={{ opacity }}>
      <h1 className="text-[28px] font-semibold tracking-tight">Modules</h1>
      <p className="mt-1 max-w-[640px] text-[13px] text-muted-foreground">
        Raid panels for Chronicle, written in Lua by the community. Track a module to add it to your raid panels, or build your own in the Module Workshop.
      </p>
      <div className="mt-5 flex items-center justify-between">
        <div>
          <p className="text-[16px] font-semibold">Made by the community</p>
          <p className="text-[12px] text-muted-foreground">Panels other players built and released. Track one to add it to your raids.</p>
        </div>
        <span className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-muted-foreground">
          <Search className="h-3.5 w-3.5" /> Search modules
        </span>
      </div>
      <ul className="mt-3 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-card">
        {GALLERY.map((m, i) => (
          <li key={m.name} className="flex items-start gap-3 px-4 py-3" style={{ background: i === 0 ? `rgba(255,255,255,${0.05 * hover})` : undefined }}>
            <span className="w-5 pt-0.5 text-right font-mono text-[11px] text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-sky-400" style={{ textDecoration: i === 0 && hover > 0.5 ? "underline" : undefined }}>
                {m.author} / <span className="font-semibold">{m.name}</span>
              </p>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{m.description}</p>
              <div className="mt-1.5 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> Panel</span>
                <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {m.stars}</span>
                <span>{m.tag} · updated {m.updated}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModulePageScene({ frame, opacity }: { frame: number; opacity: number }) {
  const tracked = frame >= TRACK_CLICK;
  return (
    <div className="absolute inset-0 px-8 pt-6" style={{ opacity }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-lg border border-white/10 bg-white/5">
            <Radar className="h-6 w-6 text-sky-300" />
          </span>
          <div>
            <p className="text-[24px] font-semibold tracking-tight">RadarDurability</p>
            <p className="text-[12px] text-muted-foreground">
              by <span className="text-foreground/80">chronicle</span> · Panel · <span className="font-mono">v4</span>
            </p>
          </div>
        </div>
        <span
          className="flex items-center overflow-hidden rounded-md border text-[13px]"
          style={{ borderColor: tracked ? "rgba(252,211,77,0.6)" : "rgba(255,255,255,0.15)" }}
        >
          <span className="flex items-center gap-2 px-3 py-1.5">
            <Star className={`h-4 w-4 ${tracked ? "fill-amber-300 text-amber-300" : ""}`} /> {tracked ? "Tracking" : "Track"}
          </span>
          <span className="border-l border-white/10 px-2.5 py-1.5 tabular-nums">{tracked ? 2 : 1}</span>
        </span>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_250px] gap-5">
        <div className="rounded-xl border border-white/10 bg-card p-5 text-[12.5px] leading-relaxed">
          <p className="text-[18px] font-semibold"># RadarDurability</p>
          <p className="mt-2 text-muted-foreground">The raid as a radar, replayed from the log: who was close to dying, and when.</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li><strong className="text-foreground">Every player sits round the circle</strong>, a pie in their class colour that empties as their health drops.</li>
            <li><strong className="text-foreground">Distance from the centre is seconds of safety</strong>. The red ring is 3 seconds.</li>
            <li><strong className="text-foreground">Mobs</strong> sit on the outer ring, with a dashed red line to the player they are hitting.</li>
            <li><strong className="text-foreground">Heals</strong> are green lines from the healer. A red cross marks a death.</li>
          </ul>
        </div>
        <div className="space-y-3 rounded-xl border border-white/10 bg-card p-4 text-[12px]">
          <div>
            <p className="text-muted-foreground">Streams</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {["damage", "heal", "unit_resources", "spell_start", "slain"].map((s) => (
                <span key={s} className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10.5px]">{s}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground">Replay mode</p>
            <p className="mt-1">Whole fight, marks the playhead</p>
          </div>
          <div>
            <p className="text-muted-foreground">Releases</p>
            <p className="mt-1 font-mono">v4 · v3 · v2</p>
          </div>
        </div>
      </div>
      {tracked && (
        <div
          className="absolute rounded-md border border-white/10 bg-neutral-800 px-4 py-2.5 text-[12.5px] shadow-lg"
          style={{ right: 24, bottom: 20, opacity: interpolate(frame, [TRACK_CLICK, TRACK_CLICK + 8], [0, 1], clamp) }}
        >
          <Check className="mr-2 inline h-4 w-4 text-emerald-400" />
          It&apos;s in your instance panel picker.
        </div>
      )}
    </div>
  );
}

const PANEL = { x: 520, y: 52, w: INNER_W - 520 - 20, h: WINDOW.height - BAR - 52 - 64 };

function InstanceScene({ frame, opacity }: { frame: number; opacity: number }) {
  const pickerOpen = frame >= PICKER_OPEN && frame < PICK_CLICK + 4;
  const picked = frame >= PICK_CLICK;
  const p = interpolate(frame, [FIGHT_FROM, FIGHT_TO], [0, 1], clamp);
  const radarIn = interpolate(frame, [PICK_CLICK, PICK_CLICK + 12], [0, 1], ease);
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-2.5 text-[12.5px]">
        <span className="font-semibold">Blackwing Lair</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">Nefarian</span>
        <span className="ml-auto flex items-center gap-1.5 rounded border border-sky-400/50 bg-sky-400/10 px-2 py-0.5 text-sky-300">
          <Play className="h-3 w-3" /> Replay
        </span>
      </div>

      {/* An existing panel on the left. */}
      <div className="absolute rounded-lg border border-white/10 bg-card p-4" style={{ left: 20, top: PANEL.y, width: 480, height: PANEL.h }}>
        <p className="text-[13px] font-semibold">Damage Done</p>
        <div className="mt-3 space-y-2">
          {[9, 10, 7, 12, 14, 11, 16, 19].map((i, k) => (
            <div key={i} className="flex items-center gap-2 text-[11.5px]">
              <span className="w-16 truncate" style={{ color: CLASS_COLOR[RAID[i].klass] }}>{RAID[i].name}</span>
              <span className="h-3 rounded-sm" style={{ width: 300 - k * 28, background: CLASS_COLOR[RAID[i].klass], opacity: 0.75 }} />
            </div>
          ))}
        </div>
      </div>

      {/* The new panel slot, then the radar. */}
      <div className="absolute rounded-lg border border-white/10 bg-card" style={{ left: PANEL.x, top: PANEL.y, width: PANEL.w, height: PANEL.h }}>
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[12.5px]">
          {picked ? <Radar className="h-4 w-4 text-sky-300" /> : <LayoutGrid className="h-4 w-4 text-muted-foreground" />}
          <span className={picked ? "font-semibold" : "text-muted-foreground"}>{picked ? "RadarDurability" : "Select a panel type"}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          {picked && (
            <span className="ml-auto flex gap-1.5 text-[11px]">
              <span className="rounded border border-white/10 px-2 py-0.5">Worst moment</span>
              <span className="rounded border border-white/10 px-2 py-0.5">Help</span>
            </span>
          )}
        </div>
        {picked && (
          <div className="flex justify-center" style={{ opacity: radarIn, scale: interpolate(radarIn, [0, 1], [0.94, 1]) }}>
            <RadarView p={p} frame={frame} size={PANEL.h - 44} />
          </div>
        )}
        {pickerOpen && (
          <div className="absolute left-3 top-10 w-[320px] rounded-md border border-white/15 bg-neutral-900 p-1.5 text-[12.5px] shadow-xl">
            <div className="flex items-center gap-2 rounded border border-white/10 px-2 py-1.5 text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              <span className="text-foreground">{"radar".slice(0, Math.max(0, Math.floor((frame - PICKER_OPEN - 6) / 3)))}</span>
            </div>
            <p className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Modules</p>
            <div
              className="flex items-center gap-2 rounded px-2 py-1.5"
              style={{ background: frame >= PICK_CLICK - 20 ? "rgba(255,255,255,0.08)" : undefined }}
            >
              <Radar className="h-4 w-4 text-sky-300" /> RadarDurability
            </div>
          </div>
        )}
      </div>

      {/* The replay bar: the radar plays along with the playhead. */}
      <div className="absolute flex items-center gap-3" style={{ left: 20, right: 20, bottom: 18 }}>
        <Play className="h-4 w-4 fill-current text-sky-300" />
        <div className="relative h-1.5 flex-1 rounded-full bg-white/10">
          <span className="absolute inset-y-0 left-0 rounded-full bg-sky-500" style={{ width: `${p * 100}%` }} />
          <span className="absolute -top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white bg-sky-500" style={{ left: `${p * 100}%` }} />
        </div>
        <span className="w-24 text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
          {fmtClock(p * 214)} / 3:34
        </span>
      </div>
    </div>
  );
}

function fmtClock(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Lines from RadarDurability's main.lua.
const CODE = [
  { t: "local events = require(\"chronicle.v1.events\")", c: "text-sky-300" },
  { t: "", c: "" },
  { t: "local canvas = CreateFrame(\"Canvas\", \"radar\", UIParent)", c: "" },
  { t: "canvas:SetSize(SIZE, SIZE + 40)", c: "" },
  { t: "canvas:SetPoint(\"TOPLEFT\", UIParent, \"TOPLEFT\", 0, 0)", c: "" },
  { t: "", c: "" },
  { t: "Chronicle.OnReplayTime(function(ms)", c: "text-violet-300" },
  { t: "  show(ms)", c: "" },
  { t: "end)", c: "text-violet-300" },
  { t: "", c: "" },
  { t: "events.onEvent(onEvent)", c: "" },
  { t: "events.onComplete(function()", c: "text-violet-300" },
  { t: "  show(Chronicle.GetReplayTime() or worstMoment())", c: "" },
  { t: "end)", c: "text-violet-300" },
];

const ASK = "Draw the raid as a radar: how many seconds each player has before they could die.";

// Workshop-local frames.
const W_CONNECT = 34;
const W_ASK_FROM = 48;
const W_ASK_TO = 92;
const W_REPLY = 100;
const W_CODE_TO = 170;
const W_PREVIEW = 176;

/** Claude Code in a terminal beside the browser, driving the Workshop tab through chronicle-mcp. */
function ClaudeTerminal({ local }: { local: number }) {
  const slash = "/chronicle:connect";
  const typedSlash = slash.slice(0, Math.floor(interpolate(local, [10, 28], [0, slash.length], clamp)));
  const typedAsk = ASK.slice(0, Math.floor(interpolate(local, [W_ASK_FROM, W_ASK_TO], [0, ASK.length], clamp)));
  const appear = interpolate(local, [0, 14], [0, 1], ease);
  return (
    <div
      className="absolute overflow-hidden rounded-xl border border-white/15 bg-[#141414] font-mono text-[12px] leading-[1.55] shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
      style={{ left: 36, top: 150, width: 380, height: 330, opacity: appear, translate: `${interpolate(appear, [0, 1], [-24, 0])}px 0`, zIndex: 50 }}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-muted-foreground">
        <Terminal className="h-3.5 w-3.5" /> Claude Code
      </div>
      <div className="space-y-2 p-3">
        <p><span style={{ color: CLAUDE }}>&gt;</span> {typedSlash}</p>
        {local >= W_CONNECT && (
          <p className="text-muted-foreground">
            <span style={{ color: CLAUDE }}>⏺</span> chronicle · selected <span className="text-foreground">you/RaidRadar</span>
          </p>
        )}
        {local >= W_ASK_FROM && <p><span style={{ color: CLAUDE }}>&gt;</span> {typedAsk}</p>}
        {local >= W_REPLY && (
          <p className="text-muted-foreground" style={{ opacity: interpolate(local, [W_REPLY, W_REPLY + 8], [0, 1], clamp) }}>
            <span style={{ color: CLAUDE }}>⏺</span> Added a Canvas radar that follows the replay playhead, saved to main and
            previewed on Nefarian.
          </p>
        )}
      </div>
    </div>
  );
}

function WorkshopScene({ frame, opacity }: { frame: number; opacity: number }) {
  const local = frame - WORKSHOP_START;
  const lines = Math.floor(interpolate(local, [W_REPLY - 6, W_CODE_TO], [0, CODE.length], clamp));
  const connected = local >= W_CONNECT;
  const released = frame >= RELEASE_CLICK;
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2 text-[12.5px]">
        <Radar className="h-4 w-4 text-sky-300" />
        <span className="font-semibold">you / RaidRadar</span>
        <span className="text-muted-foreground">· Module Workshop</span>
        <span
          className={`ml-4 flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] ${connected ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-muted-foreground"}`}
        >
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-muted-foreground"}`} />
          {connected ? "Claude Code" : "No agent"}
        </span>
        <span className="ml-auto rounded border border-white/10 px-2.5 py-1">Save</span>
        <span className={`flex w-[112px] items-center justify-center gap-1.5 rounded px-2.5 py-1 ${released ? "bg-emerald-600 text-white" : "bg-primary-darker text-primary-foreground"}`}>
          <Tag className="h-3.5 w-3.5" /> {released ? "Released v1" : "Release"}
        </span>
      </div>
      <div className="grid h-[calc(100%-41px)] grid-cols-[1fr_350px]">
        {/* Code. */}
        <div className="border-r border-white/10 bg-black/30 pl-[300px]">
          <div className="flex gap-1 border-b border-white/10 px-2 pt-1.5 text-[11.5px]">
            <span className="flex items-center gap-1.5 rounded-t border border-b-0 border-white/10 bg-white/5 px-3 py-1"><Code2 className="h-3.5 w-3.5" /> main.lua</span>
            <span className="px-3 py-1 text-muted-foreground">README.md</span>
          </div>
          <pre className="p-3 font-mono text-[11px] leading-[1.6]">
            {CODE.slice(0, lines).map((line, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-5 text-right text-white/25">{i + 1}</span>
                <span className={line.c}>{line.t}</span>
              </div>
            ))}
          </pre>
        </div>
        {/* Preview. */}
        <div className="flex flex-col items-center p-3">
          <p className="self-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Preview · Nefarian</p>
          {local >= W_PREVIEW && (
            <div style={{ opacity: interpolate(local, [W_PREVIEW, W_PREVIEW + 12], [0, 1], clamp) }}>
              <RadarView p={interpolate(local, [W_PREVIEW, W_PREVIEW + 80], [0.3, 0.6], clamp)} frame={frame} size={290} />
            </div>
          )}
        </div>
      </div>
      {released && (
        <div
          className="absolute rounded-md border border-white/10 bg-neutral-800 px-4 py-2.5 text-[12.5px] shadow-lg"
          style={{ right: 24, bottom: 20, opacity: interpolate(frame, [RELEASE_CLICK, RELEASE_CLICK + 8], [0, 1], clamp) }}
        >
          <Check className="mr-2 inline h-4 w-4 text-emerald-400" />
          Released v1. Panels running the module pick it up on their next load.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Composition                                                         */
/* ------------------------------------------------------------------ */

const CAPTIONS: { step: number; text: ReactNode; from: number; to: number }[] = [
  { step: 1, text: "Browse panels the community built", from: 16, to: PAGE_START },
  { step: 2, text: <>Press <span className="text-amber-300">Track</span> to add one to your raids</>, from: PAGE_START + 10, to: INSTANCE_START },
  { step: 3, text: <>Pick it from <span className="text-sky-300">Modules</span> in the panel picker</>, from: INSTANCE_START + 10, to: FIGHT_FROM + 10 },
  { step: 4, text: "It replays the fight with the playhead", from: FIGHT_FROM + 14, to: WORKSHOP_START },
  { step: 5, text: <>Build your own with <span style={{ color: CLAUDE }}>Claude Code</span>, over Chronicle&apos;s MCP</>, from: WORKSHOP_START + 10, to: RELEASE_CLICK - 6 },
  { step: 6, text: <>Tag a <span className="text-emerald-300">release</span>, and anyone can track it</>, from: RELEASE_CLICK - 2, to: FINALE },
];

function urlAt(frame: number) {
  if (frame < PAGE_START) return "/modules";
  if (frame < INSTANCE_START) return "/modules/chronicle/radardurability";
  if (frame < WORKSHOP_START) return "/instances/8f3c2a";
  return "/modules/you/raidradar/edit";
}

function Content() {
  const frame = useCurrentFrame();
  const windowIn = interpolate(frame, [0, 18], [0, 1], ease);
  const windowOut = interpolate(frame, [FINALE - 10, FINALE + 6], [1, 0], clamp);
  const cursor = cursorAt(frame);
  return (
    <>
      <div className="absolute inset-0" style={{ opacity: windowIn * windowOut, translate: `0 ${interpolate(windowIn, [0, 1], [16, 0])}px` }}>
        <BrowserWindow url={urlAt(frame)}>
          {frame < PAGE_START + FADE && <GalleryScene frame={frame} opacity={sceneOpacity(frame, -FADE, PAGE_START + FADE)} />}
          {frame >= PAGE_START - FADE && frame < INSTANCE_START + FADE && (
            <ModulePageScene frame={frame} opacity={sceneOpacity(frame, PAGE_START - FADE, INSTANCE_START + FADE)} />
          )}
          {frame >= INSTANCE_START - FADE && frame < WORKSHOP_START + FADE && (
            <InstanceScene frame={frame} opacity={sceneOpacity(frame, INSTANCE_START - FADE, WORKSHOP_START + FADE)} />
          )}
          {frame >= WORKSHOP_START - FADE && <WorkshopScene frame={frame} opacity={sceneOpacity(frame, WORKSHOP_START - FADE, FINALE + 400)} />}
        </BrowserWindow>
        {frame >= WORKSHOP_START && frame < FINALE && <ClaudeTerminal local={frame - WORKSHOP_START} />}
        <Cursor {...cursor} />
      </div>
      <Captions frame={frame} />
      {frame >= FINALE - 6 && <Finale progress={interpolate(frame, [FINALE, FINALE + 20], [0, 1], ease)} frame={frame} />}
    </>
  );
}

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

function Finale({ progress, frame }: { progress: number; frame: number }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center gap-14"
      style={{ opacity: progress, translate: `0 ${interpolate(progress, [0, 1], [18, 0])}px` }}
    >
      <RadarView p={interpolate(frame, [FINALE, FINALE + 110], [0.4, 0.62], clamp)} frame={frame} size={300} />
      <div>
        <h2 className="font-wow text-[64px] font-bold tracking-tight">Modules</h2>
        <p className="mt-2 max-w-[640px] text-2xl text-muted-foreground">Raid panels built by the community, written in Lua.</p>
        <div className="mt-8 flex gap-3 font-mono text-lg">
          <span className="rounded-full border border-amber-300/40 bg-white/5 px-5 py-2 text-amber-300">Track</span>
          <span className="rounded-full border border-violet-300/40 bg-white/5 px-5 py-2 text-violet-300">Build</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-5 py-2">/modules</span>
        </div>
      </div>
    </div>
  );
}

export default function ModulesVideo() {
  return (
    <VideoStage>
      <div className="absolute inset-0 bg-[#0b0d16]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_16%,rgba(56,189,248,0.13),transparent_42%),radial-gradient(circle_at_10%_90%,rgba(192,132,252,0.13),transparent_38%)]" />
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Modules"
        bullets={[
          "Raid panels built by the community, written in Lua",
          <>
            <span className="text-amber-300">Track</span> one to add it to your raids
          </>,
          <>
            Build your own with <span style={{ color: CLAUDE }}>Claude Code</span> and Chronicle&apos;s MCP
          </>,
          "Tag a release, and anyone can use it",
        ]}
      />
    </VideoStage>
  );
}
