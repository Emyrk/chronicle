/**
 * Battleground instance view, starting with Warsong Gulch.
 *
 * One playhead drives every region: the battlefield map (the replay's own
 * MapView2D / MapView3D fed by the same markers), the scoreboard, the
 * objective timeline, the kill feed and the comparison. Each region notes the
 * EventsPanel / processor it would reuse ("Data sources").
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowUpDown, Crosshair, Flag, Pause, Play, RotateCcw, Skull, Star, Swords, Undo2, Users } from "lucide-react";
import { MapView2D, type MapViewRequest } from "@/pages/Instance/EventsPanels/Map/MapView2D";
import type { MapSceneGround, MapSceneMarker } from "@/pages/Instance/EventsPanels/Map/useMapScene";
import type { MapPositionSample } from "@/pages/Instance/EventsPanels/Map/map.processor";
import { FULL_MAP_VIEWPORT, type MapPoint } from "@/pages/Instance/EventsPanels/Map/mapModel";
import {
  flagStateAt,
  healthAt,
  isDead,
  positionAt,
  scoreAt,
  scoreboardAt,
  WSG_BOUNDS,
  WSG_POI,
  type BgPlayer,
  type Faction,
  type FlagState,
  type MatchMoment,
  type ScoreRow,
  type WsgMatch,
} from "./wsgMatch";

const MapView3D = lazy(() => import("@/pages/Instance/EventsPanels/Map/MapView3D"));

const FACTION_COLOR: Record<Faction, string> = { alliance: "#4f8ff7", horde: "#e5484d" };
const FACTION_LABEL: Record<Faction, string> = { alliance: "Alliance", horde: "Horde" };
const FACTIONS: Faction[] = ["alliance", "horde"];
const other = (faction: Faction): Faction => (faction === "alliance" ? "horde" : "alliance");

// North up: world x runs top→bottom, world y runs left→right (west is left).
const SPAN_X = WSG_BOUNDS.maxX - WSG_BOUNDS.minX;
const SPAN_Y = WSG_BOUNDS.maxY - WSG_BOUNDS.minY;
const CANVAS = { width: SPAN_Y * 2, height: SPAN_X * 2 };
const GROUND: MapSceneGround = {
  iconBaseUrl: "",
  canvas: { floor: 1, width: CANVAS.width, height: CANVAS.height, tileWidth: 256, tileHeight: 256, tiles: [] },
};
const toSvg = (p: { x: number; y: number }) => ({ sx: (WSG_BOUNDS.maxY - p.y) * 2, sy: (WSG_BOUNDS.maxX - p.x) * 2 });
const projectSample = (sample: { x: number; y: number }): MapPoint => ({
  leftPercent: ((WSG_BOUNDS.maxY - sample.y) / SPAN_Y) * 100,
  topPercent: ((WSG_BOUNDS.maxX - sample.x) / SPAN_X) * 100,
});

const classColor = (className: string) => `var(--color-class-${className})`;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toString();
}

type MapLayer = "trails" | "deaths" | "heatmap";
type FollowMode = "none" | Faction;

export interface WarsongGulchViewProps {
  match: WsgMatch;
  initialCursorMs?: number;
  initialMode?: "2d" | "3d";
  initialSources?: boolean;
  initialPlaying?: boolean;
}

export function WarsongGulchView({ match, initialCursorMs = 0, initialMode = "2d", initialSources = false, initialPlaying = false }: WarsongGulchViewProps) {
  const [cursorMs, setCursorMs] = useState(initialCursorMs);
  const [playing, setPlaying] = useState(initialPlaying);
  const [speed, setSpeed] = useState(8);
  const [mode, setMode] = useState(initialMode);
  const [layers, setLayers] = useState<Set<MapLayer>>(() => new Set(["trails", "deaths"]));
  const [follow, setFollow] = useState<FollowMode>("none");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showSources, setShowSources] = useState(initialSources);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCursorMs((previous) => {
        const next = previous + 100 * speed;
        if (next >= match.durationMs) {
          setPlaying(false);
          return match.durationMs;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, speed, match.durationMs]);

  const playersByGuid = useMemo(() => new Map(match.players.map((p) => [p.guid, p])), [match]);
  const flags = flagStateAt(match, cursorMs);
  const score = scoreAt(match, cursorMs);
  const board = useMemo(() => scoreboardAt(match, cursorMs), [match, cursorMs]);
  const toggleSelected = (guid: string) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(guid)) next.delete(guid);
    else next.add(guid);
    return next;
  });

  const ctx: ViewCtx = { match, cursorMs, setCursorMs, playersByGuid, selected, toggleSelected, showSources };

  return (
    <div className="flex flex-col gap-3 bg-background p-3 text-foreground">
      <MatchHeader ctx={ctx} score={score} flags={flags} onToggleSources={() => setShowSources((v) => !v)} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[260px_minmax(0,1fr)_minmax(0,520px)]">
        <MomentsList ctx={ctx} />
        <Battlefield
          ctx={ctx}
          flags={flags}
          mode={mode}
          setMode={setMode}
          layers={layers}
          setLayers={setLayers}
          follow={follow}
          setFollow={setFollow}
          playing={playing}
          speed={speed}
        />
        <Scoreboard ctx={ctx} board={board} />
      </div>
      <MatchTimeline ctx={ctx} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <FlagCarriers ctx={ctx} />
        <KillFeed ctx={ctx} />
        <TeamComparison ctx={ctx} board={board} />
      </div>
    </div>
  );
}

interface ViewCtx {
  match: WsgMatch;
  cursorMs: number;
  setCursorMs: (ms: number) => void;
  playersByGuid: Map<string, BgPlayer>;
  selected: Set<string>;
  toggleSelected: (guid: string) => void;
  showSources: boolean;
}

function Section({ title, hint, source, actions, className = "", children }: { title: string; hint?: string; source?: string; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-lg border border-border bg-card ${className}`}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </header>
      {source && <SourceNote source={source} />}
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  );
}

// Shown while "Data sources" is on: which existing panel/processor feeds the region.
function SourceNote({ source }: { source: string }) {
  return <div className="border-b border-dashed border-amber-400/30 bg-amber-400/5 px-3 py-1 text-[11px] text-amber-200/90">{source}</div>;
}

function PlayerName({ player, className = "" }: { player: BgPlayer; className?: string }) {
  return <span className={`font-medium ${className}`} style={{ color: classColor(player.className) }}>{player.name}</span>;
}

function Chip({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-xs transition-colors ${active ? "border-sky-400/60 bg-sky-400/15 text-sky-100" : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Header

function flagStatus(ctx: ViewCtx, flag: Faction, state: FlagState): ReactNode {
  const label = `${FACTION_LABEL[flag]} flag`;
  if (state.carrier) {
    const carrier = ctx.playersByGuid.get(state.carrier)!;
    return <>{label}: carried by <PlayerName player={carrier} /> <span className="font-mono text-muted-foreground">{formatClock(ctx.cursorMs - state.since)}</span></>;
  }
  if (state.dropped) return <>{label}: <span className="text-amber-300">on the ground</span> <span className="font-mono text-muted-foreground">{formatClock(ctx.cursorMs - state.since)}</span></>;
  return <>{label}: <span className="text-muted-foreground">at base</span></>;
}

function MatchHeader({ ctx, score, flags, onToggleSources }: { ctx: ViewCtx; score: Record<Faction, number>; flags: Record<Faction, FlagState>; onToggleSources: () => void }) {
  const { match } = ctx;
  const started = new Date(match.startedAt);
  const recorder = match.players.find((p) => p.name === match.recorder);
  return (
    <header
      className="grid grid-cols-1 items-center gap-4 rounded-lg border border-border px-4 py-3 md:grid-cols-[1fr_auto_1fr]"
      style={{ background: `linear-gradient(90deg, ${FACTION_COLOR.alliance}22, transparent 40%, transparent 60%, ${FACTION_COLOR.horde}22)` }}
    >
      <div className="min-w-0">
        <h1 className="font-serif text-2xl font-bold tracking-tight">{match.zone}</h1>
        <p className="text-xs text-muted-foreground">
          {started.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {started.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · recorded by {recorder ? <PlayerName player={recorder} /> : match.recorder}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300">{match.winner === "alliance" ? "Alliance victory" : "Horde victory"}</span>
          <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">{formatClock(match.durationMs)}</span>
          <span className="rounded border border-border bg-muted/40 px-2 py-0.5">10 v 10</span>
          <span className="rounded border border-border bg-muted/40 px-2 py-0.5">Capture the flag · first to 3</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4">
        <TeamTag faction="alliance" note={match.premade.alliance ?? "pick-up group"} align="right" />
        <div className="flex items-baseline gap-3 font-mono text-5xl font-bold tabular-nums">
          <span style={{ color: FACTION_COLOR.alliance }}>{score.alliance}</span>
          <span className="text-2xl text-muted-foreground">–</span>
          <span style={{ color: FACTION_COLOR.horde }}>{score.horde}</span>
        </div>
        <TeamTag faction="horde" note={match.premade.horde ?? "pick-up group"} align="left" />
      </div>
      <div className="flex flex-col items-end gap-1 text-xs">
        <button type="button" onClick={onToggleSources} className={`mb-1 rounded border px-2 py-0.5 ${ctx.showSources ? "border-amber-400/60 bg-amber-400/15 text-amber-100" : "border-border text-muted-foreground hover:text-foreground"}`}>
          Data sources
        </button>
        {FACTIONS.map((flag) => (
          <div key={flag} className="flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5" style={{ color: FACTION_COLOR[flag], fill: FACTION_COLOR[flag] }} />
            <span>{flagStatus(ctx, flag, flags[flag])}</span>
          </div>
        ))}
      </div>
    </header>
  );
}

function TeamTag({ faction, note, align }: { faction: Faction; note: string; align: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: FACTION_COLOR[faction] }}>{FACTION_LABEL[faction]}</div>
      <div className="text-[11px] text-muted-foreground">{note}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match moments

type MomentFilter = "all" | "flags" | "fights";
const MOMENT_ICON: Record<MatchMoment["kind"], ReactNode> = {
  gates: <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground" />,
  pickup: <Flag className="h-3.5 w-3.5" />,
  capture: <Star className="h-3.5 w-3.5" />,
  carrier_kill: <Crosshair className="h-3.5 w-3.5" />,
  return: <Undo2 className="h-3.5 w-3.5" />,
  fight: <Swords className="h-3.5 w-3.5" />,
  end: <Star className="h-3.5 w-3.5" />,
};

function MomentsList({ ctx }: { ctx: ViewCtx }) {
  const [filter, setFilter] = useState<MomentFilter>("all");
  const moments = ctx.match.moments.filter((m) =>
    filter === "all" ? true : filter === "fights" ? m.kind === "fight" || m.kind === "carrier_kill" : m.kind !== "fight");
  const current = [...ctx.match.moments].reverse().find((m) => m.t <= ctx.cursorMs);
  return (
    <Section
      title="Match moments"
      source={ctx.showSources ? "flag aura gains/fades (aura stream) + slain + score; fights = kill clusters (Deaths panel's slain stream)" : undefined}
      actions={<>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        <Chip active={filter === "flags"} onClick={() => setFilter("flags")}>Flags</Chip>
        <Chip active={filter === "fights"} onClick={() => setFilter("fights")}>Fights</Chip>
      </>}
      className="xl:max-h-[760px]"
    >
      <ol className="styled-scrollbar -mx-1 flex max-h-[680px] flex-col gap-0.5 overflow-y-auto px-1">
        {moments.map((m) => {
          const active = m === current;
          const past = m.t <= ctx.cursorMs;
          const color = m.faction ? FACTION_COLOR[m.faction] : undefined;
          return (
            <li key={`${m.kind}-${m.t}`}>
              <button
                type="button"
                onClick={() => ctx.setCursorMs(m.t)}
                className={`grid w-full grid-cols-[40px_16px_1fr] items-start gap-2 rounded px-1.5 py-1.5 text-left text-xs hover:bg-muted/40 ${active ? "bg-sky-500/15 ring-1 ring-sky-400/40" : ""} ${past ? "" : "opacity-50"}`}
              >
                <span className="font-mono text-muted-foreground">{formatClock(m.t)}</span>
                <span className="mt-0.5 flex justify-center" style={{ color }}>{MOMENT_ICON[m.kind]}</span>
                <span className={m.kind === "capture" || m.kind === "fight" ? "font-semibold" : ""}>{m.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Battlefield

function Battlefield({ ctx, flags, mode, setMode, layers, setLayers, follow, setFollow, playing, speed }: {
  ctx: ViewCtx;
  flags: Record<Faction, FlagState>;
  mode: "2d" | "3d";
  setMode: (mode: "2d" | "3d") => void;
  layers: Set<MapLayer>;
  setLayers: (fn: (previous: Set<MapLayer>) => Set<MapLayer>) => void;
  follow: FollowMode;
  setFollow: (mode: FollowMode) => void;
  playing: boolean;
  speed: number;
}) {
  const { match, cursorMs, selected } = ctx;
  const [fitKey, setFitKey] = useState(0);
  const carriedBy = new Map<string, Faction>();
  for (const flag of FACTIONS) if (flags[flag].carrier) carriedBy.set(flags[flag].carrier!, flag);

  const markers: MapSceneMarker[] = match.players.flatMap((player) => {
    const positions = match.positions.get(player.guid)!;
    const sample = positionAt(positions, cursorMs);
    if (!sample) return [];
    const dead = isDead(match, player.guid, cursorMs);
    const fraction = healthAt(match, player.guid, cursorMs);
    const flag = carriedBy.get(player.guid);
    return [{
      guid: player.guid,
      name: flag ? `${player.name} — ${FACTION_LABEL[flag]} flag` : player.name,
      sample,
      positions,
      point: projectSample(sample),
      color: classColor(player.className),
      kind: "player",
      muted: selected.size > 0 && !selected.has(player.guid),
      health: { current: fraction * 4000, max: 4000, absorb: 0, dead },
      bar: true,
      icon: null,
      healthFraction: fraction,
      carrying: flag ? { color: FACTION_COLOR[flag], title: `${FACTION_LABEL[flag]} flag` } : undefined,
    }];
  });

  // Follow a carrier: re-frame every 2 s of match time.
  const followTarget = follow !== "none" ? flags[other(follow)].carrier : null;
  const followPoint = followTarget ? markers.find((m) => m.guid === followTarget)?.point : null;
  // 3D is true scale (1.25 yd tokens on a 740 yd gulch), so it frames the action instead of the whole map.
  const actionPoint = mode === "3d" && !followPoint && fitKey === 0 ? densestCluster(markers) : null;
  const framed = followPoint ?? actionPoint;
  const view: MapViewRequest = framed
    ? { viewport: { centerX: framed.leftPercent / 100, centerY: framed.topPercent / 100, zoom: mode === "3d" ? 10 : 2.4 }, key: `follow-${followTarget ?? "action"}-${Math.floor(cursorMs / 2000)}` }
    : { viewport: FULL_MAP_VIEWPORT, key: `fit-${fitKey}-${follow}` };

  const toggleLayer = (layer: MapLayer) => setLayers((previous) => {
    const next = new Set(previous);
    if (next.has(layer)) next.delete(layer);
    else next.add(layer);
    return next;
  });

  return (
    <Section
      title="Battlefield"
      hint={`${formatClock(cursorMs)} · replaces the boss replay`}
      source={ctx.showSources ? "Map panel: unit_position → MapSceneMarker[]; the same markers feed MapView2D and MapView3D (3D WSG mesh via render-map)" : undefined}
      actions={<>
        <Chip active={mode === "2d"} onClick={() => setMode("2d")}>2D</Chip>
        <Chip active={mode === "3d"} onClick={() => setMode("3d")}>3D</Chip>
      </>}
    >
      <div className="grid h-full grid-cols-[minmax(0,150px)_minmax(0,1fr)_minmax(0,150px)] gap-3">
        <TeamFrames ctx={ctx} faction="alliance" carriedBy={carriedBy} />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="relative h-[620px] overflow-hidden rounded-md border border-white/10 bg-[#0d1410]">
            {mode === "2d" ? (
              <MapView2D
                ground={GROUND}
                markers={markers}
                projectSample={projectSample}
                trailSeconds={layers.has("trails") ? 8 : 0}
                view={view}
                underlay={<WsgUnderlay ctx={ctx} flags={flags} layers={layers} />}
              />
            ) : (
              <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading 3D…</div>}>
                <MapView3D
                  ground={GROUND}
                  markers={markers}
                  projectSample={projectSample as (sample: MapPositionSample) => MapPoint}
                  worldMapId={match.mapId}
                  cursorMs={cursorMs}
                  playing={playing}
                  playbackSpeed={speed}
                  view={view}
                  onUnavailable={() => setMode("2d")}
                />
              </Suspense>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Follow
              <select
                value={follow}
                onChange={(event) => setFollow(event.target.value as FollowMode)}
                className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-foreground"
              >
                <option value="none">nobody</option>
                <option value="alliance">Alliance carrier</option>
                <option value="horde">Horde carrier</option>
              </select>
            </label>
            <Chip onClick={() => { setFollow("none"); setFitKey((k) => k + 1); }}>Fit</Chip>
            <span className="mx-1 h-4 w-px bg-border" />
            <Chip active={layers.has("trails")} onClick={() => toggleLayer("trails")}>Trails</Chip>
            <Chip active={layers.has("deaths")} onClick={() => toggleLayer("deaths")}>Deaths</Chip>
            <Chip active={layers.has("heatmap")} onClick={() => toggleLayer("heatmap")}>Kill heatmap</Chip>
            {selected.size > 0 && <span className="ml-auto text-xs text-muted-foreground">{selected.size} selected · others dimmed</span>}
          </div>
        </div>
        <TeamFrames ctx={ctx} faction="horde" carriedBy={carriedBy} />
      </div>
    </Section>
  );
}

/** The centre of the largest group of living players within 40 yd of each other. */
function densestCluster(markers: MapSceneMarker[]): MapPoint | null {
  const alive = markers.filter((m) => !m.health?.dead);
  let best: MapSceneMarker[] = [];
  for (const marker of alive) {
    const near = alive.filter((other) => Math.hypot(other.sample.x - marker.sample.x, other.sample.y - marker.sample.y) < 40);
    if (near.length > best.length) best = near;
  }
  if (best.length === 0) return null;
  return {
    leftPercent: best.reduce((sum, m) => sum + m.point.leftPercent, 0) / best.length,
    topPercent: best.reduce((sum, m) => sum + m.point.topPercent, 0) / best.length,
  };
}

/** Raid-frame style roster: class bar = health at the playhead, flag badge on carriers. */
function TeamFrames({ ctx, faction, carriedBy }: { ctx: ViewCtx; faction: Faction; carriedBy: Map<string, Faction> }) {
  const team = ctx.match.players.filter((p) => p.faction === faction);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: FACTION_COLOR[faction] }}>{FACTION_LABEL[faction]}</div>
      {team.map((player) => {
        const dead = isDead(ctx.match, player.guid, ctx.cursorMs);
        const fraction = dead ? 0 : healthAt(ctx.match, player.guid, ctx.cursorMs);
        const flag = carriedBy.get(player.guid);
        const respawn = dead ? ctx.match.kills.filter((k) => k.victim === player.guid && k.t <= ctx.cursorMs).at(-1) : undefined;
        const selected = ctx.selected.has(player.guid);
        return (
          <button
            key={player.guid}
            type="button"
            onClick={() => ctx.toggleSelected(player.guid)}
            className={`relative flex h-6 items-center gap-1 overflow-hidden rounded-sm bg-muted/40 px-1.5 text-left text-xs ${selected ? "ring-1 ring-sky-300" : ""}`}
            style={{ opacity: ctx.selected.size > 0 && !selected ? 0.5 : 1 }}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 transition-[width] duration-200" style={{ width: `${fraction * 100}%`, background: classColor(player.className), opacity: 0.55 }} />
            <span className={`relative min-w-0 flex-1 truncate font-medium [text-shadow:0_1px_2px_rgba(0,0,0,.9)] ${dead ? "text-muted-foreground line-through" : "text-white"}`}>{player.name}</span>
            {flag && <Flag className="relative h-3 w-3" style={{ color: FACTION_COLOR[flag], fill: FACTION_COLOR[flag] }} />}
            <span className="relative font-mono text-[10px] text-white/80">
              {dead && respawn ? `${Math.ceil((respawn.t + 25_000 - ctx.cursorMs) / 1000)}s` : `${Math.round(fraction * 100)}%`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Schematic gulch drawn in canvas space under the markers; zooms with the artwork. */
function WsgUnderlay({ ctx, flags, layers }: { ctx: ViewCtx; flags: Record<Faction, FlagState>; layers: Set<MapLayer> }) {
  const { match, cursorMs } = ctx;
  const pt = (p: { x: number; y: number }) => toSvg(p);
  const outline = [
    { x: 1600, y: 1420 }, { x: 1600, y: 1545 }, { x: 1500, y: 1600 }, { x: 1380, y: 1625 }, { x: 1230, y: 1610 },
    { x: 1080, y: 1600 }, { x: 960, y: 1540 }, { x: 862, y: 1490 }, { x: 862, y: 1370 }, { x: 960, y: 1320 },
    { x: 1080, y: 1300 }, { x: 1230, y: 1295 }, { x: 1380, y: 1305 }, { x: 1500, y: 1340 },
  ].map(pt).map(({ sx, sy }) => `${sx},${sy}`).join(" ");
  const mid = pt(WSG_POI.mid);
  const recentKills = match.kills.filter((k) => k.t <= cursorMs && cursorMs - k.t < 30_000);
  const allKills = match.kills.filter((k) => k.t <= cursorMs);
  const factionOf = (guid: string) => ctx.playersByGuid.get(guid)!.faction;
  const base = (faction: Faction) => {
    const { sx, sy } = pt(WSG_POI.flag[faction]);
    const name = faction === "alliance" ? "Silverwing Hold" : "Warsong Lumber Mill";
    const color = FACTION_COLOR[faction];
    const top = faction === "alliance" ? sy - 90 : sy - 40;
    return (
      <g key={faction}>
        <rect x={sx - 80} y={top} width={160} height={130} rx={8} fill={`${color}26`} stroke={color} strokeOpacity={0.6} strokeWidth={2} />
        <text x={sx} y={faction === "alliance" ? top + 22 : top + 118} textAnchor="middle" fontSize={26} fill="#e5e7eb" opacity={0.85}>{name}</text>
        <rect x={sx - 18} y={sy - 18} width={36} height={36} rx={4} fill="none" stroke={color} strokeDasharray="4 3" opacity={0.7} />
      </g>
    );
  };
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <radialGradient id="wsg-grass" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#2f4a2a" />
          <stop offset="100%" stopColor="#1b2a1a" />
        </radialGradient>
      </defs>
      <polygon points={outline} fill="url(#wsg-grass)" stroke="#5b7a4f" strokeOpacity={0.5} strokeWidth={3} />
      <ellipse cx={mid.sx} cy={mid.sy} rx={190} ry={170} fill="#3c5a33" opacity={0.45} />
      <text x={mid.sx} y={mid.sy + 4} textAnchor="middle" fontSize={26} fill="#cbd5c0" opacity={0.6}>Midfield</text>
      {/* Tunnel / ramp lanes */}
      <path d={`M ${pt(WSG_POI.tunnel.alliance).sx} ${pt(WSG_POI.tunnel.alliance).sy} Q ${mid.sx + 30} ${mid.sy} ${pt(WSG_POI.tunnel.horde).sx} ${pt(WSG_POI.tunnel.horde).sy}`} fill="none" stroke="#a8956b" strokeOpacity={0.35} strokeWidth={26} strokeLinecap="round" />
      {base("alliance")}
      {base("horde")}
      {FACTIONS.map((faction) => {
        const { sx, sy } = pt(WSG_POI.graveyard[faction]);
        return (
          <g key={`gy-${faction}`} opacity={0.75}>
            <circle cx={sx} cy={sy} r={16} fill="none" stroke={FACTION_COLOR[faction]} strokeDasharray="3 3" strokeWidth={2} />
            <text x={sx} y={sy + 40} textAnchor="middle" fontSize={22} fill="#d1d5db">{FACTION_LABEL[faction]} GY</text>
          </g>
        );
      })}
      {WSG_POI.buffs.map((buff, index) => {
        const { sx, sy } = pt(buff);
        return (
          <g key={index} opacity={0.75}>
            <rect x={sx - 9} y={sy - 9} width={18} height={18} fill="none" stroke="#e5e7eb" strokeWidth={2} />
            <text x={sx} y={sy + 32} textAnchor="middle" fontSize={20} fill="#d1d5db">{buff.kind}</text>
          </g>
        );
      })}
      {/* Flags at home / on the ground. */}
      {FACTIONS.map((flag) => {
        const state = flags[flag];
        if (state.carrier) return null;
        const at = pt(state.dropped ?? WSG_POI.flag[flag]);
        return (
          <g key={`flag-${flag}`} transform={`translate(${at.sx} ${at.sy})`}>
            {state.dropped && <circle r={22} fill="none" stroke={FACTION_COLOR[flag]} strokeWidth={3} opacity={0.8}><animate attributeName="r" values="14;26;14" dur="1.2s" repeatCount="indefinite" /></circle>}
            <line x1={-5} y1={12} x2={-5} y2={-14} stroke="#f3f4f6" strokeWidth={3} />
            <path d="M -5 -14 L 13 -8 L -5 -1 Z" fill={FACTION_COLOR[flag]} stroke="#111" strokeWidth={1} />
          </g>
        );
      })}
      {layers.has("heatmap") && allKills.map((k, index) => {
        const { sx, sy } = pt(k);
        return <circle key={`heat-${index}`} cx={sx} cy={sy} r={26} fill={FACTION_COLOR[factionOf(k.killer)]} opacity={0.14} />;
      })}
      {layers.has("deaths") && recentKills.map((k, index) => {
        const { sx, sy } = pt(k);
        const fade = 1 - (cursorMs - k.t) / 30_000;
        const color = FACTION_COLOR[factionOf(k.victim)];
        return (
          <g key={`death-${index}`} transform={`translate(${sx} ${sy})`} opacity={0.35 + fade * 0.6}>
            <path d="M -7 -7 L 7 7 M 7 -7 L -7 7" stroke={color} strokeWidth={3.5} strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Scoreboard

type SortKey = "killingBlows" | "deaths" | "honorableKills" | "damage" | "healing" | "caps" | "returns";
const COLUMNS: Array<{ key: SortKey; label: ReactNode; title: string }> = [
  { key: "killingBlows", label: "KB", title: "Killing blows" },
  { key: "deaths", label: "D", title: "Deaths" },
  { key: "honorableKills", label: "HK", title: "Honorable kills (in range of an enemy death)" },
  { key: "damage", label: "Damage", title: "Damage done to players" },
  { key: "healing", label: "Healing", title: "Effective healing" },
  { key: "caps", label: <Flag className="inline h-3 w-3" />, title: "Flag captures" },
  { key: "returns", label: <Undo2 className="inline h-3 w-3" />, title: "Flag returns" },
];

function Scoreboard({ ctx, board }: { ctx: ViewCtx; board: ScoreRow[] }) {
  const [sort, setSort] = useState<SortKey>("damage");
  const maxDamage = Math.max(1, ...board.map((r) => r.damage));
  const maxHealing = Math.max(1, ...board.map((r) => r.healing));
  return (
    <Section
      title="Scoreboard"
      hint={`as of ${formatClock(ctx.cursorMs)} · click a column to sort`}
      source={ctx.showSources ? "DamageDone + HealingDone processors filtered to enemy players; KB/D/HK from slain; caps/returns from flag events" : undefined}
    >
      <div className="flex flex-col gap-3">
        {FACTIONS.map((faction) => {
          const rows = board.filter((r) => r.player.faction === faction).sort((a, b) => b[sort] - a[sort]);
          const totals = rows.reduce((acc, r) => ({ kb: acc.kb + r.killingBlows, dmg: acc.dmg + r.damage, heal: acc.heal + r.healing }), { kb: 0, dmg: 0, heal: 0 });
          return (
            <table key={faction} className="w-full table-fixed border-separate border-spacing-y-px text-xs">
              <caption className="mb-1 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: FACTION_COLOR[faction] }}>{FACTION_LABEL[faction]}</span>
                <span className="float-right font-mono text-[11px] text-muted-foreground">{totals.kb} KB · {compact(totals.dmg)} dmg · {compact(totals.heal)} heal</span>
              </caption>
              <thead>
                <tr className="text-[11px] text-muted-foreground">
                  <th className="w-[22%] text-left font-normal">Player</th>
                  {COLUMNS.map((column) => (
                    <th key={column.key} className={`${column.key === "damage" || column.key === "healing" ? "w-[23%]" : "w-[6.5%]"} text-center font-normal`}>
                      <button type="button" title={column.title} onClick={() => setSort(column.key)} className={`inline-flex items-center gap-0.5 hover:text-foreground ${sort === column.key ? "text-foreground underline underline-offset-2" : ""}`}>
                        {column.label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const selected = ctx.selected.has(row.player.guid);
                  return (
                    <tr
                      key={row.player.guid}
                      onClick={() => ctx.toggleSelected(row.player.guid)}
                      className={`cursor-pointer hover:bg-muted/40 ${selected ? "bg-sky-500/15" : ""}`}
                    >
                      <td className="truncate py-0.5 pl-1"><PlayerName player={row.player} /></td>
                      <td className="text-center font-mono">{row.killingBlows || "·"}</td>
                      <td className="text-center font-mono">{row.deaths || "·"}</td>
                      <td className="text-center font-mono">{row.honorableKills || "·"}</td>
                      <td><BarCell value={row.damage} max={maxDamage} color={FACTION_COLOR[faction]} /></td>
                      <td><BarCell value={row.healing} max={maxHealing} color="#22c55e" /></td>
                      <td className="text-center font-mono">{row.caps || "·"}</td>
                      <td className="text-center font-mono">{row.returns || "·"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })}
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><ArrowUpDown className="h-3 w-3" /> Click a player to highlight them on the map and timeline.</p>
      </div>
    </Section>
  );
}

function BarCell({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="relative mx-1 h-[18px] overflow-hidden rounded-sm bg-muted/30">
      <span className="absolute inset-y-0 left-0" style={{ width: `${(value / max) * 100}%`, background: color, opacity: 0.55 }} />
      <span className="relative block pr-1 text-right font-mono text-[11px] leading-[18px]">{value > 0 ? compact(value) : "·"}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match timeline

interface LaneSegment {
  from: number;
  to: number;
  label: string;
  kind: "carried" | "ground";
  end: "capture" | "drop" | "return" | "pickup" | "open";
}

function flagLane(match: WsgMatch, flag: Faction, playersByGuid: Map<string, BgPlayer>): LaneSegment[] {
  const segments: LaneSegment[] = [];
  let open: LaneSegment | null = null;
  for (const event of match.flagEvents) {
    if (event.flag !== flag) continue;
    if (open) {
      open.to = event.t;
      open.end = event.kind === "pickup" ? "pickup" : event.kind;
      segments.push(open);
      open = null;
    }
    if (event.kind === "pickup") open = { from: event.t, to: match.durationMs, label: playersByGuid.get(event.player)!.name, kind: "carried", end: "open" };
    if (event.kind === "drop") open = { from: event.t, to: match.durationMs, label: "", kind: "ground", end: "open" };
  }
  if (open) segments.push(open);
  return segments;
}

function MatchTimeline({ ctx, playing, setPlaying, speed, setSpeed }: { ctx: ViewCtx; playing: boolean; setPlaying: (v: boolean) => void; speed: number; setSpeed: (v: number) => void }) {
  const { match, cursorMs, setCursorMs, playersByGuid, selected } = ctx;
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const pct = (t: number) => (t / match.durationMs) * 100;
  const lanes = useMemo(() => ({
    horde: flagLane(match, "horde", playersByGuid),
    alliance: flagLane(match, "alliance", playersByGuid),
  }), [match, playersByGuid]);
  const captures = match.flagEvents.filter((e) => e.kind === "capture");
  const killBuckets = useMemo(() => {
    const size = 15_000;
    const count = Math.ceil(match.durationMs / size);
    const out = Array.from({ length: count }, () => ({ alliance: 0, horde: 0, selected: 0 }));
    for (const k of match.kills) {
      const bucket = out[Math.min(count - 1, Math.floor(k.t / size))];
      bucket[playersByGuid.get(k.killer)!.faction]++;
      if (selected.has(k.killer) || selected.has(k.victim)) bucket.selected++;
    }
    return out;
  }, [match, playersByGuid, selected]);
  const maxBucket = Math.max(1, ...killBuckets.map((b) => Math.max(b.alliance, b.horde)));

  const seek = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    setCursorMs(Math.round(fraction * match.durationMs));
  };

  let scoreA = 0;
  let scoreH = 0;
  const scoreMarks = captures.map((capture) => {
    if (playersByGuid.get(capture.player)!.faction === "alliance") scoreA++;
    else scoreH++;
    return { t: capture.t, label: `${scoreA} – ${scoreH}`, faction: playersByGuid.get(capture.player)!.faction };
  });

  return (
    <Section
      title="Match timeline"
      hint="objective lanes + kills · the scrubber drives every panel"
      source={ctx.showSources ? "Timeline / Strips lane framework: flag lanes from flag aura intervals, kill bars from slain (15 s buckets)" : undefined}
      actions={<div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <Legend color={FACTION_COLOR.alliance} label="Alliance carrying / killing" />
        <Legend color={FACTION_COLOR.horde} label="Horde carrying / killing" />
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "repeating-linear-gradient(135deg,#9ca3af55 0 3px,transparent 3px 6px)" }} /> on the ground</span>
        <span className="flex items-center gap-1"><Star className="h-3 w-3" /> capture</span>
        <span className="flex items-center gap-1"><Undo2 className="h-3 w-3" /> return</span>
      </div>}
    >
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={() => { if (cursorMs >= match.durationMs) setCursorMs(0); setPlaying(!playing); }} className="flex h-7 w-9 items-center justify-center rounded bg-sky-500/80 text-white hover:bg-sky-500" aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => setCursorMs(0)} className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground" aria-label="Restart"><RotateCcw className="h-3.5 w-3.5" /></button>
        <span className="font-mono text-sm tabular-nums text-amber-300">{formatClock(cursorMs)} <span className="text-muted-foreground">/ {formatClock(match.durationMs)}</span></span>
        <div className="ml-2 flex gap-1">
          {[1, 4, 8, 16].map((value) => <Chip key={value} active={speed === value} onClick={() => setSpeed(value)}>{value}×</Chip>)}
        </div>
      </div>
      <div className="relative grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[11px]">
        {/* Playhead across every lane (label column 96px + 12px gap). */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-7 top-0 z-10 w-0.5 -translate-x-1/2 bg-amber-300/90"
          style={{ left: `calc(108px + (100% - 108px) * ${pct(cursorMs) / 100})` }}
        />
        <span className="self-center text-muted-foreground">Score</span>
        <LaneTrack>
          {scoreMarks.map((mark) => (
            <span key={mark.t} className="absolute top-0 flex h-full items-center gap-1 border-l-2 pl-1 font-mono" style={{ left: `${pct(mark.t)}%`, borderColor: FACTION_COLOR[mark.faction] }}>
              {mark.label}
            </span>
          ))}
          <span className="absolute left-1 top-0 flex h-full items-center font-mono text-muted-foreground">0 – 0</span>
        </LaneTrack>
        {(["horde", "alliance"] as Faction[]).map((flag) => (
          <FlagLaneRow key={flag} flag={flag} segments={lanes[flag]} pct={pct} />
        ))}
        <span className="self-center text-muted-foreground">Kills / 15 s</span>
        <div className="relative h-16 rounded-sm bg-muted/20">
          <svg className="absolute inset-0 size-full" viewBox={`0 0 ${killBuckets.length} 2`} preserveAspectRatio="none" aria-hidden>
            <line x1={0} x2={killBuckets.length} y1={1} y2={1} stroke="#ffffff22" strokeWidth={0.02} />
            {killBuckets.map((bucket, index) => (
              <g key={index}>
                <rect x={index + 0.12} width={0.76} y={1 - bucket.alliance / maxBucket} height={bucket.alliance / maxBucket} fill={FACTION_COLOR.alliance} opacity={selected.size > 0 && bucket.selected === 0 ? 0.25 : 0.85} />
                <rect x={index + 0.12} width={0.76} y={1} height={bucket.horde / maxBucket} fill={FACTION_COLOR.horde} opacity={selected.size > 0 && bucket.selected === 0 ? 0.25 : 0.85} />
              </g>
            ))}
          </svg>
        </div>
        <span />
        <div
          ref={trackRef}
          className="relative h-6 cursor-pointer touch-none"
          onPointerDown={(event) => { draggingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); seek(event); }}
          onPointerMove={(event) => { if (draggingRef.current) seek(event); }}
          onPointerUp={() => { draggingRef.current = false; }}
        >
          <div className="absolute inset-x-0 top-2 h-1 rounded bg-muted/50" />
          <div className="absolute left-0 top-2 h-1 rounded bg-amber-300/80" style={{ width: `${pct(cursorMs)}%` }} />
          <div className="absolute top-0.5 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-amber-200 bg-amber-400 shadow" style={{ left: `${pct(cursorMs)}%` }} />
          <div className="absolute inset-x-0 top-[18px] flex justify-between font-mono text-[10px] text-muted-foreground">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => <span key={f}>{formatClock(f * match.durationMs)}</span>)}
          </div>
        </div>
      </div>
    </Section>
  );
}

function LaneTrack({ children }: { children: ReactNode }) {
  return <div className="relative h-6 overflow-hidden rounded-sm bg-muted/20">{children}</div>;
}

function FlagLaneRow({ flag, segments, pct }: { flag: Faction; segments: LaneSegment[]; pct: (t: number) => number }) {
  const carrierColor = FACTION_COLOR[other(flag)];
  return (
    <>
      <span className="flex items-center gap-1 self-center text-muted-foreground">
        <Flag className="h-3 w-3" style={{ color: FACTION_COLOR[flag], fill: FACTION_COLOR[flag] }} /> {FACTION_LABEL[flag]} flag
      </span>
      <LaneTrack>
        {segments.map((segment) => (
          <span
            key={`${segment.kind}-${segment.from}`}
            className="absolute inset-y-0.5 flex items-center gap-1 overflow-hidden rounded-sm px-1 text-white"
            title={`${segment.label || "On the ground"} ${formatClock(segment.from)}–${formatClock(segment.to)}`}
            style={{
              left: `${pct(segment.from)}%`,
              width: `${pct(segment.to) - pct(segment.from)}%`,
              background: segment.kind === "carried" ? `${carrierColor}cc` : "repeating-linear-gradient(135deg,#9ca3af55 0 3px,transparent 3px 6px)",
            }}
          >
            <span className="truncate font-medium [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">{segment.label}</span>
            {segment.end === "capture" && <Star className="ml-auto h-3 w-3 shrink-0 fill-amber-300 text-amber-300" />}
            {segment.end === "return" && <Undo2 className="ml-auto h-3 w-3 shrink-0" />}
            {segment.end === "drop" && <Skull className="ml-auto h-3 w-3 shrink-0" />}
          </span>
        ))}
      </LaneTrack>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{label}</span>;
}

// ---------------------------------------------------------------------------
// Bottom row

function FlagCarriers({ ctx }: { ctx: ViewCtx }) {
  return (
    <Section
      title="Flag carriers"
      hint="who carried, for how long, and what it cost"
      source={ctx.showSources ? "DamageTaken + HealingTaken processors, filtered to the flag-aura intervals (replaces boss-centric panels)" : undefined}
    >
      <table className="w-full text-xs">
        <thead className="text-[11px] text-muted-foreground">
          <tr>
            <th className="text-left font-normal">Carrier</th>
            <th className="text-right font-normal">Pick-ups</th>
            <th className="text-right font-normal">Caps</th>
            <th className="text-right font-normal">Held</th>
            <th className="text-right font-normal">Dmg taken</th>
            <th className="text-right font-normal">Heals in</th>
          </tr>
        </thead>
        <tbody>
          {ctx.match.carriers.map((c) => {
            const player = ctx.playersByGuid.get(c.guid)!;
            return (
              <tr key={c.guid} className="cursor-pointer hover:bg-muted/40" onClick={() => ctx.toggleSelected(c.guid)}>
                <td className="py-1"><PlayerName player={player} /> <Flag className="inline h-3 w-3" style={{ color: FACTION_COLOR[other(player.faction)], fill: FACTION_COLOR[other(player.faction)] }} /></td>
                <td className="text-right font-mono">{c.pickups}</td>
                <td className="text-right font-mono">{c.caps}</td>
                <td className="text-right font-mono">{formatClock(c.holdMs)}</td>
                <td className="text-right font-mono">{compact(c.damageTaken)}</td>
                <td className="text-right font-mono">{compact(c.healingReceived)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

function KillFeed({ ctx }: { ctx: ViewCtx }) {
  const recent = ctx.match.kills.filter((k) => k.t <= ctx.cursorMs).slice(-10).reverse();
  return (
    <Section title="Kill feed" hint="around the playhead" source={ctx.showSources ? "Deaths panel (slain stream) with killing blow; click to seek" : undefined}>
      {recent.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">No kills yet</div>
      ) : (
        <ol className="flex flex-col gap-0.5 text-xs">
          {recent.map((k, index) => {
            const killer = ctx.playersByGuid.get(k.killer)!;
            const victim = ctx.playersByGuid.get(k.victim)!;
            return (
              <li key={`${k.t}-${index}`}>
                <button type="button" onClick={() => ctx.setCursorMs(k.t)} className="grid w-full grid-cols-[40px_1fr] items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/40">
                  <span className="font-mono text-muted-foreground">{formatClock(k.t)}</span>
                  <span className="flex items-center gap-1.5">
                    <PlayerName player={killer} />
                    <Swords className="h-3 w-3" style={{ color: FACTION_COLOR[killer.faction] }} />
                    <PlayerName player={victim} />
                    {k.carrier && <span className="rounded bg-amber-400/15 px-1 text-[10px] text-amber-300">carrier</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

function TeamComparison({ ctx, board }: { ctx: ViewCtx; board: ScoreRow[] }) {
  const { match, cursorMs } = ctx;
  const sum = (faction: Faction, key: keyof Pick<ScoreRow, "damage" | "healing" | "killingBlows" | "returns">) =>
    board.filter((r) => r.player.faction === faction).reduce((acc, r) => acc + r[key], 0);
  const holdTime = (faction: Faction) => {
    // Time this faction spent carrying the enemy flag, up to the playhead.
    let total = 0;
    const flag = other(faction);
    let since: number | null = null;
    for (const event of match.flagEvents) {
      if (event.t > cursorMs || event.flag !== flag) continue;
      if (event.kind === "pickup") since = event.t;
      else if (since !== null) {
        total += event.t - since;
        since = null;
      }
    }
    if (since !== null) total += cursorMs - since;
    return total;
  };
  const progress = cursorMs / match.durationMs;
  const rows: Array<{ label: string; values: Record<Faction, number>; format: (v: number) => string }> = [
    { label: "Damage to players", values: { alliance: sum("alliance", "damage"), horde: sum("horde", "damage") }, format: compact },
    { label: "Healing", values: { alliance: sum("alliance", "healing"), horde: sum("horde", "healing") }, format: compact },
    { label: "Killing blows", values: { alliance: sum("alliance", "killingBlows"), horde: sum("horde", "killingBlows") }, format: String },
    { label: "Time holding enemy flag", values: { alliance: holdTime("alliance"), horde: holdTime("horde") }, format: formatClock },
    { label: "Crowd control applied", values: { alliance: Math.round(match.teamExtras.alliance.ccApplied * progress), horde: Math.round(match.teamExtras.horde.ccApplied * progress) }, format: String },
    { label: "Dispels / cleanses", values: { alliance: Math.round(match.teamExtras.alliance.dispels * progress), horde: Math.round(match.teamExtras.horde.dispels * progress) }, format: String },
    { label: "Flag returns", values: { alliance: sum("alliance", "returns"), horde: sum("horde", "returns") }, format: String },
  ];
  return (
    <Section title="Team comparison" hint={`as of ${formatClock(cursorMs)}`} source={ctx.showSources ? "ComparisonPanel with the two factions as the compared groups (Dispel + CC panels for those rows)" : undefined}>
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em]">
          <span className="text-right" style={{ color: FACTION_COLOR.alliance }}><Users className="mr-1 inline h-3 w-3" />Alliance</span>
          <span />
          <span style={{ color: FACTION_COLOR.horde }}>Horde<Users className="ml-1 inline h-3 w-3" /></span>
        </div>
        {rows.map((row) => {
          const max = Math.max(1, row.values.alliance, row.values.horde);
          return (
            <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="relative h-[18px] overflow-hidden rounded-sm bg-muted/30">
                <span className="absolute inset-y-0 right-0" style={{ width: `${(row.values.alliance / max) * 100}%`, background: FACTION_COLOR.alliance, opacity: row.values.alliance >= row.values.horde ? 0.85 : 0.45 }} />
                <span className="relative block pr-1 text-right font-mono text-[11px] leading-[18px] text-white">{row.format(row.values.alliance)}</span>
              </div>
              <span className="w-32 text-center text-[11px] text-muted-foreground">{row.label}</span>
              <div className="relative h-[18px] overflow-hidden rounded-sm bg-muted/30">
                <span className="absolute inset-y-0 left-0" style={{ width: `${(row.values.horde / max) * 100}%`, background: FACTION_COLOR.horde, opacity: row.values.horde >= row.values.alliance ? 0.85 : 0.45 }} />
                <span className="relative block pl-1 font-mono text-[11px] leading-[18px] text-white">{row.format(row.values.horde)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
