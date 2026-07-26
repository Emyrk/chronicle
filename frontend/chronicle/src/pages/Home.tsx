import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSiteConfig } from "@/api/queries";
import {
  useRankingsInstances,
  useRankingsLeaderboard,
  useRankingsStats,
} from "@/api/rankingsQueries";
import type {
  RecentInstancesResponse,
  SiteStats,
  SpeedrunGuildClearsEntry,
  SpeedrunLeaderboardEntry,
} from "@/api/typesGenerated";
import { CLASS_CSS_VAR } from "@/pages/Rankings/classDisplay";
import { getInstanceAbbrev } from "@/pages/Logs/utils/instanceImages";
import { Podium } from "@/pages/Leaderboard/Podium";

const STALE_TIME = 5 * 60 * 1000; // 5 minutes
const ROTATE_SECS = 5 * 60; // rotate the spotlight every 5 minutes
const SPOTLIGHT_IDX_KEY = "homeSpotlightIdx";
const SPOTLIGHT_BOARD_KEY = "homeSpotlightBoards";

interface BoardSelection {
  difficulty: string;
  maxPlayers: number;
}

function loadBoardSelections(): Record<string, BoardSelection> {
  try {
    return JSON.parse(localStorage.getItem(SPOTLIGHT_BOARD_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveBoardSelection(raidName: string, sel: BoardSelection) {
  const all = loadBoardSelections();
  all[raidName] = sel;
  localStorage.setItem(SPOTLIGHT_BOARD_KEY, JSON.stringify(all));
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function useSiteStats() {
  return useQuery({
    queryKey: ["site", "stats"],
    queryFn: () => fetchJSON<SiteStats>("/api/v1/stats"),
    staleTime: 30 * 60 * 1000, // matches the server's Cache-Control
  });
}

// `difficulty` filters to one board when defined; undefined disables the
// filter (raids with a single board keep the unfiltered behavior).
function useSpeedrunTop(instanceName: string, difficulty?: string) {
  return useQuery({
    queryKey: ["home", "speedrun", instanceName, difficulty],
    queryFn: () => {
      const params = new URLSearchParams({ instance_name: instanceName });
      if (difficulty !== undefined) params.set("difficulty_name", difficulty);
      return fetchJSON<SpeedrunLeaderboardEntry[]>(`/api/v1/rankings/speedrun?${params}`);
    },
    staleTime: STALE_TIME,
    enabled: !!instanceName,
  });
}

function useGuildClears(instanceName: string, difficulty?: string) {
  return useQuery({
    queryKey: ["home", "guild-clears", instanceName, difficulty],
    queryFn: () => {
      const params = new URLSearchParams({ instance_name: instanceName, limit: "5" });
      if (difficulty !== undefined) params.set("difficulty_name", difficulty);
      return fetchJSON<SpeedrunGuildClearsEntry[]>(
        `/api/v1/rankings/speedrun/guild-clears?${params}`,
      );
    },
    staleTime: STALE_TIME,
    enabled: !!instanceName,
  });
}

function useRecentUploads() {
  return useQuery({
    queryKey: ["home", "recent-uploads"],
    queryFn: () => fetchJSON<RecentInstancesResponse>("/api/v1/raidlogs/recent"),
    staleTime: 60 * 1000,
  });
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface SpotlightBoard {
  difficulty: string;
  maxPlayers: number;
  kills: number;
}

interface SpotlightRaid {
  name: string;
  abbrev: string;
  totalKills: number;
  boards: SpotlightBoard[];
}

/** Toggle group for switching between board variants (raid size, difficulty). */
function BoardToggle({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          className={`px-3 py-1 rounded-md font-mono text-xs cursor-pointer transition-colors ${
            o.value === selected
              ? "bg-primary/15 text-(--tertiary) border border-primary/40"
              : "text-muted-foreground border border-transparent hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Hero: headline left, stacked CTAs right. */
function HeroSection() {
  const { isAuthenticated } = useAuth();
  const { data: siteConfig } = useSiteConfig();
  const showUpload = !siteConfig?.client_uploads_disabled;

  return (
    <section
      className="relative px-6 py-14 md:py-20 bg-cover bg-center bg-no-repeat border-b"
      style={{ backgroundImage: "url('/c/images/herobackground.avif')" }}
    >
      <div className="absolute inset-0 bg-background/80" />
      <div className="relative max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
        <div className="max-w-2xl text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Every raid tells a story.
            <br />
            <span className="text-(--tertiary)">Chronicle helps you read it.</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Logs in, insight out — easy to read, easy to share.
          </p>
        </div>
        <div className="flex flex-col gap-3 min-w-56">
          {showUpload && (
            <Button asChild size="lg" className="md:h-12 md:px-8 md:text-base">
              <Link to="/upload">{isAuthenticated ? "Upload a Log" : "Upload Your First Log"}</Link>
            </Button>
          )}
          <Button variant="outline" size="lg" asChild className="md:h-12 md:px-8 md:text-base">
            <Link to={isAuthenticated ? "/logs" : "/recent"}>
              {isAuthenticated ? "View Your Logs" : "View a Sample"}
            </Link>
          </Button>
          <p className="text-center text-sm text-muted-foreground">No account required.</p>
        </div>
      </div>
    </section>
  );
}

/** Site-wide stat strip below the hero. */
function StatsStrip() {
  const { data: stats } = useSiteStats();
  const cells = [
    { v: stats?.logs_parsed, k: "logs parsed" },
    { v: stats?.players_tracked, k: "players tracked" },
    { v: stats?.guilds, k: "guilds" },
    { v: stats?.boss_kills, k: "boss kills" },
  ];
  return (
    <section className="border-b bg-muted/30">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4">
        {cells.map((c) => (
          <div key={c.k} className="px-6 py-4 border-r last:border-r-0 max-md:even:border-r-0">
            <div className="font-mono text-2xl font-bold text-(--tertiary)">
              {c.v != null ? c.v.toLocaleString() : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground tracking-wide">{c.k}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Rotating raid spotlight: speedrun podium, top parses, guild clears, best parse by spec. */
function RaidSpotlight() {
  const { data: instanceSummaries } = useRankingsInstances();

  // One tab per raid; each raid keeps its per-(difficulty, size) boards so the
  // user can toggle between them.
  const raids: SpotlightRaid[] = useMemo(() => {
    if (!instanceSummaries) return [];
    const byName = new Map<string, SpotlightRaid>();
    for (const s of instanceSummaries) {
      const board: SpotlightBoard = {
        difficulty: s.difficulty_name,
        maxPlayers: s.max_players,
        kills: s.total_kills,
      };
      const existing = byName.get(s.instance_name);
      if (existing) {
        existing.totalKills += s.total_kills;
        existing.boards.push(board);
      } else {
        byName.set(s.instance_name, {
          name: s.instance_name,
          abbrev: getInstanceAbbrev(s.instance_name),
          totalKills: s.total_kills,
          boards: [board],
        });
      }
    }
    return [...byName.values()].sort((a, b) => b.totalKills - a.totalKills);
  }, [instanceSummaries]);

  // Resume where the visitor left off.
  const [raidIdx, setRaidIdx] = useState(() => {
    const saved = Number(localStorage.getItem(SPOTLIGHT_IDX_KEY));
    return Number.isFinite(saved) && saved >= 0 ? saved : 0;
  });
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(ROTATE_SECS);

  const idx = raids.length > 0 ? raidIdx % raids.length : 0;
  const spot = raids[idx];

  // Board (difficulty + size) selection, persisted per raid.
  const [boardSelections, setBoardSelections] = useState<Record<string, BoardSelection>>(
    loadBoardSelections,
  );

  const sizeOptions = useMemo(() => {
    if (!spot) return [];
    const sizes = [...new Set(spot.boards.map((b) => b.maxPlayers))].sort((a, b) => b - a);
    return sizes.map((s) => ({ value: String(s), label: s > 0 ? `${s}-man` : "Any" }));
  }, [spot]);

  const difficultyOptions = useMemo(() => {
    if (!spot) return [];
    const diffs = [...new Set(spot.boards.map((b) => b.difficulty))].sort();
    return diffs.map((d) => ({ value: d, label: d || "Normal" }));
  }, [spot]);

  // Resolve the active board: saved selection if it still exists,
  // otherwise the board with the most kills.
  const activeBoard: SpotlightBoard | undefined = useMemo(() => {
    if (!spot) return undefined;
    const saved = boardSelections[spot.name];
    if (saved) {
      const match = spot.boards.find(
        (b) => b.difficulty === saved.difficulty && b.maxPlayers === saved.maxPlayers,
      );
      if (match) return match;
    }
    return [...spot.boards].sort((a, b) => b.kills - a.kills)[0];
  }, [spot, boardSelections]);

  const selectBoard = useCallback(
    (difficulty: string, maxPlayers: number) => {
      if (!spot) return;
      // Prefer an exact board; fall back to the best-populated board matching
      // the changed axis so a stale combo never strands the user.
      const exact = spot.boards.find(
        (b) => b.difficulty === difficulty && b.maxPlayers === maxPlayers,
      );
      const board =
        exact ??
        [...spot.boards]
          .filter((b) => b.difficulty === difficulty || b.maxPlayers === maxPlayers)
          .sort((a, b) => b.kills - a.kills)[0];
      if (!board) return;
      const sel = { difficulty: board.difficulty, maxPlayers: board.maxPlayers };
      setBoardSelections((prev) => ({ ...prev, [spot.name]: sel }));
      saveBoardSelection(spot.name, sel);
    },
    [spot],
  );

  const goRaid = useCallback((i: number) => {
    setRaidIdx(i);
    setRemaining(ROTATE_SECS);
    localStorage.setItem(SPOTLIGHT_IDX_KEY, String(i));
  }, []);

  useEffect(() => {
    if (paused || raids.length <= 1) return;
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r > 1) return r - 1;
        setRaidIdx((prev) => {
          const next = (prev + 1) % raids.length;
          localStorage.setItem(SPOTLIGHT_IDX_KEY, String(next));
          return next;
        });
        return ROTATE_SECS;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [paused, raids.length]);

  // Only pass a difficulty filter when the raid has multiple difficulty
  // boards; single-board raids keep the unfiltered (legacy) behavior.
  const difficultyFilter = difficultyOptions.length > 1 ? activeBoard?.difficulty : undefined;
  const maxPlayersFilter =
    sizeOptions.length > 1 && activeBoard && activeBoard.maxPlayers > 0
      ? activeBoard.maxPlayers
      : undefined;

  const { data: speedruns } = useSpeedrunTop(spot?.name ?? "", difficultyFilter);
  const { data: guildClears } = useGuildClears(spot?.name ?? "", difficultyFilter);
  const { data: leaderboard } = useRankingsLeaderboard({
    instance_names: spot?.name ?? "",
    difficulty_names: difficultyFilter,
    max_players: maxPlayersFilter,
    hide_unknowns: true,
    limit: 8,
  });
  const { data: boxPlotStats } = useRankingsStats({
    instance_names: spot?.name ?? "",
    difficulty_names: difficultyFilter,
    max_players: maxPlayersFilter,
  });

  const topSpecs = useMemo(() => {
    if (!boxPlotStats) return [];
    const known = boxPlotStats.filter(
      (s) =>
        s.player_spec &&
        s.player_spec.toUpperCase() !== "UNKNOWN" &&
        s.player_class.toUpperCase() !== "UNKNOWN",
    );
    const sorted = known.sort((a, b) => b.max_dps - a.max_dps).slice(0, 6);
    const maxDps = sorted[0]?.max_dps ?? 1;
    return sorted.map((s) => ({
      key: `${s.player_class}-${s.player_spec}`,
      spec: s.player_spec,
      color: CLASS_CSS_VAR[s.player_class] ?? "var(--color-class-unknown)",
      dps: Math.round(s.max_dps),
      pct: Math.round((s.max_dps / maxDps) * 100),
    }));
  }, [boxPlotStats]);

  const maxClears = guildClears?.[0]?.clears ?? 1;
  const parses = leaderboard?.entries ?? [];

  // Deep-link params for "Full board →" links.
  const diffQS = difficultyFilter !== undefined ? `&diff=${encodeURIComponent(difficultyFilter)}` : "";

  if (raids.length === 0) return null;

  return (
    <section className="px-6 py-10 border-b">
      <div className="max-w-7xl mx-auto">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[11px] tracking-widest text-(--tertiary) uppercase">
                Raid Spotlight {idx + 1} / {raids.length}
              </span>
              <h2 className="text-2xl font-semibold">{spot.name}</h2>
            </div>
            <BoardToggle
              options={sizeOptions}
              selected={String(activeBoard?.maxPlayers ?? 0)}
              onSelect={(v) => selectBoard(activeBoard?.difficulty ?? "", Number(v))}
            />
            <BoardToggle
              options={difficultyOptions}
              selected={activeBoard?.difficulty ?? ""}
              onSelect={(v) => selectBoard(v, activeBoard?.maxPlayers ?? 0)}
            />
            <span className="text-sm text-muted-foreground">
              {(activeBoard?.kills ?? spot.totalKills).toLocaleString()} kills logged
            </span>
          </div>
          {raids.length > 1 && (
            <div className="flex items-center gap-2">
              <div className="flex items-baseline gap-2 px-3 py-1.5 rounded-md border bg-muted/30 text-sm">
                <span className="text-muted-foreground">
                  {paused ? "Rotation paused" : "Next raid in"}
                </span>
                <span className="font-mono font-bold text-(--tertiary)">
                  {formatTimer(remaining)}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)}>
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {paused ? "Resume" : "Pause"}
              </Button>
            </div>
          )}
        </div>

        {/* Raid tabs */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {raids.map((r, i) => (
            <button
              key={r.name}
              type="button"
              onClick={() => goRaid(i)}
              className={`flex flex-col items-start gap-0.5 px-3.5 py-2 rounded-lg border cursor-pointer transition-colors ${
                i === idx
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted/30 hover:border-primary/50"
              }`}
            >
              <span
                className={`font-mono text-[11px] font-semibold tracking-wider ${
                  i === idx ? "text-(--tertiary)" : "text-muted-foreground"
                }`}
              >
                {r.abbrev}
              </span>
              <span className="text-xs text-muted-foreground">{r.name}</span>
            </button>
          ))}
        </div>

        {/* Rotation progress */}
        {raids.length > 1 && (
          <div className="h-0.75 rounded-full bg-muted mt-4 overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-1000 ease-linear"
              style={{ width: `${((ROTATE_SECS - remaining) / ROTATE_SECS) * 100}%` }}
            />
          </div>
        )}

        {/* Speedrun podium */}
        <div className="mt-8">
          {speedruns && speedruns.length > 0 ? (
            <Podium entries={speedruns.slice(0, 3)} instanceName={spot.name} />
          ) : (
            <div className="rounded-lg border bg-muted/30 py-10 text-center text-sm text-muted-foreground mb-10">
              No qualified speedruns for {spot.name} yet.
            </div>
          )}
        </div>

        {/* Boards */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-6">
          {/* Top parses */}
          <div className="rounded-lg border bg-muted/20 overflow-hidden self-start">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
              <span className="text-sm font-semibold">Top parses · {spot.abbrev}</span>
              <Link
                to={`/leaderboards?instance=${encodeURIComponent(spot.name)}&tab=leaderboard${diffQS}`}
                className="text-xs text-primary hover:underline"
              >
                Full board →
              </Link>
            </div>
            {parses.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No parses recorded yet.
              </div>
            )}
            {parses.map((entry, i) => (
              <div
                key={entry.id}
                className="grid grid-cols-[32px_1fr_60px] md:grid-cols-[32px_1fr_130px_60px_1fr] gap-2 items-center px-4 py-2 border-b border-border/50 last:border-b-0 hover:bg-muted/40 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                <span
                  className="font-medium truncate"
                  style={{ color: CLASS_CSS_VAR[entry.player_class] }}
                >
                  {entry.player_name}
                </span>
                <span
                  className="hidden md:block text-xs opacity-80 truncate"
                  style={{ color: CLASS_CSS_VAR[entry.player_class] }}
                >
                  {entry.player_spec}
                </span>
                <span className="font-mono font-bold text-right">{Math.round(entry.dps)}</span>
                <span className="hidden md:block text-xs text-muted-foreground text-right truncate">
                  {entry.guild_name}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-6">
            {/* Guilds by clears */}
            <div className="rounded-lg border bg-muted/20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
                <span className="text-sm font-semibold">Guilds by clears</span>
                <Link
                  to={`/leaderboards?tab=speedrun&instance=${encodeURIComponent(spot.name)}${diffQS}`}
                  className="text-xs text-primary hover:underline"
                >
                  Full board →
                </Link>
              </div>
              {(!guildClears || guildClears.length === 0) && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No qualified clears yet.
                </div>
              )}
              {guildClears?.map((g, i) => (
                <div
                  key={g.guild_id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-muted/40 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground w-4">{i + 1}</span>
                  <span className="flex-1 font-medium truncate">{g.guild_name}</span>
                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.round((g.clears / maxClears) * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs font-bold text-(--tertiary) w-9 text-right">
                    {g.clears}
                  </span>
                </div>
              ))}
            </div>

            {/* Best parse by spec */}
            <div className="rounded-lg border bg-muted/20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
                <span className="text-sm font-semibold">Best parse by spec</span>
                <Link
                  to={`/leaderboards?instance=${encodeURIComponent(spot.name)}${diffQS}`}
                  className="text-xs text-primary hover:underline"
                >
                  Box plot →
                </Link>
              </div>
              <div className="px-4 py-3">
                {topSpecs.length === 0 && (
                  <div className="py-5 text-center text-sm text-muted-foreground">
                    No parses recorded yet.
                  </div>
                )}
                {topSpecs.map((s) => (
                  <div key={s.key} className="flex items-center gap-2.5 py-1.5">
                    <span className="w-27 text-xs truncate" style={{ color: s.color }}>
                      {s.spec}
                    </span>
                    <div className="flex-1 h-2 rounded-sm bg-muted overflow-hidden">
                      <div
                        className="h-full opacity-75"
                        style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                      />
                    </div>
                    <span className="w-10 font-mono text-xs text-muted-foreground text-right">
                      {s.dps}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Latest uploads table. */
function LatestUploads() {
  const { data } = useRecentUploads();
  const uploads = data?.instances.slice(0, 6) ?? [];

  return (
    <section className="px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold">Latest uploads</h2>
          <Link to="/recent" className="text-xs text-primary hover:underline">
            Recent →
          </Link>
        </div>
        <div className="rounded-lg border overflow-hidden">
          {uploads.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No uploads yet.
            </div>
          )}
          {uploads.map((u) => (
            <Link
              key={u.id}
              to={u.slug ? `/instances/${u.slug}` : `/instances/${u.id}`}
              className="grid grid-cols-[1.2fr_80px_80px] md:grid-cols-[1.2fr_1fr_90px_90px_1fr_90px] gap-3 items-center px-4 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-muted/40 text-sm"
            >
              <span className="font-medium truncate">{u.name}</span>
              <span className="hidden md:block text-xs text-muted-foreground truncate">
                {u.guild_name ?? u.uploader_name}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {u.boss_kills}/{u.boss_count} bosses
              </span>
              <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {u.player_count}
              </span>
              <span className="hidden md:block font-mono text-xs text-muted-foreground">
                {formatDuration(u.duration_ms)}
              </span>
              <span className="text-xs text-muted-foreground text-right">
                {formatRelativeTime(u.uploaded_at)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Home() {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <StatsStrip />
      <RaidSpotlight />
      <LatestUploads />
    </div>
  );
}
