import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Database, ExternalLink, HeartPulse, Map, Percent, Plus, Search, Settings2, Swords, Trash2 } from "lucide-react";
import type { ArmoryPlayer, ArmorySearchResult, CharacterPerformanceRun } from "@/api/typesGenerated";
import { useArmorySearch } from "@/api/queries";
import { useCharacterEncounters, useCharacterPerformances } from "@/api/rankingsQueries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/Card/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/Switch/Switch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import { getClassIconUrl } from "../characterDisplay";
import { getClassColorVar } from "../types";
import type { ParseMetric } from "./util";
import type { PerformanceComparisonState, PerformanceDisplayMode } from "./performanceComparisonState";
import {
  assignPerformanceSeriesColors,
  buildPerformanceVariants,
  calculatePerformanceWaterlines,
  filterPerformanceRunSeries,
  performanceValue,
} from "./performanceExplorerModel";

type DisplayMode = PerformanceDisplayMode;

type PlayerDialog = "add" | string | null;

interface SelectedPerformancePlayer {
  id: string;
  name: string;
  className: string;
  realmName: string;
  spec: string | null;
  subSpec: string | null;
  color: string;
}

interface PerformanceSeries {
  player: SelectedPerformancePlayer;
  runs: CharacterPerformanceRun[];
  rawRuns: CharacterPerformanceRun[];
  specs: string[];
  subSpecs: string[];
}

interface PerformanceExplorerProps {
  players: ArmoryPlayer[];
  state: PerformanceComparisonState;
  onStateChange: (state: PerformanceComparisonState) => void;
}

const MAX_COMPARISON_PLAYERS = 5;

export function PerformanceExplorer({ players, state, onStateChange }: PerformanceExplorerProps) {
  const primaryPlayer = players[0];
  const encountersQuery = useCharacterEncounters(primaryPlayer.id);
  const variants = useMemo(
    () => buildPerformanceVariants(encountersQuery.data?.encounters ?? []),
    [encountersQuery.data],
  );
  const [playerDialog, setPlayerDialog] = useState<PlayerDialog>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 250);
  const playerSearch = useArmorySearch({ q: debouncedSearch, realm: state.realmName });
  const selectedPlayerProfiles = state.players.flatMap((selection) => {
    const profile = players.find((player) => player.id === selection.id);
    return profile ? [{ selection, profile }] : [];
  });
  const seriesColors = assignPerformanceSeriesColors(selectedPlayerProfiles.map(({ profile }) => profile.class));
  const selectedPlayers: SelectedPerformancePlayer[] = selectedPlayerProfiles.map(({ selection, profile }, index) => ({
    id: profile.id,
    name: profile.name,
    className: profile.class,
    realmName: profile.realm_name,
    spec: selection.spec,
    subSpec: selection.subSpec,
    color: seriesColors[index],
  }));
  const variant = variants.find((item) => (
    item.instanceName === state.instanceName
    && item.difficultyName === state.difficultyName
    && item.maxPlayers === state.maxPlayers
  )) ?? variants[0];
  const effectiveEncounters = state.encounters.length > 0
    ? state.encounters.filter((encounter) => variant?.encounters.includes(encounter))
    : variant?.encounters ?? [];
  const { metric, display, dateRange, showAverage, showBestThreeAverage } = state;
  const performanceQueries = useCharacterPerformances(selectedPlayers.map((selectedPlayer) => ({
    playerGuid: selectedPlayer.id,
    instanceName: variant?.instanceName,
    encounterNames: effectiveEncounters,
    difficultyName: variant?.difficultyName,
    maxPlayers: variant?.maxPlayers,
    metric,
  })));
  const filteredRuns = filterPerformanceRunSeries(
    selectedPlayers.map((selectedPlayer, index) => ({
      id: selectedPlayer.id,
      runs: performanceQueries[index]?.data?.runs ?? [],
      spec: selectedPlayer.spec,
      subSpec: selectedPlayer.subSpec,
    })),
    display,
    dateRange,
  );
  const series: PerformanceSeries[] = selectedPlayers.map((selectedPlayer, index) => {
    const allRuns = performanceQueries[index]?.data?.runs ?? [];
    const specs = [...new Set(allRuns
      .map((run) => run.player_spec)
      .filter((value) => value && value !== "Mixed"))].sort();
    const subSpecs = [...new Set(allRuns
      .filter((run) => !selectedPlayer.spec || run.player_spec === selectedPlayer.spec)
      .map((run) => run.player_sub_spec)
      .filter((value): value is string => !!value && value !== "Mixed"))].sort();
    return {
      player: selectedPlayer,
      specs,
      subSpecs,
      rawRuns: filteredRuns[index]?.rawRuns ?? [],
      runs: filteredRuns[index]?.runs ?? [],
    };
  });
  const configuredSeries = playerDialog && playerDialog !== "add"
    ? series.find((item) => item.player.id === playerDialog)
    : undefined;
  const omittedParseCount = display === "parse"
    ? series.reduce((count, item) => count + item.rawRuns.length - item.runs.length, 0)
    : 0;

  const selectVariant = (key: string) => {
    const nextVariant = variants.find((item) => item.key === key);
    if (!nextVariant) return;
    onStateChange({
      ...state,
      instanceName: nextVariant.instanceName,
      difficultyName: nextVariant.difficultyName,
      maxPlayers: nextVariant.maxPlayers,
      encounters: [],
      players: state.players.map((item) => ({ ...item, spec: null, subSpec: null })),
    });
  };

  const selectEncounter = (encounter: string, additive: boolean) => {
    if (!additive) {
      onStateChange({ ...state, encounters: [encounter] });
      return;
    }

    const current = effectiveEncounters;
    if (current.includes(encounter)) {
      if (current.length > 1) onStateChange({ ...state, encounters: current.filter((item) => item !== encounter) });
      return;
    }
    if (variant) {
      onStateChange({
        ...state,
        encounters: variant.encounters.filter((item) => current.includes(item) || item === encounter),
      });
    }
  };

  const updatePlayerFilter = (id: string, spec: string | null, subSpec: string | null = null) => {
    onStateChange({
      ...state,
      players: state.players.map((item) => item.id === id ? { ...item, spec, subSpec } : item),
    });
  };

  const addPlayer = (result: ArmorySearchResult) => {
    if (state.players.length >= MAX_COMPARISON_PLAYERS || state.players.some((item) => item.id === result.id)) return;
    onStateChange({
      ...state,
      players: [...state.players, { id: result.id, spec: null, subSpec: null }],
    });
    setSearchQuery("");
    setPlayerDialog(result.id);
  };

  const removePlayer = (id: string) => {
    onStateChange({ ...state, players: state.players.filter((item) => item.id !== id) });
    setPlayerDialog(null);
  };

  return (
    <Card className="overflow-hidden border-border/80 bg-gradient-to-b from-card to-card/70">
      <CardContent className="space-y-5">
        {variants.length === 0 ? (
          <EmptyState loading={encountersQuery.isLoading} />
        ) : (
          <>
            <div className="border-b border-border/60 pb-5">
              <label className="block min-w-0 max-w-xl space-y-1.5 text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Map className="h-3.5 w-3.5 text-sky-400" />
                  Instance
                </span>
                <select
                  value={variant?.key ?? ""}
                  onChange={(event) => selectVariant(event.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-sky-500/70"
                >
                  {variants.map((item) => (
                    <option key={item.key} value={item.key}>
                      {variantLabel(item.instanceName, item.difficultyName, item.maxPlayers)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-col lg:flex-row">
              <aside className="shrink-0 border-b border-border/60 pb-5 lg:w-64 lg:border-r lg:border-b-0 lg:pr-5 lg:pb-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Encounters</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-xs"
                    onClick={() => onStateChange({ ...state, encounters: [] })}
                    title="Select all encounters"
                  >
                    All
                  </Button>
                </div>
                <div className="mt-3">
                  <h4 className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Bosses
                  </h4>
                  <div className="space-y-1">
                    {variant?.encounters.map((encounter) => {
                      const selected = effectiveEncounters.includes(encounter);
                      return (
                        <div
                          role="button"
                          tabIndex={0}
                          key={encounter}
                          onClick={(event) => selectEncounter(encounter, event.ctrlKey || event.metaKey)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectEncounter(encounter, event.ctrlKey || event.metaKey);
                            }
                          }}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-all duration-150",
                            selected
                              ? "border-l-3 border-l-primary-foreground/70 bg-primary-darker text-primary-foreground shadow-sm"
                              : "hover:translate-x-0.5 hover:bg-accent/50",
                          )}
                          title={`${encounter}. Click to select, Ctrl+Click to toggle`}
                        >
                          <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                          <span className="min-w-0 flex-1 truncate">{encounter}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/50">
                  Click to select one boss. Ctrl+Click or Cmd+Click to compare multiple bosses.
                </p>
              </aside>

              <div className="min-w-0 flex-1 pt-5 lg:pl-6 lg:pt-0">
                <div className="flex items-start gap-4 pb-4">
                  <div className="shrink-0 space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-1.5">
                    <div className="flex gap-1">
                      {([
                        { value: "180d" as const, label: "180d" },
                        { value: "60d" as const, label: "60d" },
                        { value: "30d" as const, label: "30d" },
                      ]).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onStateChange({ ...state, dateRange: option.value })}
                          className={cn(
                            "flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                            dateRange === option.value
                              ? "bg-[#5F8FA6] text-white"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1 border-t border-white/10 pt-1.5">
                      <button
                        type="button"
                        onClick={() => onStateChange({ ...state, metric: "dps" })}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
                          metric === "dps"
                            ? "bg-red-500/20 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.5)] ring-1 ring-inset ring-red-400/50"
                            : "text-muted-foreground hover:text-red-300",
                        )}
                      >
                        <Swords className="h-3.5 w-3.5" />
                        DPS
                      </button>
                      <button
                        type="button"
                        onClick={() => onStateChange({ ...state, metric: "hps" })}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
                          metric === "hps"
                            ? "bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)] ring-1 ring-inset ring-emerald-400/50"
                            : "text-muted-foreground hover:text-emerald-300",
                        )}
                      >
                        <HeartPulse className="h-3.5 w-3.5" />
                        HPS
                      </button>
                    </div>
                    <div className="flex gap-1 border-t border-white/10 pt-1.5">
                      <button
                        type="button"
                        onClick={() => onStateChange({ ...state, display: "raw" })}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                          display === "raw"
                            ? "bg-white/15 text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Database className="h-3.5 w-3.5" />
                        Raw
                      </button>
                      <button
                        type="button"
                        onClick={() => onStateChange({ ...state, display: "parse" })}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                          display === "parse"
                            ? "bg-white/15 text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Percent className="h-3.5 w-3.5" />
                        Parse
                      </button>
                    </div>
                  </div>

                  <div aria-hidden="true" className="h-[7.75rem] w-px shrink-0 bg-border/80" />
                  <div className="min-w-0 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Players</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedPlayers.map((selectedPlayer) => (
                        <button
                          key={selectedPlayer.id}
                          type="button"
                          onClick={() => setPlayerDialog(selectedPlayer.id)}
                          className="group flex h-10 items-center gap-2 rounded-md border border-border bg-background/70 pr-2.5 text-left text-xs transition-colors hover:bg-accent/50"
                          style={{ borderColor: selectedPlayer.color }}
                        >
                          <img
                            src={getClassIconUrl(selectedPlayer.className)}
                            alt={`${selectedPlayer.className} class`}
                            className="size-10 shrink-0 rounded-l-[5px] border-r object-cover"
                            style={{ borderColor: selectedPlayer.color }}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold" style={{ color: selectedPlayer.color }}>
                              {selectedPlayer.name}
                            </span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {selectedPlayer.spec ? `${selectedPlayer.spec}${selectedPlayer.subSpec ? ` / ${selectedPlayer.subSpec}` : ""}` : "All specs"}
                            </span>
                          </span>
                          <Settings2 className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
                        </button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-xs"
                        disabled={selectedPlayers.length >= MAX_COMPARISON_PLAYERS}
                        onClick={() => setPlayerDialog("add")}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add player
                      </Button>
                      <span className="text-[10px] text-muted-foreground/60">{selectedPlayers.length}/5</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-border/60 py-4">
                  <WaterlineToggle
                    checked={showAverage}
                    onCheckedChange={(checked) => onStateChange({ ...state, showAverage: checked })}
                    color="rgb(148 163 184)"
                  >
                    Average
                  </WaterlineToggle>
                  <WaterlineToggle
                    checked={showBestThreeAverage}
                    onCheckedChange={(checked) => onStateChange({ ...state, showBestThreeAverage: checked })}
                    color="rgb(251 191 36)"
                  >
                    Best 3 avg
                  </WaterlineToggle>
                </div>

                <PerformanceTrend
                  series={series}
                  metric={metric}
                  display={display}
                  showAverage={showAverage}
                  showBestThreeAverage={showBestThreeAverage}
                  loading={performanceQueries.some((query) => query.isLoading)}
                  omittedParseCount={omittedParseCount}
                />

                <PerformanceTable series={series} metric={metric} selectedCount={effectiveEncounters.length} />
              </div>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={playerDialog !== null} onOpenChange={(open) => { if (!open) { setPlayerDialog(null); setSearchQuery(""); } }}>
        <DialogContent className="max-w-lg">
          {playerDialog === "add" ? (
            <>
              <DialogHeader>
                <DialogTitle>Add player</DialogTitle>
                <DialogDescription>
                  Compare up to five players from {primaryPlayer.realm_name} on the same encounters and date range.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search player name…"
                    className="pl-9"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-md border border-border styled-scrollbar">
                  {debouncedSearch.length < 2 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">Enter at least two characters.</div>
                  ) : playerSearch.isLoading ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">Searching…</div>
                  ) : (playerSearch.data?.players ?? []).filter((result) => !selectedPlayers.some((item) => item.id === result.id)).length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">No available players found.</div>
                  ) : (
                    (playerSearch.data?.players ?? [])
                      .filter((result) => !selectedPlayers.some((item) => item.id === result.id))
                      .slice(0, 12)
                      .map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => addPlayer(result)}
                          className="flex w-full items-center justify-between border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-accent/50"
                        >
                          <span>
                            <span className="font-medium" style={{ color: getClassColorVar(result.class) }}>{result.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{result.class}</span>
                          </span>
                          <span className="text-xs text-muted-foreground">{result.guild_name ? `<${result.guild_name}>` : result.realm_name}</span>
                        </button>
                      ))
                  )}
                </div>
              </div>
            </>
          ) : configuredSeries ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: configuredSeries.player.color }} />
                  <span style={{ color: getClassColorVar(configuredSeries.player.className) }}>{configuredSeries.player.name}</span>
                </DialogTitle>
                <DialogDescription>
                  Choose which {configuredSeries.player.className.toLowerCase()} spec and subspec to include.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Spec</div>
                  <div className="flex flex-wrap gap-2">
                    <FilterButton
                      active={!configuredSeries.player.spec}
                      onClick={() => updatePlayerFilter(configuredSeries.player.id, null)}
                    >
                      All specs
                    </FilterButton>
                    {configuredSeries.specs.map((option) => (
                      <FilterButton
                        key={option}
                        active={configuredSeries.player.spec === option}
                        onClick={() => updatePlayerFilter(configuredSeries.player.id, option)}
                      >
                        {option}
                      </FilterButton>
                    ))}
                  </div>
                </div>
                {configuredSeries.player.spec && configuredSeries.subSpecs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Subspec</div>
                    <div className="flex flex-wrap gap-2">
                      <FilterButton
                        active={!configuredSeries.player.subSpec}
                        onClick={() => updatePlayerFilter(configuredSeries.player.id, configuredSeries.player.spec)}
                      >
                        All {configuredSeries.player.spec}
                      </FilterButton>
                      {configuredSeries.subSpecs.map((option) => (
                        <FilterButton
                          key={option}
                          active={configuredSeries.player.subSpec === option}
                          onClick={() => updatePlayerFilter(configuredSeries.player.id, configuredSeries.player.spec, option)}
                        >
                          {option}
                        </FilterButton>
                      ))}
                    </div>
                  </div>
                )}
                {configuredSeries.specs.length === 0 && (
                  <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                    No complete runs are available for this player and encounter selection.
                  </div>
                )}
                <div className="flex justify-end border-t border-border/60 pt-4">
                  <Button variant="destructive" size="sm" onClick={() => removePlayer(configuredSeries.player.id)}>
                    <Trash2 className="h-4 w-4" />
                    Remove player
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading player filters…</div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PerformanceTrend({
  series,
  metric,
  display,
  showAverage,
  showBestThreeAverage,
  loading,
  omittedParseCount,
}: {
  series: readonly PerformanceSeries[];
  metric: ParseMetric;
  display: DisplayMode;
  showAverage: boolean;
  showBestThreeAverage: boolean;
  loading: boolean;
  omittedParseCount: number;
}) {
  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading performance…</div>;

  const chartPoints = series.flatMap((item) => item.runs.map((run) => ({
    player: item.player,
    run,
    value: performanceValue(run, metric, display),
    timestamp: new Date(run.started_at).getTime(),
  })));
  if (chartPoints.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
        No complete {display === "parse" ? "scored " : ""}runs match these filters.
      </div>
    );
  }

  const values = chartPoints.map((point) => point.value);
  const waterlines = calculatePerformanceWaterlines(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, max * 0.1, 1);
  const floor = Math.max(0, min - spread * 0.2);
  const ceiling = max + spread * 0.2;
  const minTime = Math.min(...chartPoints.map((point) => point.timestamp));
  const maxTime = Math.max(...chartPoints.map((point) => point.timestamp));
  const x = (timestamp: number) => minTime === maxTime ? 50 : 6 + ((timestamp - minTime) / (maxTime - minTime)) * 88;
  const y = (value: number) => 90 - ((value - floor) / (ceiling - floor)) * 76;
  const formatValue = (value: number) => display === "parse" ? value.toFixed(1) : Math.round(value).toLocaleString();

  return (
    <div className="space-y-3 border-t border-border/60 pt-5">
      <div className="relative h-72 overflow-visible rounded-lg border border-border/70 bg-black/10">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none h-full w-full" aria-hidden="true">
          {[20, 40, 60, 80].map((line) => (
            <line key={line} x1="4" x2="96" y1={line} y2={line} stroke="currentColor" strokeWidth="0.25" className="text-border" vectorEffect="non-scaling-stroke" />
          ))}
          {showAverage && waterlines && (
            <line
              x1="4"
              x2="96"
              y1={y(waterlines.average)}
              y2={y(waterlines.average)}
              stroke="rgb(148 163 184)"
              strokeWidth="1"
              strokeDasharray="5 5"
              opacity="0.75"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {showBestThreeAverage && waterlines && (
            <line
              x1="4"
              x2="96"
              y1={y(waterlines.bestThreeAverage)}
              y2={y(waterlines.bestThreeAverage)}
              stroke="rgb(251 191 36)"
              strokeWidth="1"
              strokeDasharray="5 5"
              opacity="0.8"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {series.map((item) => {
            const playerPoints = item.runs
              .map((run) => ({
                timestamp: new Date(run.started_at).getTime(),
                value: performanceValue(run, metric, display),
              }))
              .sort((a, b) => a.timestamp - b.timestamp);
            if (playerPoints.length < 2) return null;
            return (
              <polyline
                key={item.player.id}
                points={playerPoints.map((point) => `${x(point.timestamp)},${y(point.value)}`).join(" ")}
                fill="none"
                stroke={item.player.color}
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {showAverage && waterlines && (
          <WaterlineLabel
            top={y(waterlines.average)}
            color="rgb(148 163 184)"
            label="Average"
            value={formatValue(waterlines.average)}
          />
        )}
        {showBestThreeAverage && waterlines && (
          <WaterlineLabel
            top={y(waterlines.bestThreeAverage)}
            color="rgb(251 191 36)"
            label="Best 3 avg"
            value={formatValue(waterlines.bestThreeAverage)}
          />
        )}
        {chartPoints.map(({ player: pointPlayer, run, value: rawValue, timestamp }) => {
          const pointX = x(timestamp);
          const pointY = y(rawValue);
          const value = formatValue(rawValue);
          const valueLabel = display === "parse" ? "Parse" : metric.toUpperCase();
          const tooltipX = pointX < 15 ? "left-0" : pointX > 85 ? "right-0" : "left-1/2 -translate-x-1/2";
          const tooltipY = pointY < 24 ? "top-full mt-2" : "bottom-full mb-2";

          return (
            <div
              key={`${pointPlayer.id}-${run.run_id}`}
              className="group absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pointX}%`, top: `${pointY}%` }}
            >
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{ "--tw-ring-color": pointPlayer.color } as React.CSSProperties}
                aria-label={`${pointPlayer.name}, ${new Date(run.started_at).toLocaleDateString()}, ${value} ${valueLabel}`}
              >
                <span
                  className="size-2.5 rounded-full border-2 border-background shadow-[0_2px_7px_rgba(0,0,0,0.55)] transition-transform duration-150 group-hover:scale-125 group-focus-within:scale-125"
                  style={{ backgroundColor: pointPlayer.color, boxShadow: `0 0 0 1px ${pointPlayer.color}, 0 2px 7px rgba(0,0,0,0.55)` }}
                />
              </button>
              <div
                role="tooltip"
                className={cn(
                  "pointer-events-none absolute hidden min-w-40 rounded-md border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-xl shadow-black/40 backdrop-blur-sm group-hover:block group-focus-within:block",
                  tooltipX,
                  tooltipY,
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  <span className="size-2 rounded-full" style={{ backgroundColor: pointPlayer.color }} />
                  <span style={{ color: getClassColorVar(pointPlayer.className) }}>{pointPlayer.name}</span>
                </div>
                <div className="mt-1 text-muted-foreground">{new Date(run.started_at).toLocaleDateString()}</div>
                <div className="mt-1 flex items-baseline justify-between gap-4">
                  <span className="text-muted-foreground">{valueLabel}</span>
                  <span className="font-mono font-semibold tabular-nums" style={{ color: pointPlayer.color }}>{value}</span>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {run.player_spec}{run.player_sub_spec && run.player_sub_spec !== run.player_spec ? ` · ${run.player_sub_spec}` : ""}
                </div>
              </div>
            </div>
          );
        })}
        <div className="pointer-events-none absolute inset-x-4 bottom-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{new Date(minTime).toLocaleDateString()}</span>
          <span>{new Date(maxTime).toLocaleDateString()}</span>
        </div>
      </div>
      {display === "parse" && omittedParseCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {omittedParseCount} {omittedParseCount === 1 ? "run is" : "runs are"} omitted because a selected boss lacks a cached parse.
        </p>
      )}
    </div>
  );
}

function PerformanceTable({ series, metric, selectedCount }: { series: readonly PerformanceSeries[]; metric: ParseMetric; selectedCount: number }) {
  const rows = series
    .flatMap((item) => item.runs.map((run) => ({ player: item.player, run })))
    .sort((a, b) => b.run.started_at.localeCompare(a.run.started_at));

  return (
    <div className="space-y-2 border-t border-border/60 pt-5">
      <div className="text-sm font-semibold">Run summary</div>
      <div className="overflow-x-auto styled-scrollbar">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Player</th>
              <th className="pb-2 pr-4 font-medium">Spec</th>
              <th className="pb-2 pr-4 text-right font-medium">Bosses</th>
              <th className="pb-2 pr-4 text-right font-medium">Duration</th>
              <th className="pb-2 pr-4 text-right font-medium">Total</th>
              <th className="pb-2 pr-4 text-right font-medium">{metric.toUpperCase()}</th>
              <th className="pb-2 pr-4 text-right font-medium">Parse</th>
              <th className="pb-2 text-right font-medium">Run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player: rowPlayer, run }) => (
              <tr key={`${rowPlayer.id}-${run.run_id}`} className="border-b border-border/50 last:border-0">
                <td className="py-3 pr-4 whitespace-nowrap">{new Date(run.started_at).toLocaleDateString()}</td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: rowPlayer.color }} />
                  <span className="font-medium" style={{ color: getClassColorVar(rowPlayer.className) }}>{rowPlayer.name}</span>
                </td>
                <td className="py-3 pr-4">
                  <div className="font-medium">{run.player_spec || "Unknown"}</div>
                  {run.player_sub_spec && run.player_sub_spec !== run.player_spec && <div className="text-xs text-muted-foreground">{run.player_sub_spec}</div>}
                </td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums">{run.encounter_count}/{selectedCount}</td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums">{formatDuration(run.duration_secs)}</td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums">{formatCompact(metric === "hps" ? run.healing_done + run.absorbed_done : run.damage_done)}</td>
                <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums" style={{ color: rowPlayer.color }}>{Math.round(metric === "hps" ? run.hps : run.dps).toLocaleString()}</td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums" style={{ color: run.average_parse == null ? undefined : parseColor(run.average_parse) }}>
                  {run.average_parse == null ? "—" : Math.round(run.average_parse)}
                </td>
                <td className="py-3 text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/instances/${run.log_hashed_slug}`} aria-label="Open raid run">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">No runs to summarize.</div>}
      </div>
    </div>
  );
}

function WaterlineToggle({
  checked,
  onCheckedChange,
  color,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  color: string;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} />
      <span className="inline-block h-px w-4 border-t border-dashed" style={{ borderColor: color }} />
      <span>{children}</span>
    </label>
  );
}

function WaterlineLabel({ top, color, label, value }: { top: number; color: string; label: string; value: string }) {
  return (
    <div
      className="pointer-events-none absolute right-[4%] z-[5] -translate-y-1/2 rounded bg-zinc-950/85 px-1.5 py-0.5 font-mono text-[10px] tabular-nums shadow-sm backdrop-blur-sm"
      style={{ top: `${top}%`, color }}
    >
      {label} {value}
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-md border px-2.5 py-1 text-xs transition-colors", active ? "border-sky-400/60 bg-sky-400/15 text-sky-100" : "border-border text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return <div className="py-16 text-center text-sm text-muted-foreground">{loading ? "Loading encounters…" : "No ranked boss encounters are available for this character."}</div>;
}

function variantLabel(instance: string, difficulty: string, maxPlayers: number) {
  const details = [difficulty, maxPlayers > 0 ? `${maxPlayers}-player` : ""].filter(Boolean).join(" · ");
  return details ? `${instance} · ${details}` : instance;
}

function formatDuration(seconds: number) {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function parseColor(score: number) {
  if (score >= 99) return "#e6cc80";
  if (score >= 95) return "#ff8000";
  if (score >= 75) return "#a335ee";
  if (score >= 50) return "#0070ff";
  if (score >= 25) return "#1eff00";
  return "#9d9d9d";
}

