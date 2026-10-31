/**
 * Announcement: Alt+click to inspect and compare.
 *
 * A Ragnaros kill in Damage Done. Holding Alt outlines everything inspectable
 * (players, the guild, the boss and the raid). Alt+clicking two players and
 * adding them to compare opens the compare tray: their parses on this log's
 * bosses, then a chart of every night. The boss and the raid go in the tray
 * too, as kill-time and clear-time box plots against the server, realm and
 * guild. Last, the preview Friendly and Honored members see for players.
 * 1110 frames @ 30fps, 1280x720.
 */
import type { ReactNode } from "react";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  Focus,
  GitCompareArrows,
  History,
  LayoutGrid,
  Lock,
  Maximize2,
  MousePointerClick,
  Plus,
  Timer,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Content-local frames (the content mounts at INTRO_FRAMES - 10).
const ALT_DOWN = 30;
const CLICK_P1 = 96;
const ADD_P1 = 140;
const CLICK_P2 = 188;
const ADD_P2 = 226;
const ZOOM_IN_1 = 250;
const CLICK_CHART = 320;
const CLICK_RANGE = 372;
const HOVER_CHART = 400;
const ZOOM_OUT_1 = 450;
const CLICK_BOSS = 500;
const ADD_BOSS = 536;
const ZOOM_IN_2 = 545;
const HOVER_BOX = 600;
const ZOOM_OUT_2 = 668;
const CLICK_RAID = 712;
const ADD_RAID = 748;
const ZOOM_IN_3 = 755;
const CLICK_TIER = 862;
const FINALE = 960;
const FADE = 14;
const ZOOM = 1.3;

// Alt is held for each Alt+click (and for a long first look at the outlines).
const ALT_HOLDS: [number, number][] = [
  [ALT_DOWN, CLICK_P1 + 8],
  [CLICK_P2 - 18, CLICK_P2 + 8],
  [CLICK_BOSS - 18, CLICK_BOSS + 8],
  [CLICK_RAID - 18, CLICK_RAID + 8],
];

const ease = { ...clamp, easing: entranceEasing };

// Browser window geometry, in stage pixels.
const WINDOW = { left: 112, top: 34, width: 1056, height: 520 };
const BROWSER_BAR = 30;

// Page geometry, in window-local pixels.
const RAID_TITLE = { x: 24, y: BROWSER_BAR + 16 };
const BOSS_TITLE = { x: 128, y: BROWSER_BAR + 56 };
const METER_TOP = BROWSER_BAR + 104;
const ROW_HEIGHT = 40;
const NAME_LEFT = 64;
const BAR_LEFT = 200;
const BAR_WIDTH = 620;

// The compare tray, anchored bottom-left like the real one.
const TRAY = { left: 16, bottom: 504, width: 520, compact: 214, full: 350 };
const TRAY_TOP = TRAY.bottom - TRAY.full;
const ORIGIN = { x: TRAY.left, y: TRAY.bottom };

const KIND_COLOR = { player: "#38bdf8", guild: "#f59e0b", encounter: "#fb7185", raid: "#a78bfa" } as const;
type Kind = keyof typeof KIND_COLOR;

type Player = { name: string; color: string; dps: number };
const PLAYERS: readonly Player[] = [
  { name: "Frostbyte", color: "#69ccf0", dps: 1184 },
  { name: "Gorehowl", color: "#c79c6e", dps: 1131 },
  { name: "Nightshade", color: "#fff569", dps: 1097 },
  { name: "Hexkind", color: "#9482c9", dps: 1042 },
  { name: "Talonfury", color: "#abd473", dps: 968 },
  { name: "Emberly", color: "#69ccf0", dps: 921 },
];
const TOP_DPS = PLAYERS[0].dps;
const TOTAL_DPS = PLAYERS.reduce((sum, player) => sum + player.dps, 0);
const FROSTBYTE = 0;
const NIGHTSHADE = 2;

type Scores = { name: string; color: string; log: number; recent: number; typical: number; best: number; nights: number };
const SCORES: readonly Scores[] = [
  { name: "Frostbyte", color: "#69ccf0", log: 96.2, recent: 91.4, typical: 88.7, best: 98.1, nights: 23 },
  { name: "Nightshade", color: "#fff569", log: 84.5, recent: 87.9, typical: 85.2, best: 96.4, nights: 31 },
];

// Kill and clear times in seconds: min, q1, median, q3, max, then this pull's parse.
type Spread = { scope: string; box: [number, number, number, number, number]; parse: number };
const KILL = { time: 178, axis: [140, 310] as const };
const KILL_SPREADS: readonly Spread[] = [
  { scope: "Server", box: [151, 185, 211, 242, 295], parse: 81 },
  { scope: "Realm", box: [160, 190, 218, 250, 298], parse: 79 },
  { scope: "Guild", box: [172, 182, 194, 210, 228], parse: 92 },
];
const CLEAR = { time: 3734, axis: [3000, 7800] as const };
const CLEAR_SPREADS: readonly Spread[] = [
  { scope: "Server", box: [3261, 4320, 5040, 6060, 7440], parse: 91 },
  { scope: "Realm", box: [3480, 4500, 5220, 6240, 7560], parse: 88 },
  { scope: "Guild", box: [3690, 3900, 4140, 4560, 5220], parse: 96 },
];
const FASTEST = [
  { guild: "Blackrock Vanguard", time: "0:54:21", medal: "#fbbf24" },
  { guild: "Ember Pact", time: "0:58:40", medal: "#cbd5e1" },
  { guild: "Hollow Crown", time: "1:00:05", medal: "#d97706" },
];

export default function EntityInspectorVideo() {
  return (
    <VideoStage>
      <div className="absolute inset-0 bg-[#0d0b16]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_16%,rgba(56,189,248,0.16),transparent_42%),radial-gradient(circle_at_10%_90%,rgba(167,139,250,0.16),transparent_38%)]" />
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Alt+click to inspect and compare"
        bullets={[
          <>Hold <strong>Alt</strong> (Option on Mac) to outline players, guilds, bosses and raids</>,
          <>Alt+click one for its menu, then <strong>Add to compare</strong></>,
          "Compare players on this log's bosses, and chart every night",
          "See boss kills and raid clears against the server, realm and guild",
        ]}
      />
    </VideoStage>
  );
}

function pulse(frame: number, at: number) {
  return interpolate(frame, [at - 2, at + 2, at + 12], [0, 1, 0], clamp);
}

/** 1 while Alt is held, easing in and out around each hold. */
function altHeld(frame: number) {
  return Math.max(...ALT_HOLDS.map(([down, up]) => interpolate(frame, [down, down + 6, up, up + 6], [0, 1, 1, 0], clamp)));
}

/** Camera zoom toward the tray: 0 = page, 1 = tray filling the window. */
function zoomAmount(frame: number) {
  return Math.max(
    interpolate(frame, [ZOOM_IN_1, ZOOM_IN_1 + 26, ZOOM_OUT_1, ZOOM_OUT_1 + 22], [0, 1, 1, 0], ease),
    interpolate(frame, [ZOOM_IN_2, ZOOM_IN_2 + 24, ZOOM_OUT_2, ZOOM_OUT_2 + 22], [0, 1, 1, 0], ease),
    interpolate(frame, [ZOOM_IN_3, ZOOM_IN_3 + 24, FINALE - 10, FINALE + 8], [0, 1, 1, 0], ease),
  );
}

/** Maps a page point to where it lands on screen under the current zoom. */
function onScreen(point: { x: number; y: number }, scale: number) {
  return { x: ORIGIN.x + (point.x - ORIGIN.x) * scale, y: ORIGIN.y + (point.y - ORIGIN.y) * scale };
}

// Points inside the tray, in page coordinates.
const trayPoint = (x: number, y: number) => ({ x: TRAY.left + x, y: TRAY_TOP + y });
const CHART_TAB = trayPoint(105, 99);
const RANGE_180 = trayPoint(416, 20);
const PLAYERS_TAB = trayPoint(79, 20);

type Menu = { kind: Kind; title: string; titleColor: string; items: { icon: ReactNode; label: string }[]; addIndex: number };
const MENU_WIDTH = 236;
const MENU_HEADER = 38;
const MENU_ITEM = 30;

const PLAYER_ITEMS = (name: string) => [
  { icon: <Focus className="h-4 w-4" />, label: `Focus ${name}` },
  { icon: <Plus className="h-4 w-4" />, label: "Add to compare" },
  { icon: <ExternalLink className="h-4 w-4" />, label: "View armory" },
  { icon: <History className="h-4 w-4" />, label: "Performance history" },
  { icon: <Copy className="h-4 w-4" />, label: "Copy name" },
];
const MENUS: { at: number; anchor: { x: number; y: number }; menu: Menu }[] = [
  {
    at: CLICK_P1,
    anchor: { x: NAME_LEFT + 40, y: METER_TOP + FROSTBYTE * ROW_HEIGHT + 30 },
    menu: { kind: "player", title: "Frostbyte", titleColor: "#69ccf0", items: PLAYER_ITEMS("Frostbyte"), addIndex: 1 },
  },
  {
    at: CLICK_P2,
    anchor: { x: NAME_LEFT + 46, y: METER_TOP + NIGHTSHADE * ROW_HEIGHT + 30 },
    menu: { kind: "player", title: "Nightshade", titleColor: "#fff569", items: PLAYER_ITEMS("Nightshade"), addIndex: 1 },
  },
  {
    at: CLICK_BOSS,
    anchor: { x: BOSS_TITLE.x + 40, y: BOSS_TITLE.y + 30 },
    menu: {
      kind: "encounter",
      title: "Ragnaros",
      titleColor: "#f1f5f9",
      items: [
        { icon: <LayoutGrid className="h-4 w-4" />, label: "Go to overview" },
        { icon: <Plus className="h-4 w-4" />, label: "Add to compare" },
        { icon: <Trophy className="h-4 w-4" />, label: "Kill time leaderboard" },
        { icon: <Copy className="h-4 w-4" />, label: "Copy name" },
      ],
      addIndex: 1,
    },
  },
  {
    at: CLICK_RAID,
    anchor: { x: RAID_TITLE.x + 60, y: RAID_TITLE.y + 30 },
    menu: {
      kind: "raid",
      title: "Molten Core",
      titleColor: "#f1f5f9",
      items: [
        { icon: <Plus className="h-4 w-4" />, label: "Add to compare" },
        { icon: <ExternalLink className="h-4 w-4" />, label: "Open log overview" },
        { icon: <Timer className="h-4 w-4" />, label: "Speedrun leaderboard" },
        { icon: <Trophy className="h-4 w-4" />, label: "Statistics leaderboard" },
        { icon: <Copy className="h-4 w-4" />, label: "Copy name" },
      ],
      addIndex: 0,
    },
  },
];
const ADD_AT = [ADD_P1, ADD_P2, ADD_BOSS, ADD_RAID];

/** Where a menu item sits; the first item is followed by a separator. */
function menuItemCenter(anchor: { x: number; y: number }, index: number) {
  return { x: anchor.x + 70, y: anchor.y + MENU_HEADER + index * MENU_ITEM + (index >= 1 ? 6 : 0) + MENU_ITEM / 2 };
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const finale = interpolate(frame, [FINALE, FINALE + 22], [0, 1], ease);
  const zoom = zoomAmount(frame);
  const scale = interpolate(zoom, [0, 1], [1, ZOOM]);

  // Cursor path, in page coordinates: each Alt+click, then its Add to compare.
  const name1 = { x: NAME_LEFT + 36, y: METER_TOP + FROSTBYTE * ROW_HEIGHT + 20 };
  const name2 = { x: NAME_LEFT + 40, y: METER_TOP + NIGHTSHADE * ROW_HEIGHT + 20 };
  const boss = { x: BOSS_TITLE.x + 36, y: BOSS_TITLE.y + 14 };
  const raid = { x: RAID_TITLE.x + 56, y: RAID_TITLE.y + 14 };
  const add = MENUS.map(({ anchor, menu }) => menuItemCenter(anchor, menu.addIndex));
  const chartHover = trayPoint(CHART.left + HOVER_X, CHART.top + chartY(SERIES_180[0][HOVER_NIGHT]));
  const boxHover = trayPoint(PLOT.left + ((KILL.time - KILL.axis[0]) / (KILL.axis[1] - KILL.axis[0])) * PLOT.width, 155);
  const path: [number, { x: number; y: number }, number][] = [
    // [frame, point, zoom the point is seen at]
    [16, { x: 640, y: 420 }, 0],
    [CLICK_P1 - 8, name1, 0],
    [CLICK_P1 + 14, name1, 0],
    [ADD_P1 - 6, add[0], 0],
    [ADD_P1 + 12, add[0], 0],
    [CLICK_P2 - 6, name2, 0],
    [CLICK_P2 + 12, name2, 0],
    [ADD_P2 - 6, add[1], 0],
    [ADD_P2 + 10, add[1], 0],
    [CLICK_CHART - 8, CHART_TAB, 1],
    [CLICK_CHART + 14, CHART_TAB, 1],
    [CLICK_RANGE - 6, RANGE_180, 1],
    [CLICK_RANGE + 10, RANGE_180, 1],
    [HOVER_CHART, chartHover, 1],
    [ZOOM_OUT_1 - 4, chartHover, 1],
    [CLICK_BOSS - 6, boss, 0],
    [CLICK_BOSS + 12, boss, 0],
    [ADD_BOSS - 6, add[2], 0],
    [ADD_BOSS + 10, add[2], 0],
    [HOVER_BOX - 6, boxHover, 1],
    [ZOOM_OUT_2 - 4, boxHover, 1],
    [CLICK_RAID - 6, raid, 0],
    [CLICK_RAID + 12, raid, 0],
    [ADD_RAID - 6, add[3], 0],
    [ADD_RAID + 10, add[3], 0],
    [CLICK_TIER - 8, PLAYERS_TAB, 1],
    [CLICK_TIER + 20, PLAYERS_TAB, 1],
    [CLICK_TIER + 50, trayPoint(560, 330), 1],
  ];
  const screenPath = path.map(([at, point, z]) => [at, onScreen(point, interpolate(z, [0, 1], [1, ZOOM]))] as const);
  const frames = screenPath.map(([at]) => at);
  const cursorX = interpolate(frame, frames, screenPath.map(([, p]) => p.x), ease);
  const cursorY = interpolate(frame, frames, screenPath.map(([, p]) => p.y), ease);
  const clicking = Math.max(
    ...[CLICK_P1, ADD_P1, CLICK_P2, ADD_P2, CLICK_CHART, CLICK_RANGE, CLICK_BOSS, ADD_BOSS, CLICK_RAID, ADD_RAID, CLICK_TIER].map((at) => pulse(frame, at)),
  );
  const cursorOpacity = interpolate(frame, [10, 22, CLICK_TIER + 50, CLICK_TIER + 64], [0, 1, 1, 0], clamp);

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
        <div className="absolute inset-0" style={{ scale: String(scale), transformOrigin: `${ORIGIN.x}px ${ORIGIN.y}px` }}>
          <PageScene frame={frame} zoom={zoom} />
          <Tray frame={frame} />
          <KillHoverCard frame={frame} />
          {MENUS.map(({ at, anchor, menu }, i) => (
            <EntityMenu key={menu.title} frame={frame} openAt={at} closeAt={ADD_AT[i]} anchor={anchor} menu={menu} />
          ))}
        </div>
        <BrowserBar url="chronicleclassic.com/instances/molten-core?encounter=Ragnaros" />
        <div style={{ opacity: cursorOpacity }}>
          <Cursor x={cursorX} y={cursorY} clicking={clicking} />
        </div>
      </div>

      <AltKey frame={frame} />
      <Captions frame={frame} />
      {frame >= FINALE && <Finale progress={finale} />}
    </>
  );
}

function BrowserBar({ url }: { url: string }) {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#0d1117] px-3" style={{ height: BROWSER_BAR }}>
      <div className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
      </div>
      <div className="rounded-md bg-white/5 px-3 py-0.5 font-mono text-[11px] text-muted-foreground">{url}</div>
    </div>
  );
}

/** A dashed outline in the entity's kind color, shown while Alt is held. */
function Outline({ kind, held, inset = -4 }: { kind: Kind; held: number; inset?: number }) {
  return (
    <span
      className="pointer-events-none absolute rounded border border-dashed"
      style={{ inset, borderColor: KIND_COLOR[kind], opacity: held, boxShadow: `0 0 12px ${KIND_COLOR[kind]}33` }}
    />
  );
}

function PageScene({ frame, zoom }: { frame: number; zoom: number }) {
  const held = altHeld(frame);
  // The first hold also shows which color is which.
  const legend = interpolate(frame, [ALT_DOWN + 8, ALT_DOWN + 20, CLICK_P1 - 4, CLICK_P1 + 6], [0, 1, 1, 0], clamp);

  return (
    <div className="absolute inset-0" style={{ opacity: interpolate(zoom, [0, 1], [1, 0.35]) }}>
      <div className="absolute flex items-baseline gap-3" style={{ left: RAID_TITLE.x, top: RAID_TITLE.y }}>
        <span className="relative text-2xl font-bold">
          Molten Core
          <Outline kind="raid" held={held} />
        </span>
        <span className="relative text-lg font-semibold text-amber-300/90">
          &lt;Ember Pact&gt;
          <Outline kind="guild" held={held} />
        </span>
        <span className="text-sm text-muted-foreground">Oct 29 · cleared in 1:02:14</span>
      </div>
      <div className="absolute flex items-center gap-2 text-lg text-muted-foreground" style={{ left: RAID_TITLE.x, top: BOSS_TITLE.y }}>
        Damage Done ·
        <span className="relative font-semibold text-foreground" style={{ left: 0 }}>
          Ragnaros
          <Outline kind="encounter" held={held} />
        </span>
        <span className="font-mono text-sm">2:58</span>
      </div>

      <div className="absolute flex gap-4 rounded-full border border-white/10 bg-black/40 px-4 py-1.5 text-sm" style={{ right: 24, top: RAID_TITLE.y + 2, opacity: legend }}>
        {(
          [
            ["player", "Players"],
            ["guild", "Guilds"],
            ["encounter", "Bosses"],
            ["raid", "Raids"],
          ] as const
        ).map(([kind, label]) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed" style={{ borderColor: KIND_COLOR[kind] }} />
            {label}
          </span>
        ))}
      </div>

      {PLAYERS.map((player, i) => {
        const top = METER_TOP + i * ROW_HEIGHT;
        return (
          <div key={player.name} className="absolute" style={{ left: 24, right: 24, top, height: ROW_HEIGHT - 6 }}>
            <Outline kind="player" held={held} inset={-2} />
            <div className="absolute inset-y-0 overflow-hidden rounded-sm bg-white/5" style={{ left: BAR_LEFT - 24, width: BAR_WIDTH }}>
              <div className="absolute inset-y-0 left-0" style={{ width: (player.dps / TOP_DPS) * BAR_WIDTH, background: player.color, opacity: 0.7 }} />
            </div>
            <span className="absolute top-1.5 w-6 text-right font-mono text-sm text-muted-foreground" style={{ left: 0 }}>{i + 1}</span>
            <span className="absolute top-1 text-lg font-semibold" style={{ left: NAME_LEFT - 24, color: player.color }}>{player.name}</span>
            <span className="absolute top-1 font-mono text-lg font-semibold tabular-nums" style={{ left: BAR_LEFT - 24 + BAR_WIDTH + 24 }}>
              {player.dps.toLocaleString("en-US")}
            </span>
            <span className="absolute top-1.5 font-mono text-sm tabular-nums text-muted-foreground" style={{ left: BAR_LEFT - 24 + BAR_WIDTH + 104 }}>
              {((player.dps / TOTAL_DPS) * 100).toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EntityMenu({ frame, openAt, closeAt, anchor, menu }: { frame: number; openAt: number; closeAt: number; anchor: { x: number; y: number }; menu: Menu }) {
  const open = interpolate(frame, [openAt + 1, openAt + 7, closeAt + 1, closeAt + 6], [0, 1, 1, 0], clamp);
  if (open === 0) {
    return null;
  }
  // The first item is highlighted until the cursor reaches Add to compare.
  const hovered = frame >= closeAt - 10 ? menu.addIndex : 0;
  return (
    <div
      className="absolute z-20 overflow-hidden rounded-md border border-white/10 bg-[#1c1c1f] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
      style={{ left: anchor.x, top: anchor.y, width: MENU_WIDTH, opacity: open, scale: String(interpolate(open, [0, 1], [0.96, 1])), transformOrigin: "top left" }}
    >
      <div className="flex items-center justify-between px-3" style={{ height: MENU_HEADER - 4 }}>
        <span className="text-[15px] font-semibold" style={{ color: menu.titleColor }}>{menu.title}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: KIND_COLOR[menu.kind] }}>{menu.kind}</span>
      </div>
      {menu.items.map((item, i) => (
        <div key={item.label}>
          <div
            className={`mx-1 flex items-center gap-2.5 rounded px-2 text-sm ${i === hovered ? "bg-[#8a6a43] text-white" : "text-slate-200"}`}
            style={{ height: MENU_ITEM }}
          >
            <span className="text-slate-300">{item.icon}</span>
            {item.label}
          </div>
          {i === 0 && <div className="my-[3px] h-px bg-white/10" />}
        </div>
      ))}
    </div>
  );
}

/** Which tray view is showing, as opacities (crossfading on each change). */
function trayViews(frame: number) {
  const window = (from: number, to: number) => interpolate(frame, [from, from + FADE, to, to + FADE], [0, 1, 1, 0], clamp);
  return {
    players: window(ADD_P1, ADD_BOSS),
    encounter: window(ADD_BOSS, ADD_RAID),
    raid: window(ADD_RAID, CLICK_TIER + 2),
    preview: interpolate(frame, [CLICK_TIER + 2, CLICK_TIER + 2 + FADE], [0, 1], clamp),
  };
}

function Tray({ frame }: { frame: number }) {
  const appear = interpolate(frame, [ADD_P1 + 2, ADD_P1 + 16], [0, 1], ease);
  if (appear === 0) {
    return null;
  }
  const grow = interpolate(frame, [ADD_P2 + 2, ADD_P2 + 20], [0, 1], ease);
  const height = interpolate(grow, [0, 1], [TRAY.compact, TRAY.full]);
  const views = trayViews(frame);
  const active = frame < ADD_BOSS ? "players" : frame < ADD_RAID ? "encounter" : frame < CLICK_TIER + 2 ? "raid" : "players";

  const tabs = [
    { key: "players", label: grow > 0.5 ? "2 players" : "1 player", color: KIND_COLOR.player, from: ADD_P1 },
    { key: "encounter", label: "1 encounter", color: KIND_COLOR.encounter, from: ADD_BOSS },
    { key: "raid", label: "1 raid", color: KIND_COLOR.raid, from: ADD_RAID },
  ].filter((tab) => frame >= tab.from);

  const chips: Record<string, { name: string; color: string }[]> = {
    players: grow > 0.5 ? SCORES.map(({ name, color }) => ({ name, color })) : [{ name: "Frostbyte", color: "#69ccf0" }],
    encounter: [{ name: "Ragnaros", color: KIND_COLOR.encounter }],
    raid: [{ name: "Molten Core", color: KIND_COLOR.raid }],
  };

  return (
    <div
      className="absolute z-10 overflow-hidden rounded-lg border border-white/10 bg-[#1b1b1e] shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
      style={{
        left: TRAY.left,
        top: TRAY.bottom - height,
        width: TRAY.width,
        height,
        opacity: appear,
        translate: `0 ${interpolate(appear, [0, 1], [30, 0])}px`,
      }}
    >
      <div className="absolute inset-x-0 top-0 flex h-10 items-center border-b border-white/10 px-3">
        <GitCompareArrows className="h-4 w-4 text-sky-400" />
        <div className="ml-2 flex gap-1">
          {tabs.map((tab) => (
            <span
              key={tab.key}
              className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-[13px] ${tab.key === active ? "bg-white/10 text-white" : "text-slate-400"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: tab.color }} />
              {tab.label}
            </span>
          ))}
        </div>
        <RangePicker frame={frame} />
        <div className="ml-auto flex items-center gap-2 text-slate-400">
          <Maximize2 className="h-4 w-4" />
          <Trash2 className="h-4 w-4" />
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>

      <div className="absolute inset-x-3 top-12 flex items-center gap-1.5">
        {chips[active].map((chip) => (
          <span key={chip.name} className="flex items-center gap-1 rounded border px-2 py-0.5 text-[13px]" style={{ borderColor: `${chip.color}88`, color: chip.color }}>
            {chip.name}
            <X className="h-3 w-3 text-slate-400" />
          </span>
        ))}
        <span className="ml-auto text-xs text-slate-400">{chips[active].length}/5 · Clear</span>
      </div>

      <div className="absolute inset-0" style={{ opacity: views.players * (1 - grow) }}>
        <OnePlayerSummary />
      </div>
      <div className="absolute inset-0" style={{ opacity: views.players * grow }}>
        <PlayerCompare frame={frame} />
      </div>
      <div className="absolute inset-0" style={{ opacity: views.encounter }}>
        <EncounterView />
      </div>
      <div className="absolute inset-0" style={{ opacity: views.raid }}>
        <RaidView />
      </div>
      <div className="absolute inset-0" style={{ opacity: views.preview }}>
        <PreviewView />
      </div>

      <TrayFooter views={views} />
    </div>
  );
}

function RangePicker({ frame }: { frame: number }) {
  const selected = frame >= CLICK_RANGE ? "180d" : "60d";
  return (
    <div className="absolute flex rounded bg-black/30 p-0.5 text-xs" style={{ left: 320, top: 8 }}>
      {["30d", "60d", "180d"].map((range) => (
        <span key={range} className={`rounded px-2 py-0.5 ${range === selected ? "bg-white/15 text-white" : "text-slate-400"}`}>
          {range}
        </span>
      ))}
    </div>
  );
}

function TrayFooter({ views }: { views: ReturnType<typeof trayViews> }) {
  const footer = (key: string, label: string, color: string, opacity: number) => (
    <div
      key={key}
      className="absolute inset-x-3 bottom-3 flex h-8 items-center justify-center gap-1.5 rounded text-sm"
      style={{ background: `${color}26`, color, opacity }}
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </div>
  );
  return (
    <>
      {footer("player", "Open performance history", KIND_COLOR.player, Math.max(views.players, views.preview))}
      {footer("encounter", "Open log overview", KIND_COLOR.encounter, views.encounter)}
      {footer("raid", "Open log overview", KIND_COLOR.raid, views.raid)}
    </>
  );
}

function parseColor(value: number) {
  if (value >= 95) return "#ff8000";
  if (value >= 75) return "#b86cf2";
  if (value >= 50) return "#3b8bff";
  return "#4ade80";
}

function OnePlayerSummary() {
  const player = SCORES[0];
  const stats = [
    ["This log", player.log],
    ["Recent", player.recent],
    ["Typical", player.typical],
    ["Best", player.best],
  ] as const;
  return (
    <div className="absolute inset-x-3" style={{ top: 88 }}>
      <p className="text-xs text-slate-400">Molten Core · same fights as this log</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded bg-white/5 px-2 py-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
            <p className="font-mono text-lg font-semibold" style={{ color: parseColor(value) }}>{value.toFixed(1)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Segmented({ options, selected, left }: { options: string[]; selected: string; left: number }) {
  return (
    <div className="absolute flex rounded bg-black/30 p-0.5 text-[13px]" style={{ left, top: 88 }}>
      {options.map((option) => (
        <span key={option} className={`rounded px-2.5 py-0.5 ${option === selected ? "bg-white/15 text-white" : "text-slate-400"}`}>
          {option}
        </span>
      ))}
    </div>
  );
}

const COLUMNS = [
  { label: "This log", right: 226, key: "log" },
  { label: "Recent", right: 296, key: "recent" },
  { label: "Typical", right: 366, key: "typical" },
  { label: "Best", right: 436, key: "best" },
] as const;

function PlayerCompare({ frame }: { frame: number }) {
  const chart = interpolate(frame, [CLICK_CHART, CLICK_CHART + 10], [0, 1], clamp);
  return (
    <>
      <Segmented options={["Score", "Chart"]} selected={chart > 0.5 ? "Chart" : "Score"} left={12} />
      <Segmented options={["Parse", "Value"]} selected="Parse" left={318} />
      <Segmented options={["DPS", "HPS"]} selected="DPS" left={420} />
      <p className="absolute left-3 text-xs text-slate-400" style={{ top: 124 }}>
        <span className="font-semibold text-slate-200">Molten Core</span> · 10 bosses · same fights as this log
      </p>
      <div className="absolute inset-0" style={{ opacity: 1 - chart }}>
        <ScoreTable />
      </div>
      <div className="absolute inset-0" style={{ opacity: chart }}>
        <ParseChart frame={frame} />
      </div>
    </>
  );
}

function ScoreTable() {
  return (
    <>
      <div className="absolute inset-x-3 border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400" style={{ top: 150, height: 22 }}>
        {COLUMNS.map((column) => (
          <span key={column.key} className="absolute text-right" style={{ right: TRAY.width - 24 - column.right, width: 70 }}>{column.label}</span>
        ))}
        <span className="absolute right-0">Nights</span>
      </div>
      {SCORES.map((player, i) => (
        <div key={player.name} className="absolute inset-x-3 border-b border-white/5" style={{ top: 176 + i * 34, height: 34 }}>
          <span className="absolute top-1.5 flex items-center gap-2 text-[15px]" style={{ color: player.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: player.color }} />
            {player.name}
          </span>
          {COLUMNS.map((column) => (
            <span
              key={column.key}
              className="absolute top-1.5 text-right font-mono text-[15px] font-semibold tabular-nums"
              style={{ right: TRAY.width - 24 - column.right, width: 70, color: parseColor(player[column.key]) }}
            >
              {player[column.key].toFixed(1)}
            </span>
          ))}
          <span className="absolute right-0 top-1.5 font-mono text-[15px] tabular-nums">{player.nights}</span>
        </div>
      ))}
    </>
  );
}

/** A deterministic, gently noisy series of parses. */
function series(seed: number, count: number, base: number, swing: number) {
  return Array.from({ length: count }, (_, i) => {
    const noise = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const jitter = (noise - Math.floor(noise) - 0.5) * 2;
    return Math.min(99.5, base + jitter * swing + Math.sin((i + seed) / 3) * 2);
  });
}

const CHART = { left: 44, top: 168, width: 462, height: 96, min: 60, max: 100 };
const SERIES_180 = [series(1, 30, 88.5, 6), series(2, 34, 85, 8)];
// 60 days is the tail of the same nights.
const SERIES_60 = SERIES_180.map((values) => values.slice(-11));

// The hover readout sits on the 26th of 30 nights in the 180-day view.
const HOVER_NIGHT = 25;
const HOVER_X = (HOVER_NIGHT / (SERIES_180[0].length - 1)) * CHART.width;

function chartY(value: number) {
  return CHART.height - ((value - CHART.min) / (CHART.max - CHART.min)) * CHART.height;
}

function linePoints(values: number[]) {
  return values
    .map((value, i) => {
      const x = (i / (values.length - 1)) * CHART.width;
      return `${x.toFixed(1)},${chartY(value).toFixed(1)}`;
    })
    .join(" ");
}

function ParseChart({ frame }: { frame: number }) {
  const wide = interpolate(frame, [CLICK_RANGE + 2, CLICK_RANGE + 12], [0, 1], clamp);
  const draw = interpolate(frame, [CLICK_CHART, CLICK_CHART + 30], [0, 1], ease);
  const hover = interpolate(frame, [HOVER_CHART, HOVER_CHART + 8], [0, 1], clamp);
  const bandTop = chartY(91);
  const bandBottom = chartY(85);
  const hoverX = HOVER_X;

  return (
    <>
      <p className="absolute left-3 text-xs text-slate-400" style={{ top: 144 }}>Parse per night, higher is better</p>
      <span className="absolute font-mono text-[10px] text-slate-500" style={{ left: 12, top: CHART.top - 6 }}>100</span>
      <span className="absolute font-mono text-[10px] text-slate-500" style={{ left: 18, top: CHART.top + CHART.height - 8 }}>60</span>
      <svg
        className="absolute overflow-visible"
        style={{ left: CHART.left, top: CHART.top }}
        width={CHART.width}
        height={CHART.height}
      >
        <rect x={0} y={bandTop} width={CHART.width} height={bandBottom - bandTop} fill="#38bdf8" opacity={0.1} />
        <line x1={0} x2={CHART.width} y1={CHART.height} y2={CHART.height} stroke="rgba(255,255,255,0.12)" />
        <clipPath id="chart-draw">
          <rect x={0} y={-10} width={CHART.width * draw} height={CHART.height + 20} />
        </clipPath>
        <g clipPath="url(#chart-draw)">
          {[SERIES_60, SERIES_180].map((set, setIndex) => (
            <g key={setIndex} opacity={setIndex === 0 ? 1 - wide : wide}>
              {set.map((values, i) => (
                <polyline key={i} points={linePoints(values)} fill="none" stroke={SCORES[i].color} strokeWidth={2} strokeLinejoin="round" />
              ))}
            </g>
          ))}
        </g>
        <line x1={hoverX} x2={hoverX} y1={0} y2={CHART.height} stroke="rgba(255,255,255,0.4)" opacity={hover} />
      </svg>
      <span className="absolute text-[10px] text-slate-500" style={{ left: CHART.left, top: CHART.top + CHART.height + 4 }}>
        {wide > 0.5 ? "180" : "60"} days ago
      </span>
      <span className="absolute text-[10px] text-slate-500" style={{ right: 14, top: CHART.top + CHART.height + 4 }}>Today</span>
      <div
        className="absolute rounded-md border border-white/10 bg-black/90 px-3 py-2 text-xs shadow-lg"
        style={{ left: CHART.left + hoverX - 170, top: CHART.top - 10, width: 150, opacity: hover }}
      >
        <p className="font-semibold text-slate-200">Oct 8 · 10 bosses</p>
        {SCORES.map((player, i) => {
          const value = SERIES_180[i][HOVER_NIGHT];
          return (
            <p key={player.name} className="mt-0.5 flex justify-between">
              <span style={{ color: player.color }}>{player.name}</span>
              <span className="font-mono" style={{ color: parseColor(value) }}>{value.toFixed(1)}</span>
            </p>
          );
        })}
      </div>
    </>
  );
}

const PLOT = { left: 90, width: 350 };

function BoxPlotRows({ spreads, axis, value, format, top: rowsTop = 144 }: { spreads: readonly Spread[]; axis: readonly [number, number]; value: number; format: (s: number) => string; top?: number }) {
  const x = (seconds: number) => PLOT.left + ((seconds - axis[0]) / (axis[1] - axis[0])) * PLOT.width;
  return (
    <>
      {spreads.map((spread, i) => {
        const [min, q1, median, q3, max] = spread.box;
        const top = rowsTop + i * 26;
        return (
          <div key={spread.scope} className="absolute inset-x-0" style={{ top, height: 24 }}>
            <span className="absolute left-3 top-1 text-[11px] uppercase tracking-wider text-slate-400">{spread.scope}</span>
            <span className="absolute top-[11px] h-px bg-slate-500" style={{ left: x(min), width: x(max) - x(min) }} />
            <span className="absolute top-1 h-[15px] rounded-sm border border-slate-400/70 bg-white/10" style={{ left: x(q1), width: x(q3) - x(q1) }} />
            <span className="absolute top-0.5 h-[19px] w-0.5 bg-white" style={{ left: x(median) }} />
            <span className="absolute top-[6px] h-[11px] w-[11px] rounded-full border-2 border-[#1b1b1e] bg-sky-400" style={{ left: x(value) - 5.5 }} />
            <span className="absolute right-4 top-0.5 font-mono text-[14px] font-semibold" style={{ color: parseColor(spread.parse) }}>{spread.parse}</span>
          </div>
        );
      })}
      <span className="absolute font-mono text-[11px] text-slate-500" style={{ left: PLOT.left - 10, top: rowsTop + 76 }}>{format(axis[0])}</span>
      <span className="absolute font-mono text-[11px] text-slate-500" style={{ left: PLOT.left + PLOT.width - 30, top: rowsTop + 76 }}>{format(axis[1])}</span>
    </>
  );
}

function minutes(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function hours(seconds: number) {
  return `${Math.floor(seconds / 3600)}:${minutes(seconds % 3600).padStart(5, "0")}`;
}

function EncounterView() {
  return (
    <>
      <p className="absolute left-3 text-xs text-slate-400" style={{ top: 90 }}>Kill times, fastest on the left. The dot is this pull; the number is its parse.</p>
      <p className="absolute inset-x-3 flex justify-between text-[15px]" style={{ top: 116 }}>
        <span className="flex items-center gap-2 font-semibold">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          Ragnaros · Molten Core
        </span>
        <span className="font-mono font-semibold">{minutes(KILL.time)}</span>
      </p>
      <BoxPlotRows spreads={KILL_SPREADS} axis={KILL.axis} value={KILL.time} format={minutes} />
    </>
  );
}

/** The kill-time hover card, beside the tray so the plots stay visible. */
function KillHoverCard({ frame }: { frame: number }) {
  const card = interpolate(frame, [HOVER_BOX, HOVER_BOX + 8, ZOOM_OUT_2 - 6, ZOOM_OUT_2], [0, 1, 1, 0], clamp);
  if (card === 0) {
    return null;
  }
  const [min, q1, median, q3, max] = KILL_SPREADS[0].box;
  return (
    <div
      className="absolute z-30 rounded-md border border-white/10 bg-black/95 p-3 text-[13px] shadow-xl"
      style={{ left: TRAY.left + TRAY.width + 12, top: TRAY_TOP + 96, width: 250, opacity: card, translate: `${interpolate(card, [0, 1], [-6, 0])}px 0` }}
    >
      <p className="flex justify-between border-b border-white/10 pb-1.5">
        <span className="font-semibold">Server · Ragnaros</span>
        <span className="text-[11px] text-slate-400">148 kills · 60d</span>
      </p>
      {[
        ["Fastest", minutes(min)],
        ["Middle half", `${minutes(q1)} – ${minutes(q3)}`],
        ["Median", minutes(median)],
        ["Slowest", minutes(max)],
      ].map(([label, value]) => (
        <p key={label} className="mt-1 flex justify-between text-slate-300">
          <span>{label}</span>
          <span className="font-mono">{value}</span>
        </p>
      ))}
      <p className="mt-2 flex justify-between border-t border-white/10 pt-1.5">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" />This pull</span>
        <span className="font-mono font-semibold">{minutes(KILL.time)}</span>
      </p>
      <p className="text-right text-emerald-400">{minutes(median - KILL.time)} faster than the median</p>
      <p className="mt-1 flex justify-between">
        <span>Parse <span className="font-semibold" style={{ color: parseColor(81) }}>81</span></span>
        <span className="text-[11px] text-slate-400">rank 28 of 148</span>
      </p>
    </div>
  );
}

function RaidView() {
  return (
    <>
      <p className="absolute left-3 text-xs text-slate-400" style={{ top: 86 }}>Full clears, fastest on the left. The dot is this clear; the number is its parse.</p>
      <p className="absolute inset-x-3 flex justify-between text-[15px]" style={{ top: 106 }}>
        <span className="flex items-center gap-2 font-semibold">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          Molten Core · <span className="text-amber-300/90">&lt;Ember Pact&gt;</span>
        </span>
        <span className="font-mono font-semibold">{hours(CLEAR.time)}</span>
      </p>
      <BoxPlotRows spreads={CLEAR_SPREADS} axis={CLEAR.axis} value={CLEAR.time} format={hours} top={132} />
      <div className="absolute inset-x-3 rounded bg-white/5 px-3 py-1" style={{ top: 226 }}>
        <p className="text-[10px] uppercase tracking-wider text-slate-400">Fastest clears</p>
        {FASTEST.map((run, i) => (
          <p key={run.guild} className="flex items-center gap-2 text-[13px] leading-[17px]">
            <span className="grid h-3.5 w-3.5 place-items-center rounded-full text-[9px] font-bold text-black" style={{ background: run.medal }}>{i + 1}</span>
            <span className="flex-1">{run.guild}</span>
            <span className="font-mono font-semibold">{run.time}</span>
          </p>
        ))}
      </div>
    </>
  );
}

function PreviewView() {
  return (
    <>
      <div className="absolute inset-0" style={{ filter: "blur(5px)", opacity: 0.6 }}>
        <Segmented options={["Score", "Chart"]} selected="Score" left={12} />
        <ScoreTable />
      </div>
      <div className="absolute inset-x-6 flex flex-col items-center text-center" style={{ top: 100 }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">What Friendly and Honored see</p>
        <p className="mt-2 flex items-center gap-1.5 text-[15px] font-semibold">
          <Lock className="h-4 w-4 text-sky-400" />
          See their scores right here
        </p>
        <p className="mt-1 text-[13px] text-slate-300">
          Revered supporters see how everyone did on the fights you&apos;re viewing, their usual and their trend.
        </p>
        <span className="mt-3 rounded bg-[#0b74de] px-4 py-1.5 text-[13px] font-semibold text-white">Become Revered</span>
      </div>
    </>
  );
}

function AltKey({ frame }: { frame: number }) {
  const held = altHeld(frame);
  // Hidden while zoomed into the tray, where Alt isn't in play.
  const visible = interpolate(frame, [ALT_DOWN - 6, ALT_DOWN, CLICK_RAID + 20, CLICK_RAID + 30], [0, 1, 1, 0], clamp) * (1 - zoomAmount(frame));
  return (
    <div className="absolute flex items-center gap-3" style={{ right: 72, bottom: 92, opacity: visible }}>
      <span
        className="grid h-14 w-[88px] place-items-center rounded-lg border border-white/25 font-mono text-xl font-semibold"
        style={{
          background: held > 0.5 ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.06)",
          borderBottomWidth: interpolate(held, [0, 1], [5, 2]),
          translate: `0 ${held * 3}px`,
          color: held > 0.5 ? "#e0f2fe" : "#94a3b8",
        }}
      >
        Alt
      </span>
    </div>
  );
}

const CAPTIONS: { step: number; text: ReactNode; from: number; to: number }[] = [
  { step: 1, text: <>Hold <span className="text-sky-300">Alt</span> (Option on Mac) to see what you can inspect</>, from: 16, to: CLICK_P1 + 10 },
  { step: 2, text: <>Alt+click a name, then <span className="text-sky-300">Add to compare</span></>, from: CLICK_P1 + 14, to: ZOOM_IN_1 + 4 },
  { step: 3, text: "Their parses on the same bosses as this log", from: ZOOM_IN_1 + 10, to: CLICK_CHART - 2 },
  { step: 4, text: "Chart every night over 30, 60 or 180 days", from: CLICK_CHART + 2, to: ZOOM_OUT_1 + 16 },
  { step: 5, text: <>Bosses: the kill against the <span className="text-rose-300">server, realm and guild</span></>, from: ZOOM_OUT_1 + 22, to: ZOOM_OUT_2 + 16 },
  { step: 6, text: <>Raids: the clear time, plus the <span className="text-violet-300">speedrun top 3</span></>, from: ZOOM_OUT_2 + 22, to: CLICK_TIER - 4 },
  { step: 7, text: "Player scores are a Revered perk. Bosses and raids are free.", from: CLICK_TIER + 2, to: FINALE - 4 },
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
      <MousePointerClick className="h-14 w-14 text-sky-300" />
      <h2 className="font-wow mt-4 text-[64px] font-bold tracking-tight">Alt+click anything</h2>
      <p className="mt-2 text-2xl text-muted-foreground">Inspect and compare players, guilds, bosses and raids without leaving the page.</p>
      <div className="mt-8 flex gap-3 font-mono text-lg">
        {["Alt + click", "Option + click on Mac", "Press and hold on touch"].map((label) => (
          <span key={label} className="rounded-full border border-white/15 bg-white/5 px-5 py-2">{label}</span>
        ))}
      </div>
    </div>
  );
}
