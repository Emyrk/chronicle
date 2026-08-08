import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useSiteConfig } from "@/api/queries";
import {
  useCreateGearProgression,
  useDeleteGearProgression,
  useMyGearProgressions,
} from "@/api/gearProgressionQueries";
import { gearClassesForFlavor } from "../classInfo";
import { LoginBanner } from "../LoginBanner";
import { ProgressionCard } from "./ProgressionCard";
import { PROGRESSION_PAYLOAD_VERSION, levelCapForFlavor } from "./progressionModel";

function CreateProgressionForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const { data: siteConfig } = useSiteConfig();
  const classes = useMemo(
    () => gearClassesForFlavor(siteConfig?.dataset_flavor ?? []),
    [siteConfig?.dataset_flavor],
  );
  const levelCap = levelCapForFlavor(siteConfig?.dataset_flavor ?? []);

  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState(classes[0]?.id ?? 1);
  const [specName, setSpecName] = useState("");
  const create = useCreateGearProgression();

  const selectedClass = classes.find((c) => c.id === classId);

  const submit = () => {
    if (!title.trim()) {
      toast.error("Give the progression a title");
      return;
    }
    create.mutate(
      {
        title: title.trim(),
        description: "",
        class_id: classId,
        spec_name: specName,
        // The generated type for json.RawMessage is awkward; the payload
        // travels as a plain JSON object.
        payload: {
          version: PROGRESSION_PAYLOAD_VERSION,
          pool: [],
          stages: [{ name: `Fresh ${levelCap}`, slots: {} }],
        } as unknown as Record<string, string>,
      },
      {
        onSuccess: (prog) => {
          onDone();
          navigate(`/gear/progression/${prog.id}`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const selectClass =
    "h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-200";

  return (
    <div className="space-y-3 rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4">
      <Input
        placeholder={`Progression title, e.g. Fury Warrior 1–${levelCap}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={128}
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={selectClass}
          value={classId}
          onChange={(e) => {
            setClassId(Number(e.target.value));
            setSpecName("");
          }}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={specName}
          onChange={(e) => setSpecName(e.target.value)}
        >
          <option value="">Any spec</option>
          {(selectedClass?.specs ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={create.isPending}>
          Create
        </Button>
      </div>
    </div>
  );
}

/**
 * "My progressions" — the index for the Progression tab. A progression is
 * one pool of hand-picked items rendered as a leveling scrubber plus
 * max-level stage snapshots.
 */
export function GearProgressionsPage() {
  const { isAuthenticated } = useAuth();
  const { data: siteConfig } = useSiteConfig();
  const levelCap = levelCapForFlavor(siteConfig?.dataset_flavor ?? []);
  const [creating, setCreating] = useState(false);
  const mine = useMyGearProgressions(isAuthenticated);
  const remove = useDeleteGearProgression();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            My progressions
          </h2>
          {isAuthenticated && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New progression
            </Button>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Pick a pool of items once; the leveling scrubber derives best-per-slot at every level
          from 1 to {Math.max(1, levelCap - 1)}, and max level is expressed as explicit stage
          snapshots.
        </p>
        {creating && <CreateProgressionForm onDone={() => setCreating(false)} />}
        {!isAuthenticated ? (
          <LoginBanner
            title="Log in to build gear progressions"
            subtitle="Plan a leveling path and a max-level ladder from one hand-picked pool of items."
          />
        ) : mine.isLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (mine.data ?? []).length === 0 ? (
          !creating && (
            <p className="text-sm text-zinc-500">
              No progressions yet. Create one to start planning a leveling path.
            </p>
          )
        ) : (
          <div className="space-y-2">
            {(mine.data ?? []).map((prog) => (
              <ProgressionCard
                key={prog.id}
                progression={prog}
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-500 hover:text-red-400"
                    onClick={() => {
                      if (!window.confirm(`Delete "${prog.title}"? This cannot be undone.`)) return;
                      remove.mutate(prog.id, { onError: (err) => toast.error(err.message) });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
