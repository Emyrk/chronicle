import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSiteConfig } from "@/api/queries";
import {
  useRankingsEncounters,
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
import {
  getInstanceAbbrev,
  getInstanceBackground,
  getInstanceCategory,
  INSTANCE_CONFIG,
} from "@/pages/Logs/utils/instanceImages";
import { Podium } from "@/pages/Leaderboard/Podium";
import { RaidCard } from "@/pages/Recent/RaidCard";

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

// Raids only: dungeons are supported but off-topic for the homepage.
// Filters server-side by the known raid names so a dungeon-heavy recent
// page can't starve the homepage row.
const RAID_NAMES = Object.entries(INSTANCE_CONFIG)
  .filter(([, cfg]) => cfg.category === "raid")
  .map(([name]) => name);

function useRecentUploads() {
  return useQuery({
    queryKey: ["home", "recent-uploads"],
    queryFn: () => {
      const params = new URLSearchParams();
      for (const name of RAID_NAMES) params.append("instance_name", name);
      return fetchJSON<RecentInstancesResponse>(`/api/v1/raidlogs/recent?${params}`);
    },
    staleTime: 60 * 1000,
  });
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
      // Raids only. Known dungeons are excluded; unknown instances stay so a
      // custom raid missing from INSTANCE_CONFIG doesn't silently vanish.
      if (getInstanceCategory(s.instance_name) === "dungeon") continue;
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

  const distinctSizes = useMemo(
    () => (spot ? [...new Set(spot.boards.map((b) => b.maxPlayers))] : []),
    [spot],
  );
  const distinctDiffs = useMemo(
    () => (spot ? [...new Set(spot.boards.map((b) => b.difficulty))] : []),
    [spot],
  );

  // When every board is uniquely identified by its size (e.g. difficulty_name
  // is "10 Player"/"25 Player" and just mirrors max_players), the difficulty
  // toggle would duplicate the size toggle — collapse to a single toggle.
  const axesRedundant =
    spot != null &&
    distinctSizes.length === spot.boards.length &&
    distinctDiffs.length === spot.boards.length;

  const sizeOptions = useMemo(() => {
    if (!spot || distinctSizes.length < 2) return [];
    return [...distinctSizes]
      .sort((a, b) => b - a)
      .map((s) => ({ value: String(s), label: s > 0 ? `${s}-man` : "Any" }));
  }, [spot, distinctSizes]);

  const difficultyOptions = useMemo(() => {
    if (!spot || axesRedundant || distinctDiffs.length < 2) return [];
    return [...distinctDiffs].sort().map((d) => ({ value: d, label: d || "Normal" }));
  }, [spot, axesRedundant, distinctDiffs]);

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

  // Change one axis of the board selection. Prefers the exact combo with the
  // other axis unchanged; falls back to the best-populated board on the
  // changed axis so a click always lands on a real board.
  const selectBoard = useCallback(
    (axis: "size" | "difficulty", value: string) => {
      if (!spot || !activeBoard) return;
      const matches = spot.boards.filter((b) =>
        axis === "size" ? b.maxPlayers === Number(value) : b.difficulty === value,
      );
      if (matches.length === 0) return;
      const board =
        matches.find((b) =>
          axis === "size"
            ? b.difficulty === activeBoard.difficulty
            : b.maxPlayers === activeBoard.maxPlayers,
        ) ?? [...matches].sort((a, b) => b.kills - a.kills)[0];
      const sel = { difficulty: board.difficulty, maxPlayers: board.maxPlayers };
      setBoardSelections((prev) => ({ ...prev, [spot.name]: sel }));
      saveBoardSelection(spot.name, sel);
    },
    [spot, activeBoard],
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

  // Only filter when the raid has multiple boards on that axis; single-board
  // raids keep the unfiltered (legacy) behavior. Uses the underlying board
  // axes, not the visible toggles, since the difficulty toggle may be
  // collapsed when it mirrors the size axis.
  const difficultyFilter = distinctDiffs.length > 1 ? activeBoard?.difficulty : undefined;
  const maxPlayersFilter =
    distinctSizes.length > 1 && activeBoard && activeBoard.maxPlayers > 0
      ? activeBoard.maxPlayers
      : undefined;

  const { data: speedruns } = useSpeedrunTop(spot?.name ?? "", difficultyFilter);
  const { data: guildClears } = useGuildClears(spot?.name ?? "", difficultyFilter);

  // Bosses only, like the leaderboard page's "All Bosses" default. "Trash" is
  // the only trash encounter name by convention.
  const { data: encounterSummaries } = useRankingsEncounters(spot?.name ?? "");
  const bossEncounterNames = useMemo(() => {
    const bosses = (encounterSummaries ?? [])
      .map((e) => e.encounter_name)
      .filter((n) => n !== "Trash");
    return bosses.length > 0 ? bosses.join(",") : undefined;
  }, [encounterSummaries]);

  const { data: leaderboard } = useRankingsLeaderboard({
    instance_names: spot?.name ?? "",
    encounter_names: bossEncounterNames,
    difficulty_names: difficultyFilter,
    max_players: maxPlayersFilter,
    hide_unknowns: true,
    limit: 12,
  });
  const { data: boxPlotStats } = useRankingsStats({
    instance_names: spot?.name ?? "",
    encounter_names: bossEncounterNames,
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
    // Rank by median: the "typical" parse, not a single outlier's best.
    const sorted = known.sort((a, b) => b.median_dps - a.median_dps).slice(0, 6);
    const scale = Math.max(...sorted.map((s) => s.max_dps), 1);
    const pct = (v: number) => (v / scale) * 100;
    return sorted.map((s) => ({
      key: `${s.player_class}-${s.player_spec}`,
      spec: s.player_spec,
      color: CLASS_CSS_VAR[s.player_class] ?? "var(--color-class-unknown)",
      dps: Math.round(s.median_dps),
      // Compact box plot geometry, as percentages of the card width.
      minPct: pct(s.min_dps),
      maxPct: pct(s.max_dps),
      q1Pct: pct(s.q1_dps),
      q3Pct: pct(s.q3_dps),
      medianPct: pct(s.median_dps),
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
        {/* Header: eyebrow + rotation controls, then raid name + board toggles */}
        <div className="flex items-center justify-between gap-4">
          <span className="font-mono text-xs tracking-[0.2em] text-(--tertiary) uppercase">
            Raid Spotlight · {idx + 1} / {raids.length}
          </span>
          {raids.length > 1 && (
            <div className="flex items-center gap-2">
              <div className="flex items-baseline gap-2 text-sm">
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
        <div className="flex items-center justify-between gap-4 flex-wrap mt-3">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">{spot.name}</h2>
          <div className="flex items-center gap-2">
            <BoardToggle
              options={sizeOptions}
              selected={String(activeBoard?.maxPlayers ?? 0)}
              onSelect={(v) => selectBoard("size", v)}
            />
            <BoardToggle
              options={difficultyOptions}
              selected={activeBoard?.difficulty ?? ""}
              onSelect={(v) => selectBoard("difficulty", v)}
            />
          </div>
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

        {/* Speedrun podium over the instance loading screen, matching the
            leaderboard page's hero treatment. */}
        <div
          className="relative mt-8 rounded-xl border overflow-hidden bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url('${getInstanceBackground(spot.name)}')` }}
        >
          <div className="absolute inset-0 bg-background/80" />
          <Link
            to={`/leaderboards?tab=speedrun&instance=${encodeURIComponent(spot.name)}${diffQS}`}
            className="absolute top-3 right-4 z-10 text-xs text-primary hover:underline"
          >
            Full board →
          </Link>
          <div className="relative px-4 pt-10">
            {speedruns && speedruns.length > 0 ? (
              <Podium entries={speedruns.slice(0, 3)} instanceName={spot.name} />
            ) : (
              <div className="py-10 pb-20 text-center text-sm text-muted-foreground">
                No qualified speedruns for {spot.name} yet.
              </div>
            )}
          </div>
        </div>

        {/* Boards */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-6 mt-6">
          {/* Top DPS */}
          <div className="rounded-lg border bg-muted/20 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
              <span className="text-sm font-semibold">Top DPS · {spot.abbrev}</span>
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
                <span className="font-mono font-bold text-right">{Math.round(entry.dps)}/s</span>
                <span className="hidden md:block text-xs text-muted-foreground text-right truncate">
                  {entry.guild_name}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-6">
            {/* # Clears by Guild */}
            <div className="rounded-lg border bg-muted/20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
                <span className="text-sm font-semibold"># Clears by Guild</span>
                {/* TODO: link to a dedicated guild-clears board once one exists. */}
              </div>
              {(!guildClears || guildClears.length === 0) && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No qualified clears yet.
                </div>
              )}
              {/* Always render 5 rows (padding with placeholders) so this
                  card's height is stable across raids. */}
              {guildClears &&
                guildClears.length > 0 &&
                Array.from({ length: 5 }, (_, i) => {
                  const g = guildClears[i];
                  return (
                    <div
                      key={g?.guild_id ?? `empty-${i}`}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-muted/40 text-sm"
                    >
                      <span className="font-mono text-xs text-muted-foreground w-4">{i + 1}</span>
                      {g ? (
                        <>
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
                        </>
                      ) : (
                        <span className="flex-1 text-muted-foreground/50">—</span>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Best parse by spec */}
            <div className="rounded-lg border bg-muted/20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
                <span className="text-sm font-semibold">Best typical parse by spec</span>
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
                    {/* Compact box plot: min–max whisker, q1–q3 box, median tick. */}
                    <div className="relative flex-1 h-3">
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-px opacity-50"
                        style={{
                          left: `${s.minPct}%`,
                          width: `${s.maxPct - s.minPct}%`,
                          backgroundColor: s.color,
                        }}
                      />
                      <div
                        className="absolute inset-y-0 rounded-xs opacity-70"
                        style={{
                          left: `${s.q1Pct}%`,
                          width: `${Math.max(s.q3Pct - s.q1Pct, 0.5)}%`,
                          backgroundColor: s.color,
                        }}
                      />
                      <div
                        className="absolute inset-y-0 w-0.5 bg-foreground"
                        style={{ left: `${s.medianPct}%` }}
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

/** Latest uploads as a horizontal row of raid cards, like the Recent page. */
function LatestUploads() {
  const { data } = useRecentUploads();
  const uploads = (data?.instances ?? []).slice(0, 4);

  return (
    <section className="px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold">Latest uploads</h2>
          <Link to="/recent" className="text-xs text-primary hover:underline">
            Recent →
          </Link>
        </div>
        {uploads.length === 0 && (
          <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
            No uploads yet.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {uploads.map((u) => (
            <RaidCard key={u.id} instance={u} />
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
