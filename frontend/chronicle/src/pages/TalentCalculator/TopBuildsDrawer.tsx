import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Percent, Trophy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRankingsEncounters, useRankingsInstances, useRankingsLeaderboard } from "@/api/rankingsQueries";
import type { RankingsEntry } from "@/api/typesGenerated";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  TALENT_BUILD_PARAM,
  type TalentPopularitySelection,
  buildPointsSummary,
  rankingsLayoutToBuild,
} from "@/components/ui/TalentTreeViewer/talentLogic";
import { SPEC_BY_CLASS } from "@/pages/Rankings/classDisplay";
import type { TalentClassInfo } from "./MyBuildsDrawer";

/** "Death Knight" → "DEATHKNIGHT" (the SDK hero-class form the API expects). */
function toApiClass(name: string): string {
  return name.replace(/\s+/g, "").toUpperCase();
}

/** Healing specs default to the HPS ranking; everything else to DPS. */
const HEALER_SPECS: Record<string, readonly string[]> = {
  PRIEST: ["Discipline", "Holy"],
  PALADIN: ["Holy"],
  DRUID: ["Restoration"],
  SHAMAN: ["Restoration"],
};

function defaultMetricForSpec(apiClass: string, spec: string): "dps" | "hps" {
  return HEALER_SPECS[apiClass]?.includes(spec) ? "hps" : "dps";
}

function formatDPS(dps: number): string {
  return dps >= 1000 ? `${(dps / 1000).toFixed(1)}k` : Math.round(dps).toString();
}

export function TopBuildsDrawer({ selectedClass, onShowAll }: {
  selectedClass?: TalentClassInfo;
  /** Called with the selected ranking cohort to show the popularity overlay. */
  onShowAll?: (selection: TalentPopularitySelection) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [instanceName, setInstanceName] = useState<string | null>(null);

  const apiClass = selectedClass ? toApiClass(selectedClass.name) : "";
  const specs = SPEC_BY_CLASS[apiClass] ?? [];
  const [specIdx, setSpecIdx] = useState(0);
  const spec = specs[Math.min(specIdx, specs.length - 1)] ?? "";

  // Each spec has a hard-coded preferred ranking metric (healers → HPS);
  // metricOverride holds a manual toggle away from it and resets on spec change.
  const [metricOverride, setMetricOverride] = useState<"dps" | "hps" | null>(null);
  const metric = metricOverride ?? defaultMetricForSpec(apiClass, spec);
  function selectSpec(index: number) {
    setSpecIdx(index);
    setMetricOverride(null);
  }

  const instancesQuery = useRankingsInstances(open);
  // Unique instance names, in API order. Default to the first raid.
  const instanceNames = useMemo(() => {
    const names: string[] = [];
    for (const instance of instancesQuery.data ?? []) {
      if (!names.includes(instance.instance_name)) names.push(instance.instance_name);
    }
    return names;
  }, [instancesQuery.data]);
  const activeInstance = instanceName ?? instanceNames[0] ?? "";

  // Bosses only: 'Trash' is the conventional trash encounter name. The
  // leaderboard API only supports inclusion lists, so pass every boss name.
  const encountersQuery = useRankingsEncounters(open ? activeInstance : "");
  const bossNames = useMemo(
    () => (encountersQuery.data ?? []).map((e) => e.encounter_name).filter((name) => name !== "Trash"),
    [encountersQuery.data],
  );

  const leaderboardQuery = useRankingsLeaderboard(
    {
      instance_names: activeInstance,
      encounter_names: bossNames.join(","),
      class: apiClass,
      spec,
      hide_unknowns: true,
      metric,
      limit: 10,
    },
    open && Boolean(activeInstance && apiClass && spec) && bossNames.length > 0,
  );

  function showAll() {
    const builds = (leaderboardQuery.data?.entries ?? [])
      .map((entry) => rankingsLayoutToBuild(entry.talent_layout))
      .filter(Boolean);
    if (builds.length === 0 || !onShowAll) return;
    onShowAll({ instance: activeInstance, spec, metric });
    setOpen(false);
    toast.success(`Showing talent popularity across ${builds.length} top ${spec} builds`, {
      description: "Use \"Hide popularity\" in the toolbar to dismiss it.",
    });
  }

  function loadBuild(entry: RankingsEntry) {
    const build = rankingsLayoutToBuild(entry.talent_layout);
    if (!build) return;
    const next = new URLSearchParams(searchParams);
    next.set(TALENT_BUILD_PARAM, build);
    setSearchParams(next, { replace: true });
    setOpen(false);
    toast.success(`Loaded ${entry.player_name}'s build`, {
      description: `${spec} · ${buildPointsSummary(build)} · ${activeInstance}`,
    });
  }

  if (!selectedClass) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/40 bg-amber-400/10 px-2.5 py-1 text-sm font-bold text-amber-100 transition hover:border-amber-200/70 hover:bg-amber-400/20"
        >
          <Trophy className="h-3.5 w-3.5" />
          Top Builds
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
              src={`/c/icons/class_${selectedClass.slug}.png`}
              alt=""
              className="h-9 w-9 shrink-0 rounded"
              onError={(e) => { (e.target as HTMLImageElement).src = "/c/icons/class_unknown.png"; }}
            />
            <div className="min-w-0">
              <SheetTitle>Top {selectedClass.name} builds</SheetTitle>
              <SheetDescription>What the top-ranked players are using</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Instance + spec selectors */}
        <div className="space-y-3 border-b border-white/10 p-4">
          <div className="flex gap-2">
            <select
              value={activeInstance}
              onChange={(event) => setInstanceName(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/60 focus:outline-none"
            >
              {instanceNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <button
              type="button"
              title={`Ranked by ${metric.toUpperCase()} — click to rank by ${metric === "dps" ? "HPS" : "DPS"}`}
              className={cn(
                "shrink-0 rounded-md border px-3 py-2 text-sm font-bold uppercase transition",
                metric === "hps"
                  ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25"
                  : "border-red-300/50 bg-red-400/10 text-red-100 hover:bg-red-400/20",
              )}
              onClick={() => setMetricOverride(metric === "dps" ? "hps" : "dps")}
            >
              {metric}
            </button>
          </div>
          <div className="flex gap-1">
            {specs.map((name, index) => (
              <button
                key={name}
                type="button"
                onClick={() => selectSpec(index)}
                className={cn(
                  "flex-1 truncate rounded-md border px-2 py-1.5 text-xs font-bold transition",
                  name === spec
                    ? "border-amber-300/60 bg-amber-400/15 text-amber-100"
                    : "border-zinc-700/60 bg-zinc-900/40 text-zinc-400 hover:border-zinc-500 hover:text-white",
                )}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Top 10 list */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {leaderboardQuery.isLoading || instancesQuery.isLoading || encountersQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading rankings…</p>
          ) : leaderboardQuery.isError || encountersQuery.isError ? (
            <p className="text-sm text-zinc-500">Unable to load rankings.</p>
          ) : (leaderboardQuery.data?.entries.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">
              No ranked {spec} {selectedClass.name}s for {activeInstance} yet.
            </p>
          ) : (
            <>
            {onShowAll && (
              <button
                type="button"
                onClick={showAll}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed border-amber-300/40 bg-amber-400/5 p-3 text-left transition hover:border-amber-200/70 hover:bg-amber-400/10"
              >
                <Percent className="h-5 w-5 shrink-0 text-amber-300" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-amber-100">Show all</span>
                  <span className="block truncate text-xs text-zinc-400">
                    Overlay talent popularity across these builds
                  </span>
                </span>
              </button>
            )}
            {leaderboardQuery.data?.entries.map((entry, index) => {
              const build = rankingsLayoutToBuild(entry.talent_layout);
              return (
                <div
                  key={`${entry.player_guid}-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
                >
                  <span className={cn(
                    "w-6 shrink-0 text-center text-sm font-bold tabular-nums",
                    index === 0 ? "text-amber-300" : index < 3 ? "text-amber-100/80" : "text-zinc-500",
                  )}>
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">
                      {entry.player_name}
                      {entry.sub_spec && <span className="ml-1.5 font-medium text-zinc-400">{entry.sub_spec}</span>}
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {formatDPS(metric === "hps" ? entry.hps : entry.dps)} {metric.toUpperCase()}
                      {build && <> · {buildPointsSummary(build)}</>}
                      {entry.guild_name && <> · {entry.guild_name}</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!build}
                    title={build ? `Load ${entry.player_name}'s build into the calculator` : "No talent build detected for this ranking"}
                    className="shrink-0 rounded-md border border-amber-300/60 bg-amber-400/15 px-2 py-1 text-xs font-bold text-amber-100 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-transparent disabled:text-zinc-600"
                    onClick={() => loadBuild(entry)}
                  >
                    Load
                  </button>
                </div>
              );
            })}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
