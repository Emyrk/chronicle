import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Copy, Plus, Scale, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useSiteConfig } from "@/api/queries";
import {
  useCreateStatWeight,
  useDeleteStatWeight,
  useMyStatWeights,
  useUpdateStatWeight,
} from "@/api/gearBuilderQueries";
import type { GearStatWeight } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { gearClassById, gearClassesForFlavor } from "../classInfo";
import { LoginBanner } from "../LoginBanner";
import { parseWeights, STAT_KEYS, type StatWeights } from "../builder/gearScoring";
import { draftFromWeights, WeightSetForm, weightsFromDraft } from "./WeightSetForm";
import { presetsForFlavor } from "./presets";

const STAT_LABEL = new Map(STAT_KEYS.map((s) => [s.key, s.label]));

function WeightSummary({ weights }: { weights: StatWeights }) {
  const entries = Object.entries(weights);
  if (entries.length === 0) {
    return <p className="text-2xs text-zinc-600">No weights set yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-2xs text-zinc-300"
        >
          {STAT_LABEL.get(key) ?? key} <span className="font-mono text-zinc-400">{value}</span>
        </span>
      ))}
    </div>
  );
}

function ClassSpecLine({ classId, specName }: { classId: number; specName: string }) {
  const cls = gearClassById(classId);
  if (!cls) return <span className="text-2xs text-zinc-500">Any class</span>;
  return (
    <span className="text-2xs" style={{ color: getClassColorVar(cls.enumName) }}>
      {specName ? `${specName} ${cls.name}` : cls.name}
    </span>
  );
}

function ClassSpecSelects({
  classId,
  specName,
  onClassId,
  onSpecName,
}: {
  classId: number;
  specName: string;
  onClassId: (id: number) => void;
  onSpecName: (name: string) => void;
}) {
  const { data: siteConfig } = useSiteConfig();
  const classes = useMemo(
    () => gearClassesForFlavor(siteConfig?.dataset_flavor ?? []),
    [siteConfig?.dataset_flavor],
  );
  const selectClass =
    "h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200";
  const selected = classes.find((c) => c.id === classId);
  return (
    <>
      <select
        className={selectClass}
        value={classId}
        onChange={(e) => {
          onClassId(Number(e.target.value));
          onSpecName("");
        }}
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select className={selectClass} value={specName} onChange={(e) => onSpecName(e.target.value)}>
        <option value="">Any spec</option>
        {(selected?.specs ?? []).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </>
  );
}

function WeightSetEditor({ weightSet, onDone }: { weightSet: GearStatWeight; onDone: () => void }) {
  const [name, setName] = useState(weightSet.name);
  const [description, setDescription] = useState(weightSet.description);
  const [classId, setClassId] = useState(weightSet.class_id || 1);
  const [specName, setSpecName] = useState(weightSet.spec_name);
  const [draft, setDraft] = useState(() => draftFromWeights(parseWeights(weightSet.weights)));
  const updateWeight = useUpdateStatWeight();
  const deleteWeight = useDeleteStatWeight();

  const save = () => {
    if (!name.trim()) {
      toast.error("Give the weight set a name");
      return;
    }
    updateWeight.mutate(
      {
        id: weightSet.id,
        name: name.trim(),
        description,
        class_id: classId,
        spec_name: specName,
        weights: weightsFromDraft(draft) as unknown as Record<string, string>,
      },
      {
        onSuccess: () => {
          toast.success("Weight set saved");
          onDone();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-64 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={128}
          placeholder="Weight set name"
        />
        <ClassSpecSelects
          classId={classId}
          specName={specName}
          onClassId={setClassId}
          onSpecName={setSpecName}
        />
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-zinc-500 hover:text-red-400"
          onClick={() => {
            if (!window.confirm(`Delete weight set "${weightSet.name}"?`)) return;
            deleteWeight.mutate(weightSet.id, {
              onSuccess: onDone,
              onError: (err) => toast.error(err.message),
            });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" className="h-8 text-xs" onClick={save} disabled={updateWeight.isPending}>
          Save
        </Button>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="What is this weight set for? e.g. assumes hit-capped, values survivability…"
        className="w-full resize-y rounded border border-zinc-700 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
      />
      <WeightSetForm draft={draft} onChange={setDraft} />
      <p className="text-2xs text-zinc-600">
        Scores multiply each item's stats by these weights. They are not a simulation — two
        people with different weights will rank the same item differently, which is the point.
      </p>
    </div>
  );
}

function CreateWeightSetForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState(1);
  const [specName, setSpecName] = useState("");
  const createWeight = useCreateStatWeight();

  return (
    <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-64 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={128}
          placeholder="Weight set name, e.g. Fury — hit capped"
          autoFocus
        />
        <ClassSpecSelects
          classId={classId}
          specName={specName}
          onClassId={setClassId}
          onSpecName={setSpecName}
        />
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={createWeight.isPending}
          onClick={() => {
            if (!name.trim()) {
              toast.error("Give the weight set a name");
              return;
            }
            createWeight.mutate(
              {
                name: name.trim(),
                description,
                class_id: classId,
                spec_name: specName,
                weights: {} as unknown as Record<string, string>,
              },
              {
                onSuccess: (sw) => onCreated(sw.id),
                onError: (err) => toast.error(err.message),
              },
            );
          }}
        >
          Create & edit weights
        </Button>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="What is this weight set for?"
        className="w-full resize-y rounded border border-zinc-700 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
      />
    </div>
  );
}

/**
 * Stat weight sets: built-in presets plus the user's own sets, each
 * with a class/spec, title, and description, and a full per-stat editor.
 */
export function StatWeightsPage() {
  const { isAuthenticated } = useAuth();
  const { data: siteConfig } = useSiteConfig();
  const myWeights = useMyStatWeights(isAuthenticated);
  const createWeight = useCreateStatWeight();
  const [creating, setCreating] = useState(false);

  // Wait for site-config so a wrath tenant never flashes vanilla presets.
  const builtInPresets = useMemo(
    () => (siteConfig ? presetsForFlavor(siteConfig.dataset_flavor ?? []) : []),
    [siteConfig],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const editingId = searchParams.get("id");
  const setEditingId = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id == null) {
      next.delete("id");
    } else {
      next.set("id", id);
    }
    setSearchParams(next, { replace: true });
  };
  const editing = (myWeights.data ?? []).find((w) => w.id === editingId);

  const copyPreset = (preset: (typeof builtInPresets)[number]) => {
    if (!isAuthenticated) {
      toast.error("You must be logged in to save stat weights");
      return;
    }
    createWeight.mutate(
      {
        name: preset.name,
        description: preset.description,
        class_id: preset.classId,
        spec_name: preset.specName,
        weights: preset.weights as unknown as Record<string, string>,
      },
      {
        onSuccess: (sw) => {
          toast.success(`Copied "${preset.name}" to your sets`);
          setCreating(false);
          setEditingId(sw.id);
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            My weight sets
          </h2>
          {isAuthenticated && (
            <Button
              size="sm"
              onClick={() => {
                setCreating(true);
                setEditingId(null);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              New weight set
            </Button>
          )}
        </div>

        {creating && (
          <CreateWeightSetForm
            onCreated={(id) => {
              setCreating(false);
              setEditingId(id);
            }}
          />
        )}
        {editing && <WeightSetEditor key={editing.id} weightSet={editing} onDone={() => setEditingId(null)} />}

        {!isAuthenticated ? (
          <LoginBanner
            title="Log in to create stat weight sets"
            subtitle="Weights turn the gear builder's items into scores so sets can be compared at a glance."
          />
        ) : myWeights.isLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (myWeights.data ?? []).length === 0 ? (
          !creating && (
            <p className="text-sm text-zinc-500">
              No weight sets yet. Weights turn the gear builder's items into scores so sets can
              be compared at a glance.
            </p>
          )
        ) : (
          <div className="space-y-2">
            {(myWeights.data ?? [])
              .filter((w) => w.id !== editingId)
              .map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setEditingId(w.id);
                  }}
                  className="block w-full rounded-md border border-zinc-700/60 bg-zinc-900/40 px-4 py-3 text-left hover:border-zinc-600 transition-colors"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="inline-flex items-center gap-1.5 font-medium text-zinc-100">
                      <Scale className="h-3.5 w-3.5 text-zinc-500" />
                      {w.name}
                    </span>
                    <ClassSpecLine classId={w.class_id} specName={w.spec_name} />
                    <span className="text-2xs text-zinc-600">
                      updated {new Date(w.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  {w.description && (
                    <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{w.description}</p>
                  )}
                  <div className="mt-1.5">
                    <WeightSummary weights={parseWeights(w.weights)} />
                  </div>
                </button>
              ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Built-in presets
        </h2>
        <p className="text-xs text-zinc-500">
          A decent starting point per spec, derived from published community weights (wowsims
          defaults, Elitist Jerks-era Pawn scales). Copy one to your sets to tune it.
        </p>
        <div className="space-y-2">
          {builtInPresets.map((preset) => (
            <div
              key={preset.id}
              className="rounded-md border border-zinc-700/60 bg-zinc-900/40 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="inline-flex items-center gap-1.5 font-medium text-zinc-100">
                  <Sparkles className="h-3.5 w-3.5 text-zinc-500" />
                  {preset.name}
                </span>
                <ClassSpecLine classId={preset.classId} specName={preset.specName} />
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-2xs text-zinc-400"
                  onClick={() => copyPreset(preset)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy to my sets
                </Button>
              </div>
              <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{preset.description}</p>
              <div className="mt-1.5">
                <WeightSummary weights={preset.weights} />
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
