import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Link2, Save } from "lucide-react";
import { useArmoryGearHistory, useSession } from "@/api/queries";
import { useGearListRevision, useSharedGearList } from "@/api/gearBuilderQueries";
import { Button } from "@/components/ui/button";
import type { GearList, ItemSearchResult } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { gearClassById } from "../classInfo";
import { useSimItems } from "@/api/gamedata";
import {
  addAlternate,
  addStage,
  clearSlot,
  moveStage,
  parsePayload,
  promoteAlternate,
  removeAlternate,
  removeStage,
  renameStage,
  setAlternateNote,
  setSlotEnchant,
  setSlotItem,
  setSlotNote,
  type GearPayload,
  type GearStage,
} from "./gearListModel";
import { scoreItem, type StatWeights } from "./gearScoring";
import { StatWeightsPanel, type WeightSelection } from "./StatWeightsPanel";
import { useGearListEditor } from "./useGearListEditor";
import { useListItems, type ItemRef } from "./useListItems";
import { BuilderDoll } from "./BuilderDoll";
import { SlotEditorPanel, slotLabel } from "./SlotEditorPanel";
import { AlternatesEditor } from "./AlternatesEditor";
import { SetSummaryBar } from "./SetSummaryBar";
import { StagesBar } from "./StagesBar";
import { ProgressionMatrix } from "./ProgressionMatrix";
import { RevisionControls } from "./RevisionControls";
import { buildCharacterMatch, stageCoverage } from "./characterMatch";
import {
  CharacterMatchPanel,
  formatCharParam,
  parseCharParam,
  type MatchedCharacter,
} from "./CharacterMatchPanel";

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

/** ?char= (Realm:Name) armory match state shared by both page views. */
function useCharacterMatchState(stage: GearStage | undefined) {
  const [searchParams, setSearchParams] = useSearchParams();
  const matched = parseCharParam(searchParams.get("char"));
  const setMatched = (char: MatchedCharacter | null) => {
    const next = new URLSearchParams(searchParams);
    if (char == null) {
      next.delete("char");
    } else {
      next.set("char", formatCharParam(char));
    }
    setSearchParams(next, { replace: true });
  };
  const history = useArmoryGearHistory(matched?.realm, matched?.name);
  const match = useMemo(
    () => (history.data ? buildCharacterMatch(history.data) : undefined),
    [history.data],
  );
  const coverage = stage && match ? stageCoverage(stage, match) : undefined;
  return {
    matched,
    setMatched,
    match,
    coverage,
    loading: !!matched && history.isLoading,
    error: history.isError,
  };
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

function ReadOnlyView({
  list,
  isOwner,
  controls,
  revisionNote,
}: {
  list: GearList;
  isOwner: boolean;
  controls?: React.ReactNode;
  revisionNote?: string;
}) {
  const payload = useMemo(() => parsePayload(list.payload), [list.payload]);
  const [stageIndex, setStageIndex] = useState(0);
  const [weightSel, setWeightSel] = useState<WeightSelection | null>(null);
  const [view, setView] = useState<"stage" | "matrix">("stage");
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const items = useListItems(useMemo(() => collectItemRefs(payload), [payload]));
  const stage = payload.stages[Math.min(stageIndex, Math.max(payload.stages.length - 1, 0))];
  const { scores, totalScore } = useStageScores(stage, weightSel?.weights ?? null);
  const charMatch = useCharacterMatchState(stage);
  const selectedEntry =
    selectedSlot != null && stage ? stage.slots[String(selectedSlot)] : undefined;

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-4">
      <ListHeader list={list} isOwner={isOwner} />
      {controls}
      {revisionNote && (
        <p className="rounded border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-blue-200">
          {revisionNote}
        </p>
      )}
      {list.description && <p className="text-sm text-zinc-400">{list.description}</p>}
      {payload.stages.length === 0 ? (
        <p className="text-sm text-zinc-500">This list has no stages yet.</p>
      ) : (
        <div className="space-y-4">
          <StatWeightsPanel classId={list.class_id} selection={weightSel} onSelect={setWeightSel} />
          <CharacterMatchPanel
            matched={charMatch.matched}
            onMatch={charMatch.setMatched}
            coverage={charMatch.coverage}
            historyLoading={charMatch.loading}
            historyError={charMatch.error}
          />
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
              <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] items-start">
                <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4 space-y-3">
                  <SetSummaryBar stage={stage} items={items} totalScore={totalScore} />
                  <BuilderDoll
                    stage={stage}
                    items={items}
                    scores={scores}
                    match={charMatch.match}
                    selectedSlot={selectedSlot ?? undefined}
                    onSelectSlot={(i) => setSelectedSlot((prev) => (prev === i ? null : i))}
                  />
                  <p className="text-2xs text-zinc-600">Click a slot to see its notes and alternates.</p>
                </div>
                {selectedSlot != null && selectedEntry ? (
                  <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-3 space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-200">{slotLabel(selectedSlot)}</h3>
                    <AlternatesEditor entry={selectedEntry} items={items} readOnly />
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-zinc-800 p-6 text-sm text-zinc-600">
                    Select a filled slot to see the author's notes and alternates.
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function EditorView({
  list,
  onViewRev,
}: {
  list: GearList;
  onViewRev: (rev: number | null) => void;
}) {
  const editor = useGearListEditor(list);
  const [stageIndex, setStageIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [weightSel, setWeightSel] = useState<WeightSelection | null>(null);
  const [view, setView] = useState<"stage" | "matrix">("stage");

  const items = useListItems(useMemo(() => collectItemRefs(editor.payload), [editor.payload]));
  const safeStageIndex = Math.min(stageIndex, Math.max(editor.payload.stages.length - 1, 0));
  const stage = editor.payload.stages[safeStageIndex];
  const { scores, totalScore } = useStageScores(stage, weightSel?.weights ?? null);
  const charMatch = useCharacterMatchState(stage);
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
      <RevisionControls
        list={list}
        isOwner
        viewedRev={null}
        onViewRev={onViewRev}
        dirty={editor.dirty}
      />
      {list.description && <p className="text-sm text-zinc-400">{list.description}</p>}

      {editor.payload.stages.length === 0 ? (
        <p className="text-sm text-zinc-500">This list has no stages yet.</p>
      ) : (
        <div className="space-y-4">
          <StatWeightsPanel classId={list.class_id} selection={weightSel} onSelect={setWeightSel} />
          <CharacterMatchPanel
            matched={charMatch.matched}
            onMatch={charMatch.setMatched}
            coverage={charMatch.coverage}
            historyLoading={charMatch.loading}
            historyError={charMatch.error}
          />
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
                  match={charMatch.match}
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
                onAddAlternate={(item) =>
                  editor.update((p) => addAlternate(p, safeStageIndex, selectedSlot, item.entry))
                }
                onClear={() =>
                  editor.update((p) => clearSlot(p, safeStageIndex, selectedSlot))
                }
                onClose={() => setSelectedSlot(null)}
                onSlotNote={(note) =>
                  editor.update((p) => setSlotNote(p, safeStageIndex, selectedSlot, note))
                }
                onAlternateNote={(itemId, note) =>
                  editor.update((p) => setAlternateNote(p, safeStageIndex, selectedSlot, itemId, note))
                }
                onPromoteAlternate={(itemId) =>
                  editor.update((p) => promoteAlternate(p, safeStageIndex, selectedSlot, itemId))
                }
                onRemoveAlternate={(itemId) =>
                  editor.update((p) => removeAlternate(p, safeStageIndex, selectedSlot, itemId))
                }
                onSetEnchant={(enchantId) =>
                  editor.update((p) => setSlotEnchant(p, safeStageIndex, selectedSlot, enchantId))
                }
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

  const [searchParams, setSearchParams] = useSearchParams();
  const revParam = parseInt(searchParams.get("rev") ?? "", 10);
  const viewedRev = Number.isInteger(revParam) && revParam > 0 ? revParam : null;
  const revision = useGearListRevision(listID, viewedRev);
  const setViewedRev = (rev: number | null) => {
    const next = new URLSearchParams(searchParams);
    if (rev == null) {
      next.delete("rev");
    } else {
      next.set("rev", String(rev));
    }
    setSearchParams(next, { replace: true });
  };

  if (list.isLoading || (viewedRev != null && revision.isLoading)) {
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

  if (viewedRev != null) {
    // A published revision is immutable; everyone (owner included) gets
    // the read-only view of its snapshotted content.
    const effective: GearList = revision.data
      ? {
          ...list.data,
          title: revision.data.title,
          description: revision.data.description,
          class_id: revision.data.class_id,
          spec_name: revision.data.spec_name,
          payload: revision.data.payload,
        }
      : list.data;
    return (
      <ReadOnlyView
        key={`${list.data.id}-rev-${viewedRev}`}
        list={effective}
        isOwner={isOwner}
        controls={
          <RevisionControls list={list.data} isOwner={isOwner} viewedRev={viewedRev} onViewRev={setViewedRev} />
        }
        revisionNote={
          revision.isError
            ? `Revision ${viewedRev} was not found — showing the live list instead.`
            : `Viewing published revision ${viewedRev} · ${revision.data ? new Date(revision.data.published_at).toLocaleDateString() : ""} · immutable`
        }
      />
    );
  }

  return isOwner ? (
    <EditorView key={list.data.id} list={list.data} onViewRev={setViewedRev} />
  ) : (
    <ReadOnlyView
      list={list.data}
      isOwner={false}
      controls={
        <RevisionControls list={list.data} isOwner={false} viewedRev={null} onViewRev={setViewedRev} />
      }
    />
  );
}
