import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Sparkles, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSiteConfig } from "@/api/queries";
import { useMyStatWeights } from "@/api/gearBuilderQueries";
import { presetsForFlavor, type WeightPreset } from "../weights/presets";
import type { GearStatWeight } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { parseWeights, unknownWeightKeys, type StatWeights } from "./gearScoring";

export interface WeightSelection {
  id: string;
  name: string;
  weights: StatWeights;
  /** True when the set belongs to the current user (editable). */
  mine: boolean;
  /** True for baked-in presets (shown with a sparkle). */
  preset?: boolean;
}

interface StatWeightsPanelProps {
  classId: number;
  selection: WeightSelection | null;
  onSelect: (selection: WeightSelection | null) => void;
}

function mineToSelection(sw: GearStatWeight): WeightSelection {
  return { id: sw.id, name: sw.name, weights: parseWeights(sw.weights), mine: true };
}

function presetToSelection(preset: WeightPreset): WeightSelection {
  return { id: preset.id, name: preset.name, weights: preset.weights, mine: false, preset: true };
}

/**
 * Stat-weight set picker for the builder: built-in presets first, then
 * the user's own sets; editing and creation live on the Stat Weights tab.
 */
export function StatWeightsPanel({ classId, selection, onSelect }: StatWeightsPanelProps) {
  const { isAuthenticated } = useAuth();
  const { data: siteConfig } = useSiteConfig();
  const myWeights = useMyStatWeights(isAuthenticated);

  const options = useMemo(() => {
    // Wait for site-config so a wrath tenant never flashes vanilla presets.
    const presets = siteConfig
      ? presetsForFlavor(siteConfig.dataset_flavor ?? [])
          .filter((p) => p.classId === classId)
          .map(presetToSelection)
      : [];
    const mine = (myWeights.data ?? [])
      .filter((w) => !w.class_id || w.class_id === classId)
      .map(mineToSelection);
    return [...presets, ...mine];
  }, [myWeights.data, classId, siteConfig?.dataset_flavor]);

  const unknown = selection ? unknownWeightKeys(selection.weights) : [];

  return (
    <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-2xs uppercase tracking-wide text-zinc-500 mr-1">Stat weights</span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "px-2.5 py-0.5 rounded-full text-xs border transition-colors",
            !selection
              ? "border-blue-500 bg-blue-500/10 text-white"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
          )}
        >
          None
        </button>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt)}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border transition-colors",
              selection?.id === opt.id
                ? "border-blue-500 bg-blue-500/10 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
            )}
          >
            {opt.preset && <Sparkles className="h-3 w-3" />}
            {opt.name}
          </button>
        ))}
        <div className="flex-1" />
        <Link
          to="/gear/weights"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Manage sets
        </Link>
      </div>

      {selection && Object.keys(selection.weights).length > 0 && (
        <p className="text-2xs text-zinc-600 font-mono truncate">
          {Object.entries(selection.weights)
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ")}
        </p>
      )}
      {unknown.length > 0 && (
        <p className="text-2xs text-amber-500/80">
          Ignored unknown weight keys: {unknown.join(", ")}
        </p>
      )}
    </div>
  );
}
