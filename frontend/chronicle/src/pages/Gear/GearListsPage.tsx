import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useSiteConfig } from "@/api/queries";
import {
  useCreateGearList,
  useDeleteGearList,
  useMyGearLists,
  usePublicGearLists,
} from "@/api/gearBuilderQueries";
import { GearListCard } from "./GearListCard";
import { gearClassesForFlavor } from "./classInfo";

const EMPTY_PAYLOAD = { version: 2, stages: [{ name: "Stage 1", slots: {} }] };

function CreateListForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const { data: siteConfig } = useSiteConfig();
  const classes = useMemo(
    () => gearClassesForFlavor(siteConfig?.dataset_flavor ?? []),
    [siteConfig?.dataset_flavor],
  );

  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState(classes[0]?.id ?? 1);
  const [specName, setSpecName] = useState("");
  const [visibility, setVisibility] = useState("private");
  const createList = useCreateGearList();

  const selectedClass = classes.find((c) => c.id === classId);

  const submit = () => {
    if (!title.trim()) {
      toast.error("Give the list a title");
      return;
    }
    createList.mutate(
      {
        title: title.trim(),
        description: "",
        class_id: classId,
        spec_name: specName,
        visibility,
        // The generated type for json.RawMessage is awkward; the payload
        // travels as a plain JSON object.
        payload: EMPTY_PAYLOAD as unknown as Record<string, string>,
      },
      {
        onSuccess: (list) => {
          onDone();
          navigate(`/gear/lists/${list.id}`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const selectClass =
    "h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-200";

  return (
    <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4 space-y-3">
      <Input
        placeholder="List title, e.g. Fury Warrior Pre-Raid"
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
        <select className={selectClass} value={specName} onChange={(e) => setSpecName(e.target.value)}>
          <option value="">Any spec</option>
          {(selectedClass?.specs ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className={selectClass} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="private">Private</option>
          <option value="unlisted">Unlisted</option>
          <option value="public">Public</option>
        </select>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={createList.isPending}>
          Create
        </Button>
      </div>
    </div>
  );
}

export function GearListsPage() {
  const { isAuthenticated } = useAuth();
  const [creating, setCreating] = useState(false);
  const myLists = useMyGearLists(isAuthenticated);
  const publicLists = usePublicGearLists();
  const deleteList = useDeleteGearList();

  // Your own public lists already show under "My lists".
  const myIds = new Set((myLists.data ?? []).map((l) => l.id));
  const otherPublicLists = (publicLists.data ?? []).filter((l) => !myIds.has(l.id));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">My lists</h2>
          <Button
            size="sm"
            onClick={() => {
              if (!isAuthenticated) {
                toast.error("You must be logged in to create gear lists");
                return;
              }
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            New list
          </Button>
        </div>
        {creating && <CreateListForm onDone={() => setCreating(false)} />}
        {!isAuthenticated ? (
          <p className="text-sm text-zinc-500">Log in to create and manage your own gear lists.</p>
        ) : myLists.isLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (myLists.data ?? []).length === 0 ? (
          !creating && (
            <p className="text-sm text-zinc-500">
              No gear lists yet. Create one to start planning a set or a full progression.
            </p>
          )
        ) : (
          <div className="space-y-2">
            {(myLists.data ?? []).map((list) => (
              <GearListCard
                key={list.id}
                list={list}
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-500 hover:text-red-400"
                    onClick={() => {
                      if (!window.confirm(`Delete "${list.title}"? This cannot be undone.`)) return;
                      deleteList.mutate(list.id, {
                        onError: (err) => toast.error(err.message),
                      });
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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Public lists
        </h2>
        {publicLists.isLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : otherPublicLists.length === 0 ? (
          <p className="text-sm text-zinc-500">No public gear lists on this server yet.</p>
        ) : (
          <div className="space-y-2">
            {otherPublicLists.map((list) => (
              <GearListCard key={list.id} list={list} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
