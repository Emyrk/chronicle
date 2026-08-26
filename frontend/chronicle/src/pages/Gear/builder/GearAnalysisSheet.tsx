import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Scale,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSiteConfig } from "@/api/queries";
import { useMyStatWeights } from "@/api/gearBuilderQueries";
import type { GearStatWeight } from "@/api/typesGenerated";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { presetsForFlavor, type WeightPreset } from "../weights/presets";
import {
  formatScore,
  parseWeights,
  STAT_GROUPS,
  STAT_KEYS,
  type StatTarget,
  type StatWeights,
  type TargetEvaluation,
} from "./gearScoring";
import { findProfileToHydrate } from "./analysisProfileSelection";
import { readProfileTargets } from "./analysisProfileStorage";

export interface AnalysisProfile {
  id: string;
  name: string;
  description: string;
  weights: StatWeights;
  targets: StatTarget[];
  mine: boolean;
  preset?: boolean;
}

interface GearAnalysisSheetProps {
  classId: number;
  profileId: string | null;
  selection: AnalysisProfile | null;
  onSelect: (selection: AnalysisProfile | null) => void;
  totalScore?: number;
  statTotals?: StatWeights;
  targetEvaluations?: TargetEvaluation[];
  triggerVariant?: "edge" | "header";
}

function mineToProfile(profile: GearStatWeight): AnalysisProfile {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    weights: parseWeights(profile.weights),
    targets: readProfileTargets(profile.id),
    mine: true,
  };
}

function presetToProfile(preset: WeightPreset): AnalysisProfile {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    weights: preset.weights,
    targets: [],
    mine: false,
    preset: true,
  };
}

const STAT_LABELS = new Map(STAT_KEYS.map((stat) => [stat.key, stat.label]));

export function GearAnalysisSheet({
  classId,
  profileId,
  selection,
  onSelect,
  totalScore,
  statTotals,
  targetEvaluations,
  triggerVariant = "edge",
}: GearAnalysisSheetProps) {
  const { isAuthenticated } = useAuth();
  const { data: siteConfig } = useSiteConfig();
  const myProfiles = useMyStatWeights(isAuthenticated);
  const availableOptions = useMemo(() => {
    const presets = siteConfig
      ? presetsForFlavor(siteConfig.dataset_flavor ?? [])
          .filter((profile) => profile.classId === classId)
          .map(presetToProfile)
      : [];
    const mine = (myProfiles.data ?? [])
      .filter((profile) => !profile.class_id || profile.class_id === classId)
      .map(mineToProfile);
    return [...presets, ...mine];
  }, [classId, myProfiles.data, siteConfig]);
  const options = useMemo(
    () =>
      selection && !availableOptions.some((option) => option.id === selection.id)
        ? [...availableOptions, selection]
        : availableOptions,
    [availableOptions, selection],
  );

  const lastHydratedProfileId = useRef<string | null>(null);
  useEffect(() => {
    if (!profileId) {
      lastHydratedProfileId.current = null;
      return;
    }

    // Hydrate a saved/URL profile only when that external ID changes. During a
    // picker interaction the local selection updates one render before the URL
    // and saved payload, so re-applying the previous ID here would undo the click.
    const profile = findProfileToHydrate(
      profileId,
      lastHydratedProfileId.current,
      options,
    );
    if (!profile) return;
    lastHydratedProfileId.current = profileId;
    if (selection?.id !== profile.id) onSelect(profile);
  }, [onSelect, options, profileId, selection]);

  const warnings = targetEvaluations?.filter((target) => !target.met) ?? [];

  return (
    <Sheet>
      <SheetTrigger asChild>
        {triggerVariant === "header" ? (
          <button
            type="button"
            aria-label="Open gear analysis drawer"
            title={selection ? `Gear analysis: ${selection.name}` : "Open gear analysis"}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/45 px-3 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-800/70 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                selection ? "bg-blue-400" : "bg-zinc-600",
              )}
              aria-hidden
            />
            <span className="max-w-32 truncate">
              {selection?.name ?? "Stat weights"}
            </span>
            {warnings.length > 0 && (
              <span className="min-w-4 rounded-full bg-amber-500/15 px-1 text-center text-2xs text-amber-300">
                {warnings.length}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            aria-label="Open gear analysis drawer"
            title={selection ? `Gear analysis: ${selection.name}` : "Open gear analysis"}
            className="group fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1.5 rounded-l-md border border-r-0 border-zinc-700 bg-zinc-900/95 py-2 pl-2 pr-1.5 text-xs text-zinc-300 shadow-lg shadow-black/30 backdrop-blur transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-zinc-500 transition-transform group-hover:-translate-x-0.5 group-hover:text-blue-400" />
            <Scale className="h-4 w-4 text-blue-400" />
            <span className="hidden sm:inline">Gear analysis</span>
            {selection && (
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden />
            )}
            {warnings.length > 0 && (
              <span className="min-w-4 rounded-full bg-amber-500/15 px-1 text-center text-2xs text-amber-300">
                {warnings.length}
              </span>
            )}
          </button>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-zinc-800 bg-zinc-950 sm:max-w-md styled-scrollbar"
      >
        <SheetHeader className="border-b border-zinc-800">
          <SheetTitle className="flex items-center gap-2 text-zinc-100">
            <Scale className="h-4 w-4 text-blue-400" /> Gear Analysis
          </SheetTitle>
          <SheetDescription>
            Optional scoring and raw-stat targets for the displayed progression
            set. Targets warn, but never alter scores.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <section className="space-y-2">
            <div className="text-2xs uppercase tracking-wide text-zinc-500">
              Stat weights
            </div>
            <select
              value={selection?.id ?? ""}
              onChange={(event) =>
                onSelect(
                  options.find((option) => option.id === event.target.value) ??
                    null,
                )
              }
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-200"
            >
              <option value="">None</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.preset ? " · preset" : ""}
                </option>
              ))}
            </select>
            {selection?.description && (
              <p className="text-xs leading-relaxed text-zinc-500">
                {selection.description}
              </p>
            )}
            <Link
              to="/gear/weights"
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Manage profiles
            </Link>
          </section>

          {!selection ? (
            <div className="rounded-md border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
              Pick a profile to score items and check its targets. The gear
              builder works without one.
            </div>
          ) : (
            <>
              <section className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Stage score</span>
                  <span className="font-mono text-lg text-zinc-100">
                    {totalScore == null ? "—" : formatScore(totalScore)}
                  </span>
                </div>
                <p className="mt-1 text-2xs text-zinc-600">
                  Item stats only. Enchants are not included yet.
                </p>
              </section>

              <section className="space-y-2">
                <div className="text-2xs uppercase tracking-wide text-zinc-500">
                  Targets and caps
                </div>
                {selection.targets.length === 0 ? (
                  <p className="rounded border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-600">
                    No targets configured.{" "}
                    {selection.preset
                      ? "Copy this preset to add targets."
                      : "Add targets in Manage profiles."}
                  </p>
                ) : !targetEvaluations ? (
                  <p className="text-xs text-zinc-600">Loading stage stats…</p>
                ) : (
                  <div className="space-y-1.5">
                    {targetEvaluations.map((target) => (
                      <div
                        key={`${target.stat}-${target.type}`}
                        className={cn(
                          "flex items-center gap-2 rounded border px-2.5 py-2",
                          target.met
                            ? "border-emerald-900/60 bg-emerald-950/20"
                            : "border-amber-800/60 bg-amber-950/20",
                        )}
                      >
                        {target.met ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        )}
                        <span className="min-w-0 flex-1 text-xs text-zinc-300">
                          {STAT_LABELS.get(target.stat) ?? target.stat}
                        </span>
                        <span className="font-mono text-xs text-zinc-200">
                          {formatScore(target.actual)} /{" "}
                          {formatScore(target.value)}
                        </span>
                        <span className="text-3xs uppercase text-zinc-600">
                          {target.type === "minimum" ? "min" : "max"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <div className="text-2xs uppercase tracking-wide text-zinc-500">
                  Stage stats
                </div>
                {!statTotals ? (
                  <p className="text-xs text-zinc-600">Loading stage stats…</p>
                ) : Object.keys(statTotals).length === 0 ? (
                  <p className="text-xs text-zinc-600">
                    No scored item stats in this stage.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(statTotals)
                      .sort(([a], [b]) =>
                        (STAT_LABELS.get(a) ?? a).localeCompare(
                          STAT_LABELS.get(b) ?? b,
                        ),
                      )
                      .map(([stat, value]) => (
                        <div
                          key={stat}
                          className="flex items-baseline justify-between gap-2 text-xs"
                        >
                          <span className="truncate text-zinc-500">
                            {STAT_LABELS.get(stat) ?? stat}
                          </span>
                          <span className="font-mono text-zinc-300">
                            {formatScore(value)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <div className="flex items-center gap-1 text-2xs uppercase tracking-wide text-zinc-500">
                  {selection.preset && <Sparkles className="h-3 w-3" />} Stat
                  weights
                </div>
                <div className="space-y-3">
                  {STAT_GROUPS.map((group) => {
                    const entries = STAT_KEYS.filter(
                      (stat) =>
                        stat.group === group && selection.weights[stat.key],
                    );
                    if (entries.length === 0) return null;
                    return (
                      <div key={group}>
                        <div className="mb-1 text-3xs uppercase tracking-wide text-zinc-600">
                          {group}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          {entries.map((stat) => (
                            <div
                              key={stat.key}
                              className="flex items-baseline justify-between gap-2 text-xs"
                            >
                              <span className="truncate text-zinc-500">
                                {stat.label}
                              </span>
                              <span className="font-mono text-zinc-300">
                                {selection.weights[stat.key]}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
