import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useTenantDatasetScope } from "@/hooks/useDatasetId";
import {
  useCreateStatWeight,
  useDeleteStatWeight,
  useMyStatWeights,
  useStatWeightPins,
  useUpdateStatWeight,
} from "@/api/gearBuilderQueries";
import type { GearStatWeight, GearStatWeightPin } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import {
  parseWeights,
  STAT_GROUPS,
  STAT_KEYS,
  unknownWeightKeys,
  type StatWeights,
} from "./gearScoring";

export interface WeightSelection {
  id: string;
  name: string;
  weights: StatWeights;
  /** True when the set belongs to the current user (editable). */
  mine: boolean;
}

interface StatWeightsPanelProps {
  classId: number;
  selection: WeightSelection | null;
  onSelect: (selection: WeightSelection | null) => void;
}

function pinToSelection(pin: GearStatWeightPin): WeightSelection {
  return {
    id: pin.stat_weight_id,
    name: pin.stat_weight_name || "Pinned weights",
    weights: parseWeights(pin.stat_weight_weights),
    mine: false,
  };
}

function mineToSelection(sw: GearStatWeight): WeightSelection {
  return { id: sw.id, name: sw.name, weights: parseWeights(sw.weights), mine: true };
}

/**
 * Stat-weight set picker + editor. Admin-pinned sets come first, then the
 * user's own sets. Scores everywhere update live with the selection.
 */
export function StatWeightsPanel({ classId, selection, onSelect }: StatWeightsPanelProps) {
  const { isAuthenticated } = useAuth();
  const { datasetId } = useTenantDatasetScope();
  const pins = useStatWeightPins(datasetId ?? undefined);
  const myWeights = useMyStatWeights(isAuthenticated);
  const [editing, setEditing] = useState(false);

  const options = useMemo(() => {
    const pinned = (pins.data ?? [])
      .filter((p) => !p.stat_weight_class_id || p.stat_weight_class_id === classId)
      .map(pinToSelection);
    const mine = (myWeights.data ?? [])
      .filter((w) => !w.class_id || w.class_id === classId)
      .map(mineToSelection);
    // A pinned set the user owns shows once, as editable.
    const mineIds = new Set(mine.map((m) => m.id));
    return [...pinned.filter((p) => !mineIds.has(p.id)), ...mine];
  }, [pins.data, myWeights.data, classId]);

  const unknown = selection ? unknownWeightKeys(selection.weights) : [];

  return (
    <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-2xs uppercase tracking-wide text-zinc-500 mr-1">Stat weights</span>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setEditing(false);
          }}
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
            {!opt.mine && <Pin className="h-3 w-3" />}
            {opt.name}
          </button>
        ))}
        <div className="flex-1" />
        <NewWeightSetButton classId={classId} onCreated={(sel) => onSelect(sel)} />
        {selection?.mine && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-zinc-400"
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? <ChevronDown className="h-3.5 w-3.5 mr-1" /> : <ChevronRight className="h-3.5 w-3.5 mr-1" />}
            Edit
          </Button>
        )}
      </div>

      {selection && !selection.mine && Object.keys(selection.weights).length > 0 && (
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

      {editing && selection?.mine && (
        <WeightSetEditor
          key={selection.id}
          selection={selection}
          onSaved={(sel) => onSelect(sel)}
          onDeleted={() => {
            onSelect(null);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function NewWeightSetButton({
  classId,
  onCreated,
}: {
  classId: number;
  onCreated: (sel: WeightSelection) => void;
}) {
  const { isAuthenticated } = useAuth();
  const createWeight = useCreateStatWeight();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (!naming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-zinc-400"
        onClick={() => {
          if (!isAuthenticated) {
            toast.error("You must be logged in to create stat weights");
            return;
          }
          setNaming(true);
        }}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        New set
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        createWeight.mutate(
          { name: name.trim(), class_id: classId, spec_name: "", weights: {} as unknown as Record<string, string> },
          {
            onSuccess: (sw) => {
              setNaming(false);
              setName("");
              onCreated(mineToSelection(sw));
            },
            onError: (err) => toast.error(err.message),
          },
        );
      }}
    >
      <Input
        className="h-6 w-40 text-xs"
        placeholder="Weight set name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <Button type="submit" size="sm" className="h-6 px-2 text-xs" disabled={createWeight.isPending}>
        Create
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => setNaming(false)}
      >
        Cancel
      </Button>
    </form>
  );
}

function WeightSetEditor({
  selection,
  onSaved,
  onDeleted,
}: {
  selection: WeightSelection;
  onSaved: (sel: WeightSelection) => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(selection.weights).map(([k, v]) => [k, String(v)])),
  );
  const updateWeight = useUpdateStatWeight();
  const deleteWeight = useDeleteStatWeight();

  const save = () => {
    const weights: StatWeights = {};
    for (const [key, raw] of Object.entries(draft)) {
      const v = parseFloat(raw);
      if (Number.isFinite(v) && v !== 0) weights[key] = v;
    }
    updateWeight.mutate(
      { id: selection.id, weights: weights as unknown as Record<string, string> },
      {
        onSuccess: () => {
          toast.success("Weights saved");
          onSaved({ ...selection, weights });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-3 border-t border-zinc-800 pt-3">
      {STAT_GROUPS.map((group) => {
        const keys = STAT_KEYS.filter((s) => s.group === group);
        return (
          <div key={group}>
            <div className="text-2xs uppercase tracking-wide text-zinc-500 mb-1">{group}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
              {keys.map((stat) => (
                <label key={stat.key} className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-xs",
                      draft[stat.key] && parseFloat(draft[stat.key]) !== 0
                        ? "text-zinc-200"
                        : "text-zinc-500",
                    )}
                  >
                    {stat.label}
                  </span>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-6 w-16 text-xs font-mono px-1.5"
                    value={draft[stat.key] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [stat.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={save} disabled={updateWeight.isPending}>
          Save weights
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-zinc-500 hover:text-red-400"
          onClick={() => {
            if (!window.confirm(`Delete weight set "${selection.name}"?`)) return;
            deleteWeight.mutate(selection.id, {
              onSuccess: onDeleted,
              onError: (err) => toast.error(err.message),
            });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
