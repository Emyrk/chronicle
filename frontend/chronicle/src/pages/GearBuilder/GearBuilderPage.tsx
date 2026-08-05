import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, Trash2, Edit2, Share2, Eye, Save, X, Scale } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useMyGearLists,
  useSharedGearList,
  useCreateGearList,
  useUpdateGearList,
  useDeleteGearList,
  useMyStatWeights,
  useCreateStatWeight,
  useUpdateStatWeight,
  useDeleteStatWeight,
  useStatWeightPins,
} from "@/api/gearBuilderQueries";
import { useTenantDatasetScope } from "@/hooks/useDatasetId";
import type { GearList, CreateGearListRequest, GearStatWeight } from "@/api/typesGenerated";

const EQUIPMENT_SLOTS = [
  "Head", "Neck", "Shoulder", "Shirt", "Chest",
  "Waist", "Legs", "Feet", "Wrist", "Hands",
  "Finger 1", "Finger 2", "Trinket 1", "Trinket 2", "Back",
  "Main Hand", "Off Hand", "Ranged", "Tabard",
] as const;

// ─── Shared View ─────────────────────────────────────────────

function SharedGearListView({ listID }: { listID: string }) {
  const { data: list, isLoading, error } = useSharedGearList(listID);

  if (isLoading) return <div className="p-8 text-center text-zinc-400">Loading gear list...</div>;
  if (error || !list) return <div className="p-8 text-center text-red-400">Gear list not found or is private.</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">{list.title}</h1>
        {list.description && <p className="text-zinc-400 mt-1">{list.description}</p>}
        <div className="flex gap-3 mt-2 text-sm text-zinc-500">
          <span>Class: {list.class_id}</span>
          {list.spec_name && <span>Spec: {list.spec_name}</span>}
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {list.visibility}</span>
        </div>
      </div>
      <GearPayloadView payload={list.payload} />
    </div>
  );
}

function GearPayloadView({ payload }: { payload: unknown }) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const stages = parsed?.stages ?? [];

  if (stages.length === 0) {
    return <p className="text-zinc-500 italic">No stages defined yet.</p>;
  }

  return (
    <div className="space-y-4">
      {stages.map((stage: { name?: string; slots?: Record<string, number> }, i: number) => (
        <div key={i} className="border border-zinc-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-zinc-200 mb-3">
            Stage {i + 1}{stage.name ? `: ${stage.name}` : ""}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {EQUIPMENT_SLOTS.map((slotName, slotIdx) => {
              const itemID = stage.slots?.[String(slotIdx)];
              return (
                <div key={slotIdx} className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500 w-20 truncate">{slotName}:</span>
                  <span className="text-zinc-300 font-mono">{itemID ?? "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Gear List Editor ────────────────────────────────────────

interface StageData {
  name: string;
  slots: Record<string, string>;
}

function GearListEditor({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: GearList;
  onSave: (req: CreateGearListRequest) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [classId, setClassId] = useState(String(initial?.class_id ?? 1));
  const [specName, setSpecName] = useState(initial?.spec_name ?? "");
  const [visibility, setVisibility] = useState(initial?.visibility ?? "private");
  const [stages, setStages] = useState<StageData[]>(() => {
    const parsed = initial?.payload ? (typeof initial.payload === "string" ? JSON.parse(initial.payload) : initial.payload) : { stages: [] };
    return (parsed.stages ?? []).map((s: { name?: string; slots?: Record<string, number> }) => ({
      name: s.name ?? "",
      slots: Object.fromEntries(
        EQUIPMENT_SLOTS.map((_, i) => [String(i), String(s.slots?.[String(i)] ?? "")])
      ),
    }));
  });

  const addStage = () => setStages([...stages, { name: "", slots: Object.fromEntries(EQUIPMENT_SLOTS.map((_, i) => [String(i), ""])) }]);
  const removeStage = (idx: number) => setStages(stages.filter((_, i) => i !== idx));

  const handleSubmit = () => {
    const payload = {
      stages: stages.map((s) => ({
        name: s.name,
        slots: Object.fromEntries(
          Object.entries(s.slots).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])
        ),
      })),
    };
    onSave({
      title,
      description,
      class_id: Number(classId),
      spec_name: specName,
      visibility,
      // payload is json.RawMessage (mapped to Record<string, string>), pass object
      payload: payload as unknown as Record<string, string>,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Title *</label>
          <input className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={128} />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Visibility</label>
          <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="private">Private</option>
            <option value="unlisted">Unlisted (link only)</option>
            <option value="public">Public</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Class ID</label>
          <input type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200" value={classId} onChange={(e) => setClassId(e.target.value)} min={1} max={11} />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Spec</label>
          <input className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200" value={specName} onChange={(e) => setSpecName(e.target.value)} placeholder="e.g. Protection" />
        </div>
      </div>
      <div>
        <label className="block text-sm text-zinc-400 mb-1">Description</label>
        <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-200">Stages</h3>
          <button onClick={addStage} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300">
            <Plus className="h-4 w-4" /> Add Stage
          </button>
        </div>
        {stages.map((stage, stageIdx) => (
          <div key={stageIdx} className="border border-zinc-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <input
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-sm"
                placeholder={`Stage ${stageIdx + 1} name`}
                value={stage.name}
                onChange={(e) => {
                  const next = [...stages];
                  next[stageIdx] = { ...next[stageIdx], name: e.target.value };
                  setStages(next);
                }}
              />
              <button onClick={() => removeStage(stageIdx)} className="text-red-400 hover:text-red-300">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {EQUIPMENT_SLOTS.map((slotName, slotIdx) => (
                <div key={slotIdx}>
                  <label className="text-xs text-zinc-500">{slotName}</label>
                  <input
                    type="number"
                    className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-zinc-300 text-sm"
                    placeholder="Item ID"
                    value={stage.slots[String(slotIdx)] ?? ""}
                    onChange={(e) => {
                      const next = [...stages];
                      next[stageIdx] = {
                        ...next[stageIdx],
                        slots: { ...next[stageIdx].slots, [String(slotIdx)]: e.target.value },
                      };
                      setStages(next);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={saving || !title.trim()} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded">
          <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={onCancel} className="flex items-center gap-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-4 py-2 rounded">
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Stat Weights Section ────────────────────────────────────

function StatWeightsSection() {
  const { data: weights, isLoading } = useMyStatWeights();
  const { datasetId } = useTenantDatasetScope();
  const { data: pins } = useStatWeightPins(datasetId);
  const createMut = useCreateStatWeight();
  const updateMut = useUpdateStatWeight();
  const deleteMut = useDeleteStatWeight();
  const [editing, setEditing] = useState<GearStatWeight | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [weightsJson, setWeightsJson] = useState('{"stamina": 1.0}');
  const [parseError, setParseError] = useState("");

  const resetEditor = () => {
    setCreating(false);
    setEditing(null);
    setName("");
    setWeightsJson('{"stamina": 1.0}');
    setParseError("");
  };

  const handleSave = () => {
    let parsedWeights: Record<string, number>;
    try {
      parsedWeights = JSON.parse(weightsJson) as Record<string, number>;
      setParseError("");
    } catch {
      setParseError("Weights must be valid JSON.");
      return;
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, name, weights: parsedWeights as unknown as Record<string, string> }, { onSuccess: resetEditor });
      return;
    }
    createMut.mutate({ name, class_id: 0, spec_name: "", weights: parsedWeights as unknown as Record<string, string> }, { onSuccess: resetEditor });
  };

  const startEditing = (weight: GearStatWeight) => {
    setEditing(weight);
    setCreating(true);
    setName(weight.name);
    setWeightsJson(JSON.stringify(weight.weights, null, 2));
    setParseError("");
  };

  return (
    <div className="border border-zinc-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
          <Scale className="h-5 w-5" /> Stat Weights
        </h2>
        <button onClick={() => setCreating(!creating)} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
          <Plus className="h-4 w-4" /> New
        </button>
      </div>

      {creating && (
        <div className="mb-4 p-3 bg-zinc-800 rounded space-y-2">
          <input className="w-full bg-zinc-900 border border-zinc-600 rounded px-2 py-1 text-zinc-200 text-sm" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="w-full bg-zinc-900 border border-zinc-600 rounded px-2 py-1 text-zinc-300 text-sm font-mono" rows={3} value={weightsJson} onChange={(e) => setWeightsJson(e.target.value)} />
          {parseError && <p className="text-sm text-red-400">{parseError}</p>}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!name.trim() || createMut.isPending || updateMut.isPending} className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1 rounded">{editing ? "Save changes" : "Create"}</button>
            <button onClick={resetEditor} className="text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1 rounded">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-zinc-500 text-sm">Loading...</p>
      ) : (
        <div className="space-y-2">
          {(weights ?? []).length === 0 && <p className="text-zinc-500 text-sm italic">No custom stat weights yet.</p>}
          {(weights ?? []).map((sw: GearStatWeight) => (
            <div key={sw.id} className="flex items-center justify-between bg-zinc-800 rounded px-3 py-2">
              <div>
                <span className="text-zinc-200 text-sm font-medium">{sw.name}</span>
                <span className="text-zinc-500 text-xs ml-2">{sw.id.slice(0, 8)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startEditing(sw)} className="text-zinc-400 hover:text-zinc-200" title="Edit live stat weights">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => deleteMut.mutate(sw.id)} className="text-red-400 hover:text-red-300" title="Delete stat weights">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {(pins ?? []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-700">
              <p className="text-xs text-zinc-500 mb-1">Pinned presets:</p>
              {(pins ?? []).map((p) => (
                <div key={p.id} className="text-sm text-zinc-400">{p.stat_weight_name}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function GearBuilderPage() {
  const { listID } = useParams<{ listID: string }>();
  const { isAuthenticated } = useAuth();

  // If viewing a shared list, show the shared view.
  if (listID) {
    return <SharedGearListView listID={listID} />;
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold text-zinc-100 mb-4">Gear Builder</h1>
        <p className="text-zinc-400">
          <Link to="/login" className="text-blue-400 hover:text-blue-300">Sign in</Link> to create and manage gear progression lists.
        </p>
      </div>
    );
  }

  return <AuthenticatedGearBuilder />;
}

function AuthenticatedGearBuilder() {
  const { data: lists, isLoading } = useMyGearLists();
  const createMut = useCreateGearList();
  const updateMut = useUpdateGearList();
  const deleteMut = useDeleteGearList();
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingList, setEditingList] = useState<GearList | null>(null);

  const handleCreate = (req: CreateGearListRequest) => {
    createMut.mutate(req, { onSuccess: () => setMode("list") });
  };

  const handleUpdate = (req: CreateGearListRequest) => {
    if (!editingList) return;
    updateMut.mutate({ id: editingList.id, ...req }, { onSuccess: () => { setMode("list"); setEditingList(null); } });
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">Gear Builder</h1>
        {mode === "list" && (
          <button onClick={() => setMode("create")} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">
            <Plus className="h-4 w-4" /> New Gear List
          </button>
        )}
      </div>

      {mode === "create" && (
        <div className="border border-zinc-700 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">Create Gear List</h2>
          <GearListEditor onSave={handleCreate} onCancel={() => setMode("list")} saving={createMut.isPending} />
        </div>
      )}

      {mode === "edit" && editingList && (
        <div className="border border-zinc-700 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">Edit Gear List</h2>
          <GearListEditor initial={editingList} onSave={handleUpdate} onCancel={() => { setMode("list"); setEditingList(null); }} saving={updateMut.isPending} />
        </div>
      )}

      {mode === "list" && (
        <>
          {isLoading ? (
            <p className="text-zinc-400">Loading gear lists...</p>
          ) : (lists ?? []).length === 0 ? (
            <p className="text-zinc-500 italic">No gear lists yet. Create one to get started.</p>
          ) : (
            <div className="space-y-3">
              {(lists ?? []).map((list: GearList) => (
                <div key={list.id} className="border border-zinc-700 rounded-lg p-4 flex items-start justify-between">
                  <div>
                    <h3 className="text-zinc-200 font-medium">{list.title}</h3>
                    {list.description && <p className="text-zinc-500 text-sm mt-1">{list.description}</p>}
                    <div className="flex gap-3 mt-1 text-xs text-zinc-600">
                      <span>Class: {list.class_id}</span>
                      {list.spec_name && <span>Spec: {list.spec_name}</span>}
                      <span>{list.visibility}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {list.visibility !== "private" && (
                      <Link to={`/gear/${list.id}`} className="text-zinc-400 hover:text-zinc-200" title="View shared">
                        <Share2 className="h-4 w-4" />
                      </Link>
                    )}
                    <button onClick={() => { setEditingList(list); setMode("edit"); }} className="text-zinc-400 hover:text-zinc-200" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => { if (confirm("Delete this gear list?")) deleteMut.mutate(list.id); }} className="text-red-400 hover:text-red-300" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <StatWeightsSection />
        </>
      )}
    </div>
  );
}
