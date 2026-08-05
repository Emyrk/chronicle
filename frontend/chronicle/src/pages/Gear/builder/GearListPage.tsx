import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Link2, Save } from "lucide-react";
import { useSession } from "@/api/queries";
import { useSharedGearList } from "@/api/gearBuilderQueries";
import { Button } from "@/components/ui/button";
import type { GearList, ItemSearchResult } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { gearClassById } from "../classInfo";
import { useSimItems } from "@/api/gamedata";
import {
  addStage,
  clearSlot,
  moveStage,
  parsePayload,
  removeStage,
  renameStage,
  setSlotItem,
  type GearPayload,
  type GearStage,
} from "./gearListModel";
import { scoreItem, type StatWeights } from "./gearScoring";
import { StatWeightsPanel, type WeightSelection } from "./StatWeightsPanel";
import { useGearListEditor } from "./useGearListEditor";
import { useListItems, type ItemRef } from "./useListItems";
import { BuilderDoll } from "./BuilderDoll";
import { SlotEditorPanel } from "./SlotEditorPanel";
import { SetSummaryBar } from "./SetSummaryBar";
import { StagesBar } from "./StagesBar";
import { ProgressionMatrix } from "./ProgressionMatrix";

const VISIBILITY_ICON = { public: Eye, unlisted: Link2, private: EyeOff } as const;

/** Per-slot and total weighted scores for one stage's primary items. */
function useStageScores(
  stage: GearStage | undefined,
  weights: StatWeights | null,
): { scores?: Map<number, number>; totalScore?: number } {
  const itemIds =
    stage && weights
      ? Object.values(stage.slots)
          .filter((e) => !!e)
          .map((e) => e!.item_id)
      : [];
  const simItems = useSimItems(itemIds);
  if (!stage || !weights) return {};
  const scores = new Map<number, number>();
  let totalScore = 0;
  for (const [key, entry] of Object.entries(stage.slots)) {
    if (!entry) continue;
    const sim = simItems.get(entry.item_id);
    if (!sim) continue;
    const score = scoreItem(sim, weights);
    scores.set(Number(key), score);
    totalScore += score;
  }
  return { scores, totalScore };
}

/** Every (item, enchant) pair the document references, for hydration. */
function collectItemRefs(payload: GearPayload): ItemRef[] {
  const refs: ItemRef[] = [];
  for (const stage of payload.stages) {
    for (const entry of Object.values(stage.slots)) {
      if (!entry) continue;
      refs.push({ itemId: entry.item_id, enchantId: entry.enchant_id });
      for (const alt of entry.alternates ?? []) refs.push({ itemId: alt.item_id });
    }
  }
  return refs;
}

function ListHeader({
  list,
  isOwner,
  right,
}: {
  list: GearList;
  isOwner: boolean;
  right?: React.ReactNode;
}) {
  const cls = gearClassById(list.class_id);
  const VisIcon = VISIBILITY_ICON[list.visibility as keyof typeof VISIBILITY_ICON] ?? EyeOff;
  return (
    <div className="flex items-start gap-3">
      <Link to="/gear" className="text-zinc-500 hover:text-zinc-300 mt-1.5">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-white truncate">{list.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
          {cls && (
            <span style={{ color: getClassColorVar(cls.enumName) }}>
              {list.spec_name ? `${list.spec_name} ${cls.name}` : cls.name}
            </span>
          )}
          <span className="inline-flex items-center gap-1 capitalize">
            <VisIcon className="h-3 w-3" />
            {list.visibility}
          </span>
          {isOwner && <span>you own this list</span>}
        </div>
      </div>
      <div className="flex-1" />
      {right}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "stage" | "matrix";
  onChange: (v: "stage" | "matrix") => void;
}) {
  return (
    <div className="flex items-center gap-1 text-xs">
      {(["stage", "matrix"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "px-2.5 py-1 rounded border capitalize transition-colors",
            view === v
              ? "border-blue-500 bg-blue-500/10 text-white"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
          )}
        >
          {v === "stage" ? "Stage view" : "Matrix"}
        </button>
      ))}
    </div>
  );
}

function ReadOnlyView({ list, isOwner }: { list: GearList; isOwner: boolean }) {
  const payload = useMemo(() => parsePayload(list.payload), [list.payload]);
  const [stageIndex, setStageIndex] = useState(0);
  const [weightSel, setWeightSel] = useState<WeightSelection | null>(null);
  const [view, setView] = useState<"stage" | "matrix">("stage");
  const items = useListItems(useMemo(() => collectItemRefs(payload), [payload]));
  const stage = payload.stages[Math.min(stageIndex, Math.max(payload.stages.length - 1, 0))];
  const { scores, totalScore } = useStageScores(stage, weightSel?.weights ?? null);

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-4">
      <ListHeader list={list} isOwner={isOwner} />
      {list.description && <p className="text-sm text-zinc-400">{list.description}</p>}
      {payload.stages.length === 0 ? (
        <p className="text-sm text-zinc-500">This list has no stages yet.</p>
      ) : (
        <div className="space-y-4">
          <StatWeightsPanel classId={list.class_id} selection={weightSel} onSelect={setWeightSel} />
          <div className="flex flex-wrap items-center gap-3">
            <StagesBar payload={payload} stageIndex={stageIndex} onSelect={setStageIndex} />
            <div className="flex-1" />
            {payload.stages.length > 1 && <ViewToggle view={view} onChange={setView} />}
          </div>
          {view === "matrix" && payload.stages.length > 1 ? (
            <ProgressionMatrix
              payload={payload}
              items={items}
              onCellClick={(stageIdx) => {
                setStageIndex(stageIdx);
                setView("stage");
              }}
            />
          ) : (
            stage && (
              <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4 max-w-xl space-y-3">
                <SetSummaryBar stage={stage} items={items} totalScore={totalScore} />
                <BuilderDoll stage={stage} items={items} scores={scores} />
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function EditorView({ list }: { list: GearList }) {
  const editor = useGearListEditor(list);
  const [stageIndex, setStageIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [weightSel, setWeightSel] = useState<WeightSelection | null>(null);
  const [view, setView] = useState<"stage" | "matrix">("stage");

  const items = useListItems(useMemo(() => collectItemRefs(editor.payload), [editor.payload]));
  const safeStageIndex = Math.min(stageIndex, Math.max(editor.payload.stages.length - 1, 0));
  const stage = editor.payload.stages[safeStageIndex];
  const { scores, totalScore } = useStageScores(stage, weightSel?.weights ?? null);
  const selectedEntry =
    selectedSlot != null && stage ? stage.slots[String(selectedSlot)] : undefined;

  const equip = (item: ItemSearchResult) => {
    if (selectedSlot == null) return;
    editor.update((p) => setSlotItem(p, safeStageIndex, selectedSlot, item.entry));
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-4">
      <ListHeader
        list={list}
        isOwner
        right={
          <div className="flex items-center gap-2">
            {editor.dirty && <span className="text-xs text-amber-400">unsaved changes</span>}
            <Button size="sm" onClick={editor.save} disabled={!editor.dirty || editor.saving}>
              <Save className="h-4 w-4 mr-1" />
              {editor.saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      />
      {list.description && <p className="text-sm text-zinc-400">{list.description}</p>}

      {editor.payload.stages.length === 0 ? (
        <p className="text-sm text-zinc-500">This list has no stages yet.</p>
      ) : (
        <div className="space-y-4">
          <StatWeightsPanel classId={list.class_id} selection={weightSel} onSelect={setWeightSel} />
          <div className="flex flex-wrap items-center gap-3">
            <StagesBar
              payload={editor.payload}
              stageIndex={safeStageIndex}
              onSelect={setStageIndex}
              onAdd={() => editor.update((p) => addStage(p))}
              onRename={(i, name) => editor.update((p) => renameStage(p, i, name))}
              onRemove={(i) => editor.update((p) => removeStage(p, i))}
              onMove={(from, to) => editor.update((p) => moveStage(p, from, to))}
            />
            <div className="flex-1" />
            {editor.payload.stages.length > 1 && <ViewToggle view={view} onChange={setView} />}
          </div>
          {view === "matrix" && editor.payload.stages.length > 1 ? (
            <ProgressionMatrix
              payload={editor.payload}
              items={items}
              onCellClick={(stageIdx, slotIdx) => {
                setStageIndex(stageIdx);
                setSelectedSlot(slotIdx);
                setView("stage");
              }}
            />
          ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] items-start">
            {stage && (
              <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4 space-y-3">
                <SetSummaryBar stage={stage} items={items} totalScore={totalScore} />
                <BuilderDoll
                  stage={stage}
                  items={items}
                  selectedSlot={selectedSlot ?? undefined}
                  onSelectSlot={(i) => setSelectedSlot((prev) => (prev === i ? null : i))}
                  scores={scores}
                />
                <p className="text-2xs text-zinc-600">Click a slot to pick its item.</p>
              </div>
            )}
            {selectedSlot != null ? (
              <SlotEditorPanel
                slotIndex={selectedSlot}
                entry={selectedEntry}
                items={items}
                onEquip={equip}
                onClear={() =>
                  editor.update((p) => clearSlot(p, safeStageIndex, selectedSlot))
                }
                onClose={() => setSelectedSlot(null)}
              />
            ) : (
              <div className="rounded-md border border-dashed border-zinc-800 p-6 text-sm text-zinc-600">
                Select a slot on the left to search and equip items.
              </div>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Gear list builder/viewer. Owners edit; everyone else gets a read-only view.
 */
export function GearListPage() {
  const { listID } = useParams<{ listID: string }>();
  const { data: session } = useSession();
  const list = useSharedGearList(listID);

  if (list.isLoading) {
    return <div className="p-8 text-center text-zinc-400">Loading gear list…</div>;
  }
  if (list.isError || !list.data) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p className="text-red-400 mb-2">Gear list not found or is private.</p>
        <Link to="/gear" className="text-sm text-blue-400 hover:underline">
          Back to gear lists
        </Link>
      </div>
    );
  }

  const isOwner = !!session && session.user_id === list.data.user_id;
  return isOwner ? (
    <EditorView key={list.data.id} list={list.data} />
  ) : (
    <ReadOnlyView list={list.data} isOwner={false} />
  );
}
