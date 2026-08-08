import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, Pencil, Save } from "lucide-react";
import { useArmoryGearHistory, useArmoryPlayer, useSession } from "@/api/queries";
import { useGearTrends, useSharedGearList } from "@/api/gearBuilderQueries";
import { Button } from "@/components/ui/button";
import type { GearList, ItemSearchResult } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { gearClassById } from "../classInfo";
import { useSimItems } from "@/api/gamedata";
import { toast } from "sonner";
import {
  addAlternate,
  addStage,
  clearSlot,
  fillStageFromOutfit,
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
import { SlotEditorPanel, slotLabel, type EditorTab } from "./SlotEditorPanel";
import { AlternatesEditor } from "./AlternatesEditor";
import { SetSummaryBar } from "./SetSummaryBar";
import { StagesBar } from "./StagesBar";
import { ProgressionMatrix } from "./ProgressionMatrix";
import { ListActions } from "./ListActions";
import { buildCharacterMatch, stageCoverage, type CharacterMatch } from "./characterMatch";
import {
  CharacterMatchPanel,
  formatCharParam,
  parseCharParam,
  type MatchedCharacter,
} from "./CharacterMatchPanel";

/**
 * Per-slot and total weighted scores for one stage's primary items,
 * plus — when a character is matched — each slot's score difference
 * against the item the character is actually wearing there.
 */
function useStageScores(
  stage: GearStage | undefined,
  weights: StatWeights | null,
  match?: CharacterMatch,
): { scores?: Map<number, number>; totalScore?: number; wornDeltas?: Map<number, number> } {
  const pickIds =
    stage && weights
      ? Object.values(stage.slots)
          .filter((e) => !!e)
          .map((e) => e!.item_id)
      : [];
  const wornIds =
    stage && weights && match
      ? match.equippedSlots.filter((w): w is NonNullable<typeof w> => !!w).map((w) => w.item_id)
      : [];
  const simItems = useSimItems([...pickIds, ...wornIds]);
  if (!stage || !weights) return {};
  const scores = new Map<number, number>();
  const wornDeltas = new Map<number, number>();
  let totalScore = 0;
  for (const [key, entry] of Object.entries(stage.slots)) {
    if (!entry) continue;
    const sim = simItems.get(entry.item_id);
    if (!sim) continue;
    const score = scoreItem(sim, weights);
    const slotIndex = Number(key);
    scores.set(slotIndex, score);
    totalScore += score;

    const worn = match?.equippedSlots[slotIndex];
    if (worn && worn.item_id !== entry.item_id) {
      const wornSim = simItems.get(worn.item_id);
      if (wornSim) wornDeltas.set(slotIndex, score - scoreItem(wornSim, weights));
    }
  }
  return { scores, totalScore, wornDeltas: match ? wornDeltas : undefined };
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
  const player = useArmoryPlayer(matched?.realm, matched?.name);
  const match = useMemo(() => {
    // Either source alone is enough: history rows are newer infrastructure
    // and can be missing for characters the armory otherwise knows.
    if (!history.data && !player.data) return undefined;
    return buildCharacterMatch(history.data ?? { snapshots: [] }, player.data?.gear);
  }, [history.data, player.data?.gear]);
  const coverage = stage && match ? stageCoverage(stage, match) : undefined;
  return {
    matched,
    setMatched,
    match,
    coverage,
    loading: !!matched && (history.isLoading || player.isLoading),
    error: history.isError && player.isError,
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
  return (
    <div className="flex items-start gap-3">
      <Link to="/gear" className="text-zinc-500 hover:text-zinc-300 mt-1.5">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div className="min-w-0">
        <h1
          className="font-wow text-xl truncate"
          style={cls ? { color: getClassColorVar(cls.enumName) } : undefined}
        >
          {list.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
          {cls && (
            <span className="text-zinc-400">
              {list.spec_name ? `${list.spec_name} ${cls.name}` : cls.name}
            </span>
          )}
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
  headerRight,
}: {
  list: GearList;
  isOwner: boolean;
  controls?: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const payload = useMemo(() => parsePayload(list.payload), [list.payload]);
  const [stageIndex, setStageIndex] = useState(0);
  const [weightSel, setWeightSel] = useState<WeightSelection | null>(null);
  const [view, setView] = useState<"stage" | "matrix">("stage");
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const items = useListItems(useMemo(() => collectItemRefs(payload), [payload]));
  const stage = payload.stages[Math.min(stageIndex, Math.max(payload.stages.length - 1, 0))];
  const charMatch = useCharacterMatchState(stage);
  const { scores, totalScore, wornDeltas } = useStageScores(
    stage,
    weightSel?.weights ?? null,
    charMatch.match,
  );
  const selectedEntry =
    selectedSlot != null && stage ? stage.slots[String(selectedSlot)] : undefined;

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-4">
      <ListHeader list={list} isOwner={isOwner} right={headerRight} />
      {controls}
      {list.description && <p className="text-sm text-zinc-400">{list.description}</p>}
      {payload.stages.length === 0 ? (
        <p className="text-sm text-zinc-500">This list has no stages yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-2 items-start">
            <StatWeightsPanel classId={list.class_id} selection={weightSel} onSelect={setWeightSel} />
            <CharacterMatchPanel
              matched={charMatch.matched}
              onMatch={charMatch.setMatched}
              coverage={charMatch.coverage}
              historyLoading={charMatch.loading}
              historyError={charMatch.error}
            />
          </div>
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
              <div className="grid gap-4 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] items-start">
                <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4 space-y-3">
                  <SetSummaryBar stage={stage} items={items} totalScore={totalScore} />
                  <BuilderDoll
                    stage={stage}
                    items={items}
                    scores={scores}
                    wornDeltas={wornDeltas}
                    match={charMatch.match}
                    matchName={charMatch.matched?.name}
                    selectedSlot={selectedSlot ?? undefined}
                    onSelectSlot={(i) => setSelectedSlot((prev) => (prev === i ? null : i))}
                  />
                  <p className="text-2xs text-zinc-500">Click a slot to see its notes and alternates.</p>
                </div>
                {selectedSlot != null && selectedEntry ? (
                  <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-3 space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-200">{slotLabel(selectedSlot)}</h3>
                    <AlternatesEditor entry={selectedEntry} items={items} readOnly />
                  </div>
                ) : (
                  <div className="flex min-h-64 items-center justify-center self-stretch rounded-md border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">
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
  onLock,
}: {
  list: GearList;
  onLock: () => void;
}) {
  const editor = useGearListEditor(list);
  const [stageIndex, setStageIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("pick");
  const [weightSel, setWeightSel] = useState<WeightSelection | null>(null);
  const [view, setView] = useState<"stage" | "matrix">("stage");

  const items = useListItems(useMemo(() => collectItemRefs(editor.payload), [editor.payload]));
  const safeStageIndex = Math.min(stageIndex, Math.max(editor.payload.stages.length - 1, 0));
  const stage = editor.payload.stages[safeStageIndex];
  const charMatch = useCharacterMatchState(stage);
  const { scores, totalScore, wornDeltas } = useStageScores(
    stage,
    weightSel?.weights ?? null,
    charMatch.match,
  );
  const selectedEntry =
    selectedSlot != null && stage ? stage.slots[String(selectedSlot)] : undefined;

  // Observed cohort data feeds the picker's popularity bars, the
  // empty-search browse list, and the enchant quick-picks.
  const cls = gearClassById(list.class_id);
  const trends = useGearTrends(
    cls && list.spec_name ? { class: cls.enumName, spec: list.spec_name } : null,
  );
  const trendsBySlot = useMemo(
    () => new Map((trends.data?.slots ?? []).map((s) => [s.slot, s])),
    [trends.data],
  );

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
            <Button
              variant="outline"
              size="sm"
              disabled={editor.dirty}
              title={editor.dirty ? "Save your changes first" : "Locked, presentation-friendly view"}
              onClick={onLock}
            >
              <Eye className="h-4 w-4 mr-1" />
              View
            </Button>
            <Button size="sm" onClick={editor.save} disabled={!editor.dirty || editor.saving}>
              <Save className="h-4 w-4 mr-1" />
              {editor.saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      />
      <ListActions list={list} />
      {list.description && <p className="text-sm text-zinc-400">{list.description}</p>}

      {editor.payload.stages.length === 0 ? (
        <p className="text-sm text-zinc-500">This list has no stages yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-2 items-start">
            <StatWeightsPanel classId={list.class_id} selection={weightSel} onSelect={setWeightSel} />
            <CharacterMatchPanel
              matched={charMatch.matched}
              onMatch={charMatch.setMatched}
              coverage={charMatch.coverage}
              historyLoading={charMatch.loading}
              historyError={charMatch.error}
              onFillFrom={
                charMatch.match
                  ? () => {
                      const equipped = charMatch.match!.equippedSlots;
                      if (!equipped.some(Boolean)) {
                        toast.error(
                          `No equipped gear found for ${charMatch.matched?.name} — the armory has no logged outfit yet`,
                        );
                        return;
                      }
                      const fillable = equipped.filter(
                        (worn, i) => worn && !stage?.slots[String(i)],
                      ).length;
                      if (fillable === 0) {
                        toast.info("Every slot with logged gear is already filled");
                        return;
                      }
                      editor.update((p) =>
                        fillStageFromOutfit(p, safeStageIndex, equipped),
                      );
                      toast.success(
                        `Filled ${fillable} ${fillable === 1 ? "slot" : "slots"} from ${charMatch.matched?.name}'s equipped gear`,
                      );
                    }
                  : undefined
              }
            />
          </div>
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
                setEditorTab("pick");
                setView("stage");
              }}
            />
          ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] items-start">
            {stage && (
              <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4 space-y-3">
                <SetSummaryBar stage={stage} items={items} totalScore={totalScore} />
                <BuilderDoll
                  stage={stage}
                  items={items}
                  selectedSlot={selectedSlot ?? undefined}
                  onSelectSlot={(i) => {
                    setSelectedSlot((prev) => (prev === i ? null : i));
                    setEditorTab("pick");
                  }}
                  onEnchantSlot={(i) => {
                    setSelectedSlot(i);
                    setEditorTab("enchant");
                  }}
                  scores={scores}
                  wornDeltas={wornDeltas}
                  match={charMatch.match}
                  matchName={charMatch.matched?.name}
                />
                <p className="text-2xs text-zinc-500">Click a slot to pick its item.</p>
              </div>
            )}
            {selectedSlot != null ? (
              <SlotEditorPanel
                slotIndex={selectedSlot}
                tab={editorTab}
                onTabChange={setEditorTab}
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
                trendsSlot={trendsBySlot.get(selectedSlot)}
                weights={weightSel?.weights ?? null}
                equippedScore={scores?.get(selectedSlot)}
              />
            ) : (
              <div className="flex min-h-64 items-center justify-center self-stretch rounded-md border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">
                Select a slot on the paperdoll to search and equip items.
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

  // ?lock — the owner's read-only presentation mode (same idea as the
  // talent builder's lock param).
  const locked = searchParams.get("lock") != null;
  const setLocked = (on: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (on) {
      next.set("lock", "1");
    } else {
      next.delete("lock");
    }
    setSearchParams(next, { replace: true });
  };

  if (list.isLoading) {
    return <div className="p-8 text-center text-zinc-400">Loading gear list…</div>;
  }
  if (list.isError || !list.data) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p className="text-red-400 mb-2">Gear list not found.</p>
        <Link to="/gear" className="text-sm text-blue-400 hover:underline">
          Back to gear lists
        </Link>
      </div>
    );
  }

  const isOwner = !!session && session.user_id === list.data.user_id;

  if (isOwner && locked) {
    return (
      <ReadOnlyView
        key={`${list.data.id}-locked`}
        list={list.data}
        isOwner
        headerRight={
          <Button variant="outline" size="sm" onClick={() => setLocked(false)}>
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
        }
        controls={<ListActions list={list.data} />}
      />
    );
  }

  return isOwner ? (
    <EditorView key={list.data.id} list={list.data} onLock={() => setLocked(true)} />
  ) : (
    <ReadOnlyView
      list={list.data}
      isOwner={false}
      controls={<ListActions list={list.data} />}
    />
  );
}
