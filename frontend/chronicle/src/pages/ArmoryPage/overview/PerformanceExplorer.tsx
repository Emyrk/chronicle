import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, CheckCircle, CircleQuestionMark, Database, ExternalLink, Eye, EyeOff, HeartPulse, Keyboard, Layers3, List, Map, MousePointerClick, Percent, Plus, Search, Settings2, Swords, Trash2 } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { specializationIconUrl } from "@/config/specializationIcon";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import { getClassIconUrl } from "../characterDisplay";
import { getClassColorVar } from "../types";
import type { ParseMetric } from "./util";
import type { PerformanceComparisonState, PerformanceDisplayMode } from "./performanceComparisonState";
import {
  assignChartCollisionOffsets,
  assignPerformanceSeriesColors,
  assignSpecPointShapes,
  buildPerformanceVariants,
  calculatePerformanceWaterlineMarkers,
  filterPerformanceRunSeries,
  performanceValue,
  type PerformanceDateRange,
  type PerformanceInstanceVariant,
  type PerformancePointShape,
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
  hidden: boolean;
  color: string;
}

interface PerformanceSeries {
  player: SelectedPerformancePlayer;
  runs: CharacterPerformanceRun[];
  rawRuns: CharacterPerformanceRun[];
  specs: string[];
  subSpecs: string[];
  specShapes: Record<string, PerformancePointShape>;
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
  const [mobileEncounterOpen, setMobileEncounterOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
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
    hidden: selection.hidden,
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
  const { metric, display, dateRange } = state;
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
      specShapes: assignSpecPointShapes(allRuns.map((run) => run.player_spec)),
      rawRuns: filteredRuns[index]?.rawRuns ?? [],
      runs: filteredRuns[index]?.runs ?? [],
    };
  });
  const configuredSeries = playerDialog && playerDialog !== "add"
    ? series.find((item) => item.player.id === playerDialog)
    : undefined;
  const visibleSeries = series.filter((item) => !item.player.hidden);
  const omittedParseCount = display === "parse"
    ? visibleSeries.reduce((count, item) => count + item.rawRuns.length - item.runs.length, 0)
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

  const togglePlayerVisibility = (id: string) => {
    onStateChange({
      ...state,
      players: state.players.map((item) => item.id === id ? { ...item, hidden: !item.hidden } : item),
    });
  };

  const addPlayer = (result: ArmorySearchResult) => {
    if (state.players.length >= MAX_COMPARISON_PLAYERS || state.players.some((item) => item.id === result.id)) return;
    onStateChange({
      ...state,
      players: [...state.players, { id: result.id, spec: null, subSpec: null, hidden: false }],
    });
    setSearchQuery("");
    setPlayerDialog(result.id);
  };

  const removePlayer = (id: string) => {
    onStateChange({ ...state, players: state.players.filter((item) => item.id !== id) });
    setPlayerDialog(null);
  };

  return (
    <Card className="overflow-hidden border-border/80 bg-gradient-to-b from-card to-card/70 py-4 sm:py-6">
      <CardContent className="space-y-5 px-3 sm:px-6">
        {variants.length === 0 ? (
          <EmptyState loading={encountersQuery.isLoading} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-5">
              <label className="block min-w-0 max-w-xl flex-1 space-y-1.5 text-xs font-medium text-muted-foreground">
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden h-8 w-8 shrink-0 text-sky-400 hover:bg-sky-400/10 hover:text-sky-300 sm:inline-flex"
                title="Keyboard shortcuts"
                aria-label="Show keyboard shortcuts"
                onClick={() => setShortcutHelpOpen(true)}
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-col lg:flex-row">
              <aside className="hidden shrink-0 lg:block lg:w-64 lg:border-r lg:border-border/60 lg:pr-5">
                <EncounterSelectorControls
                  variant={variant}
                  dateRange={dateRange}
                  effectiveEncounters={effectiveEncounters}
                  onDateRangeChange={(nextDateRange) => onStateChange({ ...state, dateRange: nextDateRange })}
                  onSelectAll={() => onStateChange({ ...state, encounters: [] })}
                  onSelectEncounter={selectEncounter}
                />
              </aside>

              <div className="min-w-0 flex-1 pt-5 lg:pl-6 lg:pt-0">
                <div className="pb-4">
                  <div className="min-w-0 space-y-2">
                    <div className="hidden text-xs font-medium text-muted-foreground sm:block">Players</div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
                      <div className="flex w-full flex-col gap-1 sm:w-auto">
                        <div className="grid w-full grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/20 p-1 sm:w-auto">
                          <button
                            type="button"
                            onClick={() => onStateChange({ ...state, metric: "dps" })}
                            className={cn(
                              "flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
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
                              "flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
                              metric === "hps"
                                ? "bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)] ring-1 ring-inset ring-emerald-400/50"
                                : "text-muted-foreground hover:text-emerald-300",
                            )}
                          >
                            <HeartPulse className="h-3.5 w-3.5" />
                            HPS
                          </button>
                        </div>
                        <div className="grid w-full grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/20 p-1 sm:w-auto">
                          <button
                            type="button"
                            onClick={() => onStateChange({ ...state, display: "raw" })}
                            className={cn(
                              "flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
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
                              "flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
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
                      <div className="text-xs font-medium text-muted-foreground sm:hidden">Players</div>
                      <div aria-hidden="true" className="hidden w-px self-stretch bg-border/80 sm:block" />
                      <div className="flex min-w-0 items-end gap-2">
                        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 sm:flex-none sm:grid-flow-col sm:grid-cols-none sm:grid-rows-2">
                        {series.map(({ player: selectedPlayer, specShapes }) => (
                          <PlayerShapesTooltip
                            key={selectedPlayer.id}
                            color={selectedPlayer.color}
                            specShapes={specShapes}
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                if (event.shiftKey) togglePlayerVisibility(selectedPlayer.id);
                                else setPlayerDialog(selectedPlayer.id);
                              }}
                              className={cn(
                                "group flex h-8 min-w-0 items-center gap-2 rounded-md border border-border bg-background/70 pr-2 text-left text-xs transition-all hover:bg-accent/50 sm:min-w-40",
                                selectedPlayer.hidden && "opacity-45 saturate-50",
                              )}
                              style={{ borderColor: selectedPlayer.color }}
                              aria-label={`${selectedPlayer.name}. ${selectedPlayer.hidden ? "Hidden, Shift+click to show" : "Shift+click to hide"}`}
                            >
                              <img
                                src={getClassIconUrl(selectedPlayer.className)}
                                alt={`${selectedPlayer.className} class`}
                                className="size-8 shrink-0 rounded-l-[5px] border-r object-cover"
                                style={{ borderColor: selectedPlayer.color }}
                              />
                              <span className="min-w-0 flex-1 leading-tight">
                                <span className="block truncate font-semibold" style={{ color: selectedPlayer.color }}>
                                  {selectedPlayer.name}
                                </span>
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {selectedPlayer.spec ? `${selectedPlayer.spec}${selectedPlayer.subSpec ? ` / ${selectedPlayer.subSpec}` : ""}` : "All specs"}
                                </span>
                              </span>
                              {selectedPlayer.hidden && <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                              <Settings2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
                            </button>
                          </PlayerShapesTooltip>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 min-w-0 px-3 text-xs sm:min-w-32"
                          disabled={selectedPlayers.length >= MAX_COMPARISON_PLAYERS}
                          onClick={() => setPlayerDialog("add")}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add player
                        </Button>
                      </div>
                        <span className="text-[10px] text-muted-foreground/60">{selectedPlayers.length}/5</span>
                      </div>
                    </div>
                  </div>
                </div>

                <PerformanceTrend
                  series={visibleSeries}
                  metric={metric}
                  display={display}
                  loading={selectedPlayers.some((player, index) => !player.hidden && performanceQueries[index]?.isLoading)}
                  omittedParseCount={omittedParseCount}
                />

                <PerformanceTable series={visibleSeries} metric={metric} display={display} />
              </div>
            </div>
          </>
        )}
      </CardContent>

      <Sheet open={mobileEncounterOpen} onOpenChange={setMobileEncounterOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="fixed bottom-8 left-8 z-40 h-14 w-14 rounded-full shadow-lg lg:hidden"
            title="Select encounters"
          >
            <List className="h-5 w-5" />
            <span className="sr-only">Select encounters</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[19rem] max-w-[85vw] gap-0 p-0 lg:hidden">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Encounter selection</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 styled-scrollbar">
            <EncounterSelectorControls
              variant={variant}
              dateRange={dateRange}
              effectiveEncounters={effectiveEncounters}
              onDateRangeChange={(nextDateRange) => onStateChange({ ...state, dateRange: nextDateRange })}
              onSelectAll={() => onStateChange({ ...state, encounters: [] })}
              onSelectEncounter={selectEncounter}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-sky-400" />
              Keyboard shortcuts
            </DialogTitle>
            <DialogDescription>Quick controls for the performance panel.</DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border/60 rounded-md border border-border/70">
            <ShortcutRow keys={["Left click"]} icon={<Settings2 className="h-4 w-4" />}>
              Configure a player’s spec filters.
            </ShortcutRow>
            <ShortcutRow keys={["Shift", "Left click"]} icon={<EyeOff className="h-4 w-4" />}>
              Hide or show a player’s chart and table data.
            </ShortcutRow>
            <ShortcutRow keys={["Ctrl / ⌘", "Left click"]} icon={<MousePointerClick className="h-4 w-4" />}>
              Add or remove an encounter from the selection.
            </ShortcutRow>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={playerDialog !== null} onOpenChange={(open) => { if (!open) { setPlayerDialog(null); setSearchQuery(""); } }}>
        <DialogContent className="max-w-xl">
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
                  <PlayerNameWithShapes
                    name={configuredSeries.player.name}
                    color={configuredSeries.player.color}
                    specShapes={configuredSeries.specShapes}
                    textColor={getClassColorVar(configuredSeries.player.className)}
                  />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                <div className="space-y-2.5">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Specialization</div>
                    <div className="mt-0.5 text-xs text-muted-foreground/70">Select one spec, or include every available spec.</div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <SpecOptionCard
                      active={!configuredSeries.player.spec}
                      label="All"
                      description="Every spec"
                      icon={<Layers3 className="size-6" />}
                      onClick={() => updatePlayerFilter(configuredSeries.player.id, null)}
                    />
                    {configuredSeries.specs.map((option) => (
                      <SpecOptionCard
                        key={option}
                        active={configuredSeries.player.spec === option}
                        label={option}
                        description={`${option} runs only`}
                        shape={!configuredSeries.player.spec ? configuredSeries.specShapes[option] : undefined}
                        shapeColor={configuredSeries.player.color}
                        icon={option === "Unknown" ? (
                          <CircleQuestionMark className="size-6" />
                        ) : (
                          <img
                            src={specializationIconUrl(configuredSeries.player.className, option)}
                            alt=""
                            className="size-10 rounded-md object-cover shadow-sm"
                          />
                        )}
                        onClick={() => updatePlayerFilter(configuredSeries.player.id, option)}
                      />
                    ))}
                  </div>
                </div>
                {configuredSeries.player.spec && configuredSeries.subSpecs.length > 0 && (
                  <div className="space-y-2.5">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Subspec</div>
                      <div className="mt-0.5 text-xs text-muted-foreground/70">Narrow {configuredSeries.player.spec} runs by build.</div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <SpecOptionCard
                        active={!configuredSeries.player.subSpec}
                        label="All"
                        description={`Every ${configuredSeries.player.spec} build`}
                        icon={<Layers3 className="size-6" />}
                        onClick={() => updatePlayerFilter(configuredSeries.player.id, configuredSeries.player.spec)}
                      />
                      {configuredSeries.subSpecs.map((option) => (
                        <SpecOptionCard
                          key={option}
                          active={configuredSeries.player.subSpec === option}
                          label={option}
                          description={`${configuredSeries.player.spec} subspec`}
                          icon={(
                            <img
                              src={specializationIconUrl(configuredSeries.player.className, configuredSeries.player.spec!)}
                              alt=""
                              className="size-10 rounded-md object-cover shadow-sm"
                            />
                          )}
                          onClick={() => updatePlayerFilter(configuredSeries.player.id, configuredSeries.player.spec, option)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {configuredSeries.specs.length === 0 && (
                  <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                    No complete runs are available for this player and encounter selection.
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => togglePlayerVisibility(configuredSeries.player.id)}
                  >
                    {configuredSeries.player.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    {configuredSeries.player.hidden ? "Show player data" : "Hide player data"}
                  </Button>
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

function ShortcutRow({
  keys,
  icon,
  children,
}: {
  keys: string[];
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">{children}</span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((key) => (
          <kbd key={key} className="rounded border border-border/70 bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
            {key}
          </kbd>
        ))}
      </span>
    </div>
  );
}

function EncounterSelectorControls({
  variant,
  dateRange,
  effectiveEncounters,
  onDateRangeChange,
  onSelectAll,
  onSelectEncounter,
}: {
  variant?: PerformanceInstanceVariant;
  dateRange: PerformanceDateRange;
  effectiveEncounters: readonly string[];
  onDateRangeChange: (dateRange: PerformanceDateRange) => void;
  onSelectAll: () => void;
  onSelectEncounter: (encounter: string, additive: boolean) => void;
}) {
  return (
    <>
      <div className="rounded-lg border border-white/10 bg-black/20 p-1.5">
        <div className="flex gap-1">
          {([
            { value: "180d" as const, label: "180d" },
            { value: "60d" as const, label: "60d" },
            { value: "30d" as const, label: "30d" },
          ]).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onDateRangeChange(option.value)}
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
      </div>

      <div className="mt-5 border-t border-border/60 pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Encounters</h3>
          <Button
            variant="outline"
            size="sm"
            className="h-5 px-1.5 text-xs"
            onClick={onSelectAll}
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
                  onClick={(event) => onSelectEncounter(encounter, event.ctrlKey || event.metaKey)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectEncounter(encounter, event.ctrlKey || event.metaKey);
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
      </div>
    </>
  );
}

function PerformanceTrend({
  series,
  metric,
  display,
  loading,
  omittedParseCount,
}: {
  series: readonly PerformanceSeries[];
  metric: ParseMetric;
  display: DisplayMode;
  loading: boolean;
  omittedParseCount: number;
}) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading performance…</div>;

  const chartPoints = series.flatMap((item) => item.runs.map((run) => {
    const timestamp = new Date(run.started_at).getTime();
    return {
      id: `${item.player.id}-${run.run_id}`,
      player: item.player,
      run,
      value: performanceValue(run, metric, display),
      shape: item.specShapes[run.player_spec] ?? "circle",
      timestamp,
      day: startOfLocalDay(timestamp),
    };
  }));
  if (chartPoints.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
        No complete {display === "parse" ? "scored " : ""}runs match these filters.
      </div>
    );
  }

  const values = chartPoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, max * 0.1, 1);
  const floor = Math.max(0, min - spread * 0.2);
  const ceiling = max + spread * 0.2;
  const minTime = Math.min(...chartPoints.map((point) => point.day));
  const maxTime = Math.max(...chartPoints.map((point) => point.day));
  const x = (timestamp: number) => minTime === maxTime ? 50 : 6 + ((timestamp - minTime) / (maxTime - minTime)) * 88;
  const y = (value: number) => 90 - ((value - floor) / (ceiling - floor)) * 76;
  const formatValue = (value: number) => display === "parse" ? value.toFixed(1) : Math.round(value).toLocaleString();
  const yAxisTicks = [20, 40, 60, 80].map((position) => ({
    position,
    value: floor + ((90 - position) / 76) * (ceiling - floor),
  }));
  const performanceMarkers = calculatePerformanceWaterlineMarkers(
    series.map((item) => item.runs.map((run) => performanceValue(run, metric, display))),
  ).map((marker) => marker.kind === "average"
    ? {
        key: marker.kind,
        label: "Avg",
        value: marker.value,
        dashArray: "7 5",
        opacity: 0.65,
      }
    : {
        key: marker.kind,
        label: "Best 3 avg",
        value: marker.value,
        dashArray: "2 4",
        opacity: 0.9,
      });
  const markerLabels = performanceMarkers.map((marker, index) => {
    const position = y(marker.value);
    const overlaps = performanceMarkers.some((other, otherIndex) => (
      otherIndex !== index && Math.abs(y(other.value) - position) < 5
    ));
    return {
      ...marker,
      position,
      offset: overlaps ? (index === 0 ? -7 : 7) : 0,
    };
  });
  const parseTierBands = display === "parse"
    ? [
        { min: 0, max: 25, color: "#9d9d9d" },
        { min: 25, max: 50, color: "#1eff00" },
        { min: 50, max: 75, color: "#0070ff" },
        { min: 75, max: 95, color: "#a335ee" },
        { min: 95, max: 99, color: "#ff8000" },
        { min: 99, max: 100, color: "#e6cc80" },
      ].flatMap((band) => {
        const visibleMin = Math.max(floor, band.min);
        const visibleMax = Math.min(ceiling, band.max);
        if (visibleMax <= visibleMin) return [];
        const top = y(visibleMax);
        return [{ ...band, top, height: y(visibleMin) - top }];
      })
    : [];
  const pointOffsets = assignChartCollisionOffsets(chartPoints.map((point) => ({
    id: point.id,
    group: point.day,
    position: y(point.value),
  })));
  const activeDay = hoverDay !== null && chartPoints.some((point) => point.day === hoverDay)
    ? hoverDay
    : null;
  const hoveredPoints = activeDay === null
    ? []
    : chartPoints
        .filter((point) => point.day === activeDay)
        .sort((a, b) => a.timestamp - b.timestamp || b.value - a.value);
  const hoveredTimeGroups = [...new Set(hoveredPoints.map((point) => point.timestamp))].map((timestamp) => ({
    timestamp,
    points: hoveredPoints.filter((point) => point.timestamp === timestamp),
  }));
  const hoverX = activeDay === null ? null : x(activeDay);

  const updateHoverDay = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const uniqueDays = [...new Set(chartPoints.map((point) => point.day))];
    const nearestDay = uniqueDays.reduce((nearest, day) => {
      const nearestDistance = Math.abs((x(nearest) / 100) * bounds.width - pointerX);
      const dayDistance = Math.abs((x(day) / 100) * bounds.width - pointerX);
      return dayDistance < nearestDistance ? day : nearest;
    }, uniqueDays[0]);
    const nearestDistance = Math.abs((x(nearestDay) / 100) * bounds.width - pointerX);

    setHoverDay(nearestDistance <= 12 ? nearestDay : null);
  };

  return (
    <div className="space-y-3 border-t border-border/60 pt-5">
      <div
        className="relative h-72 cursor-crosshair overflow-visible rounded-lg border border-border/70 bg-black/10"
        onPointerMove={updateHoverDay}
        onPointerLeave={() => setHoverDay(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none h-full w-full" aria-hidden="true">
          {parseTierBands.map((band) => (
            <rect
              key={band.min}
              x="4"
              width="92"
              y={band.top}
              height={band.height}
              fill={band.color}
              opacity="0.055"
            />
          ))}
          {yAxisTicks.map((tick) => (
            <line key={tick.position} x1="4" x2="96" y1={tick.position} y2={tick.position} stroke="currentColor" strokeWidth="0.25" className="text-border" vectorEffect="non-scaling-stroke" />
          ))}
          {performanceMarkers.map((marker) => (
            <line
              key={marker.key}
              x1="4"
              x2="96"
              y1={y(marker.value)}
              y2={y(marker.value)}
              stroke={series[0].player.color}
              strokeWidth="1"
              strokeDasharray={marker.dashArray}
              opacity={marker.opacity}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {hoverX !== null && (
            <line
              x1={hoverX}
              x2={hoverX}
              y1="14"
              y2="90"
              stroke="rgb(148 163 184)"
              strokeWidth="1"
              opacity="0.8"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {series.map((item) => {
            const playerPoints = item.runs
              .map((run) => {
                const timestamp = new Date(run.started_at).getTime();
                return {
                  timestamp,
                  day: startOfLocalDay(timestamp),
                  value: performanceValue(run, metric, display),
                };
              })
              .sort((a, b) => a.timestamp - b.timestamp);
            if (playerPoints.length < 2) return null;
            return (
              <polyline
                key={item.player.id}
                points={playerPoints.map((point) => `${x(point.day)},${y(point.value)}`).join(" ")}
                fill="none"
                stroke={item.player.color}
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {yAxisTicks.map((tick) => (
          <span
            key={tick.position}
            className="pointer-events-none absolute left-2 z-[2] -translate-y-1/2 rounded bg-zinc-950/75 px-1 font-mono text-[10px] tabular-nums text-muted-foreground backdrop-blur-sm"
            style={{ top: `${tick.position}%` }}
          >
            {display === "parse" ? tick.value.toFixed(1) : formatCompact(tick.value)}
          </span>
        ))}
        {markerLabels.map((marker) => (
          <span
            key={marker.key}
            className="pointer-events-none absolute right-[4%] z-20 -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums shadow-sm ring-4 ring-background"
            style={{
              top: `${marker.position}%`,
              color: series[0].player.color,
              borderColor: series[0].player.color,
              transform: `translateY(calc(-50% + ${marker.offset}px))`,
            }}
          >
            {marker.label} · {formatValue(marker.value)}
          </span>
        ))}
        {chartPoints.map(({ id, player: pointPlayer, run, value: rawValue, shape, day }) => {
          const pointX = x(day);
          const pointY = y(rawValue);
          const value = formatValue(rawValue);
          const valueLabel = display === "parse" ? "Parse" : metric.toUpperCase();
          const pointColor = display === "parse" ? parseColor(rawValue) : pointPlayer.color;

          return (
            <div
              key={id}
              className="absolute z-10 transition-transform duration-200 ease-out"
              style={{
                left: `${pointX}%`,
                top: `${pointY}%`,
                transform: `translate(calc(-50% + ${activeDay === day ? pointOffsets[id] : 0}px), -50%)`,
              }}
            >
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{ "--tw-ring-color": pointPlayer.color } as React.CSSProperties}
                aria-label={`${pointPlayer.name}, ${new Date(run.started_at).toLocaleDateString()}, ${value} ${valueLabel}`}
              >
                <PerformancePointShape
                  shape={shape}
                  borderColor={pointPlayer.color}
                  fillColor={pointColor}
                  active={activeDay === day}
                />
              </button>
            </div>
          );
        })}
        {hoverX !== null && hoveredPoints.length > 0 && (
          <div
            className="pointer-events-none absolute top-3 z-30 min-w-52 rounded-md border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-xl shadow-black/40 backdrop-blur-sm"
            style={hoverX > 68 ? { right: `${100 - hoverX + 1}%` } : { left: `${hoverX + 1}%` }}
          >
            <div className="mb-1.5 border-b border-white/10 pb-1.5 font-medium text-muted-foreground">
              {new Date(activeDay!).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
            <div className="space-y-2.5">
              {hoveredTimeGroups.map((group) => (
                <div key={group.timestamp} className="space-y-1.5 border-b border-white/10 pb-2 last:border-0 last:pb-0">
                  <div className="font-mono text-[10px] font-medium tabular-nums text-muted-foreground">
                    {new Date(group.timestamp).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                  {group.points.map(({ player: pointPlayer, run, value, shape }) => {
                    const valueColor = display === "parse" ? parseColor(value) : pointPlayer.color;
                    const rawMetricValue = metric === "hps" ? run.hps : run.dps;
                    return (
                      <div key={`${pointPlayer.id}-${run.run_id}`} className="px-1.5 py-1">
                        <div className="flex items-center justify-between gap-5">
                          <span className="flex min-w-0 items-center gap-2 font-medium">
                            <PerformancePointShape
                              shape={shape}
                              borderColor={pointPlayer.color}
                              fillColor={valueColor}
                              className="size-2"
                            />
                            <span className="truncate" style={{ color: getClassColorVar(pointPlayer.className) }}>{pointPlayer.name}</span>
                          </span>
                          <span className="shrink-0 font-mono font-semibold tabular-nums" style={{ color: valueColor }}>
                            {formatValue(value)}
                          </span>
                        </div>
                        <div className="ml-4 mt-0.5 flex items-center justify-between gap-5 text-[10px] text-muted-foreground">
                          <span className="truncate">
                            {run.player_spec}{run.player_sub_spec && run.player_sub_spec !== run.player_spec ? ` · ${run.player_sub_spec}` : ""}
                          </span>
                          {display === "parse" && (
                            <span className="shrink-0 font-mono tabular-nums">
                              {Math.round(rawMetricValue).toLocaleString()} {metric.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <ResponsiveDateAxis minTime={minTime} maxTime={maxTime} />
      </div>
      {display === "parse" && omittedParseCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {omittedParseCount} {omittedParseCount === 1 ? "run is" : "runs are"} omitted because a selected boss lacks a cached parse.
        </p>
      )}
    </div>
  );
}

function ResponsiveDateAxis({ minTime, maxTime }: { minTime: number; maxTime: number }) {
  const axisRef = useRef<HTMLDivElement>(null);
  const [tickCount, setTickCount] = useState(2);

  useEffect(() => {
    const axis = axisRef.current;
    if (!axis) return;

    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setTickCount(width >= 1000 ? 7 : width >= 700 ? 5 : width >= 420 ? 3 : 2);
    });
    observer.observe(axis);
    return () => observer.disconnect();
  }, []);

  const singleDate = minTime === maxTime;
  const datesSpanYears = new Date(minTime).getFullYear() !== new Date(maxTime).getFullYear();
  const ticks = singleDate
    ? [{ timestamp: minTime, position: 50 }]
    : Array.from({ length: tickCount }, (_, index) => {
        const ratio = index / (tickCount - 1);
        return {
          timestamp: minTime + (maxTime - minTime) * ratio,
          position: 6 + ratio * 88,
        };
      });

  return (
    <div ref={axisRef} className="pointer-events-none absolute inset-x-0 bottom-2 h-4 text-[10px] text-muted-foreground">
      {ticks.map((tick, index) => (
        <span
          key={`${tick.timestamp}-${index}`}
          className={cn(
            "absolute whitespace-nowrap",
            singleDate || (index > 0 && index < ticks.length - 1)
              ? "-translate-x-1/2"
              : index === ticks.length - 1
                ? "-translate-x-full"
                : "",
          )}
          style={{ left: `${tick.position}%` }}
        >
          {new Date(tick.timestamp).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            ...(datesSpanYears ? { year: "numeric" } : {}),
          })}
        </span>
      ))}
    </div>
  );
}

function PerformanceTable({
  series,
  metric,
  display,
}: {
  series: readonly PerformanceSeries[];
  metric: ParseMetric;
  display: DisplayMode;
}) {
  const [selectedRow, setSelectedRow] = useState<{ player: SelectedPerformancePlayer; run: CharacterPerformanceRun } | null>(null);
  const rows = series
    .flatMap((item) => item.runs.map((run) => ({
      player: item.player,
      run,
      shape: item.specShapes[run.player_spec] ?? "circle",
      specShapes: item.specShapes,
    })))
    .sort((a, b) => b.run.started_at.localeCompare(a.run.started_at));

  return (
    <div className="space-y-2 border-t border-border/60 pt-5">
      <div className="text-sm font-semibold">Run summary</div>

      <div className="sm:hidden">
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-2 border-b border-border px-2 pb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Date</span>
          <span>Player</span>
          <span className="text-right">{display === "parse" ? "Parse" : metric.toUpperCase()}</span>
        </div>
        <div>
          {rows.map(({ player: rowPlayer, run, shape, specShapes }) => {
            const value = display === "parse" ? run.average_parse : metric === "hps" ? run.hps : run.dps;
            return (
              <button
                key={`${rowPlayer.id}-${run.run_id}`}
                type="button"
                onClick={() => setSelectedRow({ player: rowPlayer, run })}
                className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/40 px-2 py-2 text-left text-xs odd:bg-black/5 even:bg-black/20 hover:bg-accent/20 last:border-0"
              >
                <span className="font-mono tabular-nums text-muted-foreground">
                  {new Date(run.started_at).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <PerformancePointShape
                    shape={shape}
                    borderColor={rowPlayer.color}
                    fillColor={rowPlayer.color}
                    className="size-2"
                  />
                  {run.player_spec && run.player_spec !== "Unknown" && (
                    <img
                      src={specializationIconUrl(rowPlayer.className, run.player_spec)}
                      alt=""
                      className="size-4 shrink-0 rounded-sm object-cover"
                      onError={(event) => { event.currentTarget.hidden = true; }}
                    />
                  )}
                  <PlayerNameWithShapes
                    name={rowPlayer.name}
                    color={rowPlayer.color}
                    specShapes={specShapes}
                    className="truncate font-medium"
                    textColor={getClassColorVar(rowPlayer.className)}
                  />
                </span>
                <span
                  className="font-mono font-semibold tabular-nums"
                  style={{ color: display === "parse" && value != null ? parseColor(value) : undefined }}
                >
                  {value == null ? "—" : display === "parse" ? Math.round(value) : Math.round(value).toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden overflow-x-auto styled-scrollbar sm:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Player</th>
              <th className="pb-2 pr-4 font-medium">Spec</th>
              <th className="pb-2 pr-4 text-right font-medium">Duration</th>
              <th className="pb-2 pr-4 text-right font-medium">Total</th>
              <th className="pb-2 pr-4 text-right font-medium">{metric.toUpperCase()}</th>
              <th className="pb-2 pr-4 text-right font-medium">Parse</th>
              <th className="pb-2 text-right font-medium">Run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player: rowPlayer, run, shape, specShapes }) => (
              <tr
                key={`${rowPlayer.id}-${run.run_id}`}
                className="border-b border-border/40 odd:bg-black/5 even:bg-black/20 hover:bg-accent/20 last:border-0"
              >
                <td className="py-2 pr-4 whitespace-nowrap">{new Date(run.started_at).toLocaleDateString()}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  <PerformancePointShape
                    shape={shape}
                    borderColor={rowPlayer.color}
                    fillColor={rowPlayer.color}
                    className="mr-2 size-2"
                  />
                  <PlayerNameWithShapes
                    name={rowPlayer.name}
                    color={rowPlayer.color}
                    specShapes={specShapes}
                    className="font-medium"
                    textColor={getClassColorVar(rowPlayer.className)}
                  />
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    {run.player_spec && run.player_spec !== "Unknown" && (
                      <img
                        src={specializationIconUrl(rowPlayer.className, run.player_spec)}
                        alt=""
                        className="size-5 shrink-0 rounded-sm object-cover"
                        onError={(event) => { event.currentTarget.hidden = true; }}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium">{run.player_spec || "Unknown"}</div>
                      {run.player_sub_spec && run.player_sub_spec !== run.player_spec && <div className="truncate text-xs text-muted-foreground">{run.player_sub_spec}</div>}
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums">{formatDuration(run.duration_secs)}</td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums">{formatCompact(metric === "hps" ? run.healing_done + run.absorbed_done : run.damage_done)}</td>
                <td className="py-2 pr-4 text-right font-mono font-semibold tabular-nums">{Math.round(metric === "hps" ? run.hps : run.dps).toLocaleString()}</td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums" style={{ color: run.average_parse == null ? undefined : parseColor(run.average_parse) }}>
                  {run.average_parse == null ? "—" : Math.round(run.average_parse)}
                </td>
                <td className="py-1 text-right">
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
      </div>

      {rows.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">No runs to summarize.</div>}

      <Dialog open={selectedRow !== null} onOpenChange={(open) => { if (!open) setSelectedRow(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Open raid log?</DialogTitle>
            <DialogDescription>
              Do you want to go to the log?
            </DialogDescription>
          </DialogHeader>
          {selectedRow && (
            <div className="rounded-md border border-border/70 bg-black/10 px-3 py-2 text-sm">
              <div className="font-medium" style={{ color: getClassColorVar(selectedRow.player.className) }}>
                {selectedRow.player.name}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {new Date(selectedRow.run.started_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSelectedRow(null)}>
              Cancel
            </Button>
            {selectedRow && (
              <Button asChild>
                <Link to={`/instances/${selectedRow.run.log_hashed_slug}`}>
                  Go to log
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlayerShapesTooltip({
  color,
  specShapes,
  children,
}: {
  color: string;
  specShapes: Record<string, PerformancePointShape>;
  children: ReactNode;
}) {
  const shapes = Object.entries(specShapes);
  if (shapes.length <= 1) return children;

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        hideArrow
        className="space-y-1.5 border border-white/10 bg-zinc-950 text-zinc-100 shadow-xl shadow-black/50"
      >
        <div className="font-semibold">Spec shapes</div>
        {shapes.map(([spec, shape]) => (
          <div key={spec} className="flex items-center gap-2">
            <PerformancePointShape
              shape={shape}
              borderColor={color}
              fillColor={color}
              className="size-2.5 shadow-none"
            />
            <span>{spec}</span>
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

function PlayerNameWithShapes({
  name,
  color,
  specShapes,
  className,
  textColor = color,
}: {
  name: string;
  color: string;
  specShapes: Record<string, PerformancePointShape>;
  className?: string;
  textColor?: string;
}) {
  return (
    <PlayerShapesTooltip color={color} specShapes={specShapes}>
      <span className={cn(className, Object.keys(specShapes).length > 1 && "cursor-help")} style={{ color: textColor }}>
        {name}
      </span>
    </PlayerShapesTooltip>
  );
}

function PerformancePointShape({
  shape,
  borderColor,
  fillColor,
  active = false,
  className,
}: {
  shape: PerformancePointShape;
  borderColor: string;
  fillColor: string;
  active?: boolean;
  className?: string;
}) {
  const clipPath = performancePointClipPath(shape);
  return (
    <span
      className={cn(
        "relative inline-block size-2.5 shrink-0 shadow-[0_2px_7px_rgba(0,0,0,0.55)] transition-transform duration-150",
        active && "scale-150",
        className,
      )}
      style={{ backgroundColor: borderColor, clipPath }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-px"
        style={{ backgroundColor: fillColor, clipPath }}
      />
    </span>
  );
}

function performancePointClipPath(shape: PerformancePointShape) {
  switch (shape) {
    case "diamond":
      return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    case "square":
      return "inset(0 round 1px)";
    case "triangle":
      return "polygon(50% 0%, 100% 100%, 0% 100%)";
    case "hexagon":
      return "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
    case "circle":
      return "circle(50%)";
  }
}

function SpecOptionCard({
  active,
  label,
  description,
  icon,
  shape,
  shapeColor,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  icon: ReactNode;
  shape?: PerformancePointShape;
  shapeColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group relative flex min-h-16 items-center gap-3 rounded-lg border p-3 text-left transition-all",
        active
          ? "border-sky-400/70 bg-sky-400/10 text-foreground shadow-[0_0_0_1px_rgba(56,189,248,0.12)]"
          : "border-border/80 bg-background/40 text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md border transition-colors",
          active
            ? "border-sky-400/30 bg-sky-400/15 text-sky-200"
            : "border-border/70 bg-black/20 text-muted-foreground group-hover:text-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 pr-6">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{label}</span>
          {shape && shapeColor && (
            <PerformancePointShape
              shape={shape}
              borderColor={shapeColor}
              fillColor={shapeColor}
              className="size-3"
            />
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{description}</span>
      </span>
      <span
        className={cn(
          "absolute right-3 top-3 flex size-4 items-center justify-center rounded-full border transition-opacity",
          active ? "border-sky-300 bg-sky-400 text-slate-950 opacity-100" : "border-border opacity-0 group-hover:opacity-50",
        )}
      >
        {active && <Check className="size-3" strokeWidth={3} />}
      </span>
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

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
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

