import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChartNoAxesCombined, Check, CheckCircle, CircleQuestionMark, Database, ExternalLink, Eye, EyeOff, HeartPulse, Keyboard, Layers3, List, Map, MousePointerClick, Percent, Plus, Search, Settings2, Star, Swords, Trash2 } from "lucide-react";
import type { ArmoryPlayer, ArmorySearchResult, CharacterPerformanceRun, FavoritePlayer } from "@/api/typesGenerated";
import {
  useArmorySearch,
  useMyFavorites,
  useSupportedInstanceProgressionBosses,
  useSupportedInstanceRankingEncounterSets,
} from "@/api/queries";
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
import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import { getClassIconUrl } from "../characterDisplay";
import { getClassColorVar } from "../types";
import type { ParseMetric } from "./util";
import {
  performancePlayerKey,
  type PerformanceComparisonState,
  type PerformanceDisplayMode,
  type PerformancePlayerSelection,
} from "./performanceComparisonState";
import {
  assignChartCollisionOffsets,
  assignPerformanceSeriesColors,
  assignSpecPointShapes,
  buildPerformanceVariants,
  calculatePerformanceWaterlineMarkers,
  filterPerformanceRunSeries,
  formatDeathsAlive,
  performanceEncounterSections,
  performanceParseColor,
  performanceTrendValue,
  performanceValue,
  selectPerformanceEncounterNames,
  summarizePerformanceRuns,
  type PerformanceDateRange,
  type PerformancePointShape,
} from "./performanceExplorerModel";
import { PerformanceSummaryPanel, SummaryViewToggle, type SummaryView } from "./PerformanceSummary";
import { GearPanel } from "./GearTimeline";
import { NumbersExplainer } from "./NumbersExplainer";

type DisplayMode = PerformanceDisplayMode;

type PlayerDialog = "add" | string | null;

type DetailTab = "runs" | "numbers" | "gear";

const DETAIL_TABS: readonly { value: DetailTab; label: string }[] = [
  { value: "runs", label: "Run summary" },
  { value: "numbers", label: "How the numbers work" },
  { value: "gear", label: "Gear" },
];

const DATE_RANGE_DAYS: Record<PerformanceDateRange, number> = { "180d": 180, "60d": 60, "30d": 30 };

interface SelectedPerformancePlayer {
  id: string;
  name: string;
  className: string;
  realmName: string;
  realmID: string;
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
const TREND_COLOR = "#34d399";

export function PerformanceExplorer({ players, state, onStateChange }: PerformanceExplorerProps) {
  const primaryPlayer = players[0];
  const encountersQuery = useCharacterEncounters(primaryPlayer.id, primaryPlayer.realm_id);
  const progressionBossesQuery = useSupportedInstanceProgressionBosses();
  const rankingEncounterSetsQuery = useSupportedInstanceRankingEncounterSets();
  const variants = useMemo(
    () => buildPerformanceVariants(encountersQuery.data?.encounters ?? []),
    [encountersQuery.data],
  );
  const [playerDialog, setPlayerDialog] = useState<PlayerDialog>(null);
  const [mobileEncounterOpen, setMobileEncounterOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [summaryView, setSummaryView] = useState<SummaryView>("numbers");
  const [detailTab, setDetailTab] = useState<DetailTab>("runs");
  // Hovering a night in the run chart or the gear timeline highlights it in the other.
  const [linkedHoverTime, setLinkedHoverTime] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 250);
  const playerSearch = useArmorySearch({ q: debouncedSearch });
  const { isAuthenticated } = useAuth();
  const favorites = useMyFavorites({ enabled: isAuthenticated });
  const selectedPlayerProfiles = state.players.flatMap((selection) => {
    const profile = players.find((player) => (
      player.id === selection.id
      && player.realm_name.localeCompare(selection.realmName, undefined, { sensitivity: "accent" }) === 0
    ));
    return profile ? [{ selection, profile }] : [];
  });
  const seriesColors = assignPerformanceSeriesColors(selectedPlayerProfiles.map(({ profile }) => profile.class));
  const selectedPlayers: SelectedPerformancePlayer[] = selectedPlayerProfiles.map(({ selection, profile }, index) => ({
    id: profile.id,
    name: profile.name,
    className: profile.class,
    realmName: profile.realm_name,
    realmID: profile.realm_id,
    spec: selection.spec,
    subSpec: selection.subSpec,
    hidden: selection.hidden,
    color: seriesColors[index],
  }));
  const showPlayerRealms = new Set(selectedPlayers.map((player) => player.realmName)).size > 1;
  const variant = variants.find((item) => (
    item.instanceName === state.instanceName
    && item.difficultyName === state.difficultyName
    && item.maxPlayers === state.maxPlayers
  )) ?? variants[0];
  const encounterSections = progressionBossesQuery.isLoading
    ? []
    : performanceEncounterSections(variant, progressionBossesQuery.data);
  const encounterDefaultsLoading = progressionBossesQuery.isLoading || rankingEncounterSetsQuery.isLoading;
  const effectiveEncounters = state.encounters.length === 0 && encounterDefaultsLoading
    ? []
    : selectPerformanceEncounterNames(
      variant,
      state.encounters,
      progressionBossesQuery.data,
      rankingEncounterSetsQuery.data,
    );
  const { metric, display, dateRange } = state;
  const performanceQueries = useCharacterPerformances(selectedPlayers.map((selectedPlayer) => ({
    playerGuid: selectedPlayer.id,
    realmID: selectedPlayer.realmID,
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
  const isSelected = (player: Pick<ArmorySearchResult, "id" | "realm_name">) => selectedPlayers.some((item) => (
    performancePlayerKey(item) === performancePlayerKey({ id: player.id, realmName: player.realm_name })
  ));
  const savedPlayers = (favorites.data?.players ?? []).filter((player) => !isSelected(player));
  const searchResults = (playerSearch.data?.players ?? [])
    .filter((result) => !isSelected(result))
    .slice(0, 12);
  const playerLabel = (player: SelectedPerformancePlayer) => (
    showPlayerRealms ? `${player.name} · ${player.realmName}` : player.name
  );
  const configuredSeries = playerDialog && playerDialog !== "add"
    ? series.find((item) => performancePlayerKey(item.player) === playerDialog)
    : undefined;
  const visibleSeries = series.filter((item) => !item.player.hidden);
  const performanceLoading = selectedPlayers.some((player, index) => !player.hidden && performanceQueries[index]?.isLoading);
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

  const updatePlayerFilter = (player: PerformancePlayerSelection, spec: string | null, subSpec: string | null = null) => {
    const key = performancePlayerKey(player);
    onStateChange({
      ...state,
      players: state.players.map((item) => performancePlayerKey(item) === key ? { ...item, spec, subSpec } : item),
    });
  };

  const togglePlayerVisibility = (player: PerformancePlayerSelection) => {
    const key = performancePlayerKey(player);
    onStateChange({
      ...state,
      players: state.players.map((item) => performancePlayerKey(item) === key ? { ...item, hidden: !item.hidden } : item),
    });
  };

  const addPlayer = (result: Pick<ArmorySearchResult, "id" | "realm_name">) => {
    const selection = { id: result.id, realmName: result.realm_name, spec: null, subSpec: null, hidden: false };
    const key = performancePlayerKey(selection);
    if (state.players.length >= MAX_COMPARISON_PLAYERS || state.players.some((item) => performancePlayerKey(item) === key)) return;
    onStateChange({
      ...state,
      players: [...state.players, selection],
    });
    setSearchQuery("");
    setPlayerDialog(key);
  };

  const removePlayer = (player: PerformancePlayerSelection) => {
    const key = performancePlayerKey(player);
    onStateChange({ ...state, players: state.players.filter((item) => performancePlayerKey(item) !== key) });
    setPlayerDialog(null);
  };

  return (
    <Card className="overflow-hidden border-border/80 bg-gradient-to-b from-card to-card/70 py-3 sm:py-4">
      <CardContent className="space-y-4 px-3 sm:px-5">
        {variants.length === 0 ? (
          <EmptyState loading={encountersQuery.isLoading} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 pb-3">
              <h1 className="flex shrink-0 items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
                <ChartNoAxesCombined className="h-4 w-4 text-sky-400" />
                Player Analysis
              </h1>
              <label className="relative min-w-0 basis-full sm:max-w-md sm:flex-1 sm:basis-auto">
                <span className="sr-only">Instance</span>
                <Map className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sky-400" />
                <select
                  value={variant?.key ?? ""}
                  onChange={(event) => selectVariant(event.target.value)}
                  className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm text-foreground outline-none focus:border-sky-500/70"
                >
                  {variants.map((item) => (
                    <option key={item.key} value={item.key}>
                      {variantLabel(item.instanceName, item.difficultyName, item.maxPlayers)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/20 p-1 sm:flex-none">
                  <button
                    type="button"
                    onClick={() => onStateChange({ ...state, metric: "dps" })}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md px-3 py-0.5 text-xs font-medium transition-all",
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
                      "flex items-center justify-center gap-1.5 rounded-md px-3 py-0.5 text-xs font-medium transition-all",
                      metric === "hps"
                        ? "bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)] ring-1 ring-inset ring-emerald-400/50"
                        : "text-muted-foreground hover:text-emerald-300",
                    )}
                  >
                    <HeartPulse className="h-3.5 w-3.5" />
                    HPS
                  </button>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/20 p-1 sm:flex-none">
                  <button
                    type="button"
                    onClick={() => onStateChange({ ...state, display: "raw" })}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md px-3 py-0.5 text-xs font-medium transition-colors",
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
                      "flex items-center justify-center gap-1.5 rounded-md px-3 py-0.5 text-xs font-medium transition-colors",
                      display === "parse"
                        ? "bg-white/15 text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Percent className="h-3.5 w-3.5" />
                    Parse
                  </button>
                </div>
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
            </div>

            <div className="flex flex-col lg:flex-row">
              <aside className="hidden shrink-0 lg:block lg:w-64 lg:border-r lg:border-border/60 lg:pr-5">
                <EncounterSelectorControls
                  encounterSections={encounterSections}
                  dateRange={dateRange}
                  effectiveEncounters={effectiveEncounters}
                  onDateRangeChange={(nextDateRange) => onStateChange({ ...state, dateRange: nextDateRange })}
                  onSelectAll={() => onStateChange({ ...state, encounters: variant?.encounters ?? [] })}
                  onSelectEncounter={selectEncounter}
                />
              </aside>

              <div className="min-w-0 flex-1 space-y-4 lg:pl-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
                    {series.map(({ player: selectedPlayer, specShapes }) => (
                      <PlayerShapesTooltip
                        key={performancePlayerKey(selectedPlayer)}
                        color={selectedPlayer.color}
                        specShapes={specShapes}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            if (event.shiftKey) togglePlayerVisibility(selectedPlayer);
                            else setPlayerDialog(performancePlayerKey(selectedPlayer));
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
                              {showPlayerRealms && ` · ${selectedPlayer.realmName}`}
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
                      className="h-8 min-w-0 px-3 text-xs"
                      disabled={selectedPlayers.length >= MAX_COMPARISON_PLAYERS}
                      onClick={() => setPlayerDialog("add")}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add player
                      <span className="text-[10px] text-muted-foreground/60">{selectedPlayers.length}/{MAX_COMPARISON_PLAYERS}</span>
                    </Button>
                  </div>
                  {!performanceLoading && <SummaryViewToggle view={summaryView} onChange={setSummaryView} className="shrink-0 self-end sm:self-start" />}
                </div>

                {!performanceLoading && (
                  <PerformanceSummaryPanel
                    players={visibleSeries.map(({ player: summaryPlayer, runs }) => ({
                      id: performancePlayerKey(summaryPlayer),
                      name: playerLabel(summaryPlayer),
                      className: summaryPlayer.className,
                      color: summaryPlayer.color,
                      runs,
                    }))}
                    metric={metric}
                    display={display}
                    view={summaryView}
                  />
                )}

                <PerformanceTrend
                  series={visibleSeries}
                  metric={metric}
                  display={display}
                  loading={performanceLoading}
                  omittedParseCount={omittedParseCount}
                  showPlayerRealms={showPlayerRealms}
                  linkedTime={linkedHoverTime}
                  onHoverTimeChange={setLinkedHoverTime}
                />

                <div className="space-y-3 border-t border-border/60 pt-4">
                  <div role="tablist" aria-label="Details" className="flex gap-5 border-b border-border/60">
                    {DETAIL_TABS.map((tab) => (
                      <button
                        key={tab.value}
                        type="button"
                        role="tab"
                        aria-selected={detailTab === tab.value}
                        onClick={() => setDetailTab(tab.value)}
                        className={cn(
                          "-mb-px border-b-2 pb-2 text-sm font-semibold transition-colors",
                          detailTab === tab.value
                            ? "border-[#5F8FA6] text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {detailTab === "gear" ? (
                    variant && (
                      <GearPanel
                        players={visibleSeries.map(({ player: gearPlayer }) => ({
                          key: performancePlayerKey(gearPlayer),
                          id: gearPlayer.id,
                          name: playerLabel(gearPlayer),
                          className: gearPlayer.className,
                          realmName: gearPlayer.realmName,
                        }))}
                        instanceName={variant.instanceName}
                        rangeDays={DATE_RANGE_DAYS[dateRange]}
                        hoverTime={linkedHoverTime}
                        onHoverTimeChange={setLinkedHoverTime}
                      />
                    )
                  ) : detailTab === "runs" ? (
                    <PerformanceTable
                      series={visibleSeries}
                      metric={metric}
                      display={display}
                      showPlayerRealms={showPlayerRealms}
                    />
                  ) : (
                    <NumbersExplainer
                      players={visibleSeries.map(({ player: explainedPlayer, runs }) => ({
                        id: performancePlayerKey(explainedPlayer),
                        name: playerLabel(explainedPlayer),
                        className: explainedPlayer.className,
                        color: explainedPlayer.color,
                        runs,
                      }))}
                      metric={metric}
                      display={display}
                    />
                  )}
                </div>
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
              encounterSections={encounterSections}
              dateRange={dateRange}
              effectiveEncounters={effectiveEncounters}
              onDateRangeChange={(nextDateRange) => onStateChange({ ...state, dateRange: nextDateRange })}
              onSelectAll={() => onStateChange({ ...state, encounters: variant?.encounters ?? [] })}
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
                  Compare up to five players across realms on the same encounters and date range.
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
                {debouncedSearch.length < 2 ? (
                  <>
                    <p className="-mt-1 text-[11px] text-muted-foreground/70">Type at least 2 characters to search.</p>
                    {savedPlayers.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                          Your saved characters
                        </div>
                        <div className="max-h-72 overflow-y-auto rounded-md border border-border styled-scrollbar">
                          {savedPlayers.map((player) => (
                            <PlayerPickRow key={performancePlayerKey({ id: player.id, realmName: player.realm_name })} player={player} onSelect={() => addPlayer(player)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-md border border-border styled-scrollbar">
                    {playerSearch.isLoading ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">Searching…</div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">No available players found.</div>
                    ) : (
                      searchResults.map((result) => (
                        <PlayerPickRow key={performancePlayerKey({ id: result.id, realmName: result.realm_name })} player={result} onSelect={() => addPlayer(result)} />
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          ) : configuredSeries ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: configuredSeries.player.color }} />
                  <PlayerNameWithShapes
                    name={`${configuredSeries.player.name}${showPlayerRealms ? ` · ${configuredSeries.player.realmName}` : ""}`}
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
                      onClick={() => updatePlayerFilter(configuredSeries.player, null)}
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
                        onClick={() => updatePlayerFilter(configuredSeries.player, option)}
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
                        onClick={() => updatePlayerFilter(configuredSeries.player, configuredSeries.player.spec)}
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
                          onClick={() => updatePlayerFilter(configuredSeries.player, configuredSeries.player.spec, option)}
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
                    onClick={() => togglePlayerVisibility(configuredSeries.player)}
                  >
                    {configuredSeries.player.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    {configuredSeries.player.hidden ? "Show player data" : "Hide player data"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => removePlayer(configuredSeries.player)}>
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
  encounterSections,
  dateRange,
  effectiveEncounters,
  onDateRangeChange,
  onSelectAll,
  onSelectEncounter,
}: {
  encounterSections: ReturnType<typeof performanceEncounterSections>;
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
        <div className="mt-3 space-y-4">
          {encounterSections.map((section) => (
            <div key={section.kind}>
              <h4 className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.label}
              </h4>
              <div className="space-y-1">
                {section.names.map((encounter) => {
                  const selected = effectiveEncounters.includes(encounter);
                  const optional = section.kind === "optional";
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
                        !selected && optional && "text-muted-foreground",
                      )}
                      title={`${encounter}. Click to select, Ctrl+Click to toggle`}
                    >
                      <CheckCircle className={cn("h-4 w-4 shrink-0 text-green-500", optional && "opacity-60")} />
                      <span className="min-w-0 flex-1 truncate">{encounter}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
  showPlayerRealms,
  linkedTime,
  onHoverTimeChange,
}: {
  series: readonly PerformanceSeries[];
  metric: ParseMetric;
  display: DisplayMode;
  loading: boolean;
  omittedParseCount: number;
  showPlayerRealms: boolean;
  /** A time hovered elsewhere (the gear timeline); its day is highlighted when the chart has runs then. */
  linkedTime: number | null;
  onHoverTimeChange: (time: number | null) => void;
}) {
  const [ownHoverDay, setOwnHoverDay] = useState<number | null>(null);
  const setHoverDay = (day: number | null) => {
    setOwnHoverDay(day);
    onHoverTimeChange(day);
  };
  const hoverDay = ownHoverDay ?? (linkedTime === null ? null : startOfLocalDay(linkedTime));

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading performance…</div>;

  const chartPoints = series.flatMap((item) => item.runs.map((run) => {
    const timestamp = new Date(run.started_at).getTime();
    return {
      id: `${performancePlayerKey(item.player)}-${run.run_id}`,
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
        color: "#38bdf8",
        opacity: 0.75,
      }
    : {
        key: marker.kind,
        label: "Best 3 avg",
        value: marker.value,
        dashArray: "2 4",
        color: "#f59e0b",
        opacity: 0.9,
      });
  // With one player, draw their trend line so improvement is visible next to Consistency.
  const trendSummary = series.length === 1 ? summarizePerformanceRuns(series[0].runs, metric, display) : null;
  const trendLine = trendSummary?.trend && minTime !== maxTime
    ? {
        start: performanceTrendValue(trendSummary.trend, minTime),
        end: performanceTrendValue(trendSummary.trend, maxTime),
        perWeek: trendSummary.trend.slope * 7,
      }
    : null;
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
    <div className="space-y-3">
      <div
        className="relative h-72 cursor-crosshair overflow-visible rounded-lg border border-border/70 bg-black/10"
        onPointerMove={updateHoverDay}
        onPointerLeave={() => setHoverDay(null)}
      >
        {(performanceMarkers.length > 0 || trendLine) && (
          <div className="pointer-events-none absolute top-1.5 right-2 z-10 flex flex-wrap justify-end gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {performanceMarkers.map((marker) => (
              <div key={marker.key} className="flex items-center gap-2">
                <span
                  className="w-6 border-t-2"
                  style={{
                    borderColor: marker.color,
                    borderTopStyle: marker.key === "average" ? "dashed" : "dotted",
                  }}
                  aria-hidden="true"
                />
                <span>{marker.label}</span>
                <span className="font-mono font-medium tabular-nums" style={{ color: marker.color }}>
                  {formatValue(marker.value)}
                </span>
              </div>
            ))}
            {trendLine && (
              <div className="flex items-center gap-2">
                <span className="w-6 border-t-2" style={{ borderColor: TREND_COLOR }} aria-hidden="true" />
                <span>Trend</span>
                <span className="font-mono font-medium tabular-nums" style={{ color: TREND_COLOR }}>
                  {trendLine.perWeek >= 0 ? "+" : "−"}{formatValue(Math.abs(trendLine.perWeek))}/wk
                </span>
              </div>
            )}
          </div>
        )}
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
          {trendLine && (
            <>
              <line
                x1={x(minTime)}
                x2={x(maxTime)}
                y1={y(trendLine.start)}
                y2={y(trendLine.end)}
                stroke={TREND_COLOR}
                strokeWidth="1.5"
                opacity="0.9"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
          {performanceMarkers.map((marker) => (
            <line
              key={marker.key}
              x1="4"
              x2="96"
              y1={y(marker.value)}
              y2={y(marker.value)}
              stroke={marker.color}
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
                key={performancePlayerKey(item.player)}
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
        {chartPoints.map(({ id, player: pointPlayer, run, value: rawValue, shape, day }) => {
          const pointX = x(day);
          const pointY = y(rawValue);
          const value = formatValue(rawValue);
          const valueLabel = display === "parse" ? "Parse" : metric.toUpperCase();
          const pointColor = display === "parse" ? performanceParseColor(rawValue) : pointPlayer.color;

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
                aria-label={`${pointPlayer.name}${showPlayerRealms ? `, ${pointPlayer.realmName}` : ""}, ${new Date(run.started_at).toLocaleDateString()}, ${value} ${valueLabel}`}
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
                    const valueColor = display === "parse" ? performanceParseColor(value) : pointPlayer.color;
                    const rawMetricValue = metric === "hps" ? run.hps : run.dps;
                    return (
                      <div key={`${performancePlayerKey(pointPlayer)}-${run.run_id}`} className="px-1.5 py-1">
                        <div className="flex items-center justify-between gap-5">
                          <span className="flex min-w-0 items-center gap-2 font-medium">
                            <PerformancePointShape
                              shape={shape}
                              borderColor={pointPlayer.color}
                              fillColor={valueColor}
                              className="size-2"
                            />
                            <span className="truncate" style={{ color: getClassColorVar(pointPlayer.className) }}>
                              {pointPlayer.name}{showPlayerRealms && ` · ${pointPlayer.realmName}`}
                            </span>
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
  showPlayerRealms,
}: {
  series: readonly PerformanceSeries[];
  metric: ParseMetric;
  display: DisplayMode;
  showPlayerRealms: boolean;
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
    <div className="space-y-2">

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
                key={`${performancePlayerKey(rowPlayer)}-${run.run_id}`}
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
                    name={`${rowPlayer.name}${showPlayerRealms ? ` · ${rowPlayer.realmName}` : ""}`}
                    color={rowPlayer.color}
                    specShapes={specShapes}
                    className="truncate font-medium"
                    textColor={getClassColorVar(rowPlayer.className)}
                  />
                </span>
                <span
                  className="font-mono font-semibold tabular-nums"
                  style={{ color: display === "parse" && value != null ? performanceParseColor(value) : undefined }}
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
              <th className="pb-2 pr-4 text-right font-medium">Deaths/Alive%</th>
              <th className="pb-2 pr-4 text-right font-medium">Total</th>
              <th className="pb-2 pr-4 text-right font-medium">{metric.toUpperCase()}</th>
              <th className="pb-2 pr-4 text-right font-medium">Parse</th>
              <th className="pb-2 text-right font-medium">Run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player: rowPlayer, run, shape, specShapes }) => (
              <tr
                key={`${performancePlayerKey(rowPlayer)}-${run.run_id}`}
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
                    name={`${rowPlayer.name}${showPlayerRealms ? ` · ${rowPlayer.realmName}` : ""}`}
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
                <td className="py-2 pr-4 text-right font-mono tabular-nums">{formatDeathsAlive(run)}</td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums">{formatCompact(metric === "hps" ? run.healing_done + run.absorbed_done : run.damage_done)}</td>
                <td className="py-2 pr-4 text-right font-mono font-semibold tabular-nums">{Math.round(metric === "hps" ? run.hps : run.dps).toLocaleString()}</td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums" style={{ color: run.average_parse == null ? undefined : performanceParseColor(run.average_parse) }}>
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
                {selectedRow.player.name}{showPlayerRealms && ` · ${selectedRow.player.realmName}`}
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

function PlayerPickRow({ player, onSelect }: { player: ArmorySearchResult | FavoritePlayer; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-accent/50"
    >
      <span>
        <span className="font-medium" style={{ color: getClassColorVar(player.class) }}>{player.name}</span>
        <span className="ml-2 text-xs text-muted-foreground">{player.class}</span>
      </span>
      <span className="text-xs text-muted-foreground">
        {player.guild_name ? `<${player.guild_name}> · ` : ""}{player.realm_name}
      </span>
    </button>
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

