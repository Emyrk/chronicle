import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSession, useSiteConfig } from "@/api/queries";
import { useSharedGearProgression } from "@/api/gearProgressionQueries";
import type { GearProgression, ItemSearchResult } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { GEAR_PAYLOAD_VERSION, type GearStage } from "@/pages/Gear/builder/gearListModel";
import { BuilderDoll } from "@/pages/Gear/builder/BuilderDoll";
import { SetSummaryBar } from "@/pages/Gear/builder/SetSummaryBar";
import { SlotEditorPanel, type EditorTab } from "@/pages/Gear/builder/SlotEditorPanel";
import { StagesBar } from "@/pages/Gear/builder/StagesBar";
import { itemRefKey, useListItems, type ItemRef } from "@/pages/Gear/builder/useListItems";
import { gearClassById } from "../../classInfo";
import {
  addPoolItem,
  addProgressionStage,
  clearProgressionSlot,
  computeEquippedAtLevel,
  derivedStage,
  levelCapForFlavor,
  moveProgressionStage,
  nextUpgradesAfter,
  parseProgressionPayload,
  progressionColumns,
  removePoolItem,
  removeProgressionStage,
  renameProgressionStage,
  setProgressionSlotItem,
  snapshotStageFromDerived,
  stageAverageItemLevel,
  upgradeLevels,
  type PoolItemStats,
  type ProgressionPayload,
} from "../progressionModel";
import { LevelingScrubber } from "./LevelingScrubber";
import { ProgressionSwimlanes } from "./ProgressionSwimlanes";
import { SlotPoolList } from "./SlotPoolList";
import { useProgressionEditor } from "./useProgressionEditor";

/**
 * Which half of the journey the doll is showing. "level" derives its set
 * from the pool at the scrubbed level; "stage" shows a stored snapshot.
 */
type Axis = { kind: "level" } | { kind: "stage"; index: number };

/** Every item the document references, for tooltip hydration. */
function collectItemRefs(payload: ProgressionPayload): ItemRef[] {
  const refs: ItemRef[] = payload.pool.map((entry) => ({ itemId: entry.item_id }));
  for (const stage of payload.stages) {
    for (const entry of Object.values(stage.slots)) {
      if (entry) refs.push({ itemId: entry.item_id });
    }
  }
  return refs;
}

/** Everything the derivation needs, read off the hydrated item tooltips. */
function usePoolStats(
  payload: ProgressionPayload,
  items: ReturnType<typeof useListItems>,
): PoolItemStats[] {
  return useMemo(() => {
    const stats: PoolItemStats[] = [];
    for (const entry of payload.pool) {
      const tooltip = items.get(itemRefKey(entry.item_id))?.tooltip;
      if (!tooltip) continue;
      stats.push({
        item_id: entry.item_id,
        inventory_type: tooltip.inventory_type,
        required_level: tooltip.required_level ?? 0,
        item_level: tooltip.item_level ?? 0,
      });
    }
    return stats;
  }, [payload.pool, items]);
}

function ProgressionHeader({
  progression,
  isOwner,
  right,
}: {
  progression: GearProgression;
  isOwner: boolean;
  right?: React.ReactNode;
}) {
  const cls = gearClassById(progression.class_id);
  return (
    <div className="flex items-start gap-3">
      <Link to="/gear/progression" className="mt-1.5 text-zinc-500 hover:text-zinc-300">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div className="min-w-0">
        <h1
          className="truncate font-wow text-xl"
          style={cls ? { color: getClassColorVar(cls.enumName) } : undefined}
        >
          {progression.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
          {cls && (
            <span className="text-zinc-400">
              {progression.spec_name ? `${progression.spec_name} ${cls.name}` : cls.name}
            </span>
          )}
          {isOwner && <span>you own this progression</span>}
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
  view: "doll" | "swimlanes";
  onChange: (v: "doll" | "swimlanes") => void;
}) {
  return (
    <div className="flex items-center gap-1 text-xs">
      {(["doll", "swimlanes"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded border px-2.5 py-1 transition-colors",
            view === v
              ? "border-blue-500 bg-blue-500/10 text-white"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
          )}
        >
          {v === "doll" ? "Paperdoll" : "Swimlanes"}
        </button>
      ))}
    </div>
  );
}

function ProgressionView({
  progression,
  isOwner,
}: {
  progression: GearProgression;
  isOwner: boolean;
}) {
  const editor = useProgressionEditor(progression);
  const { data: siteConfig } = useSiteConfig();
  const levelCap = levelCapForFlavor(siteConfig?.dataset_flavor ?? []);

  const serverPayload = useMemo(
    () => parseProgressionPayload(progression.payload),
    [progression.payload],
  );
  const payload = isOwner ? editor.payload : serverPayload;

  const [level, setLevel] = useState(levelCap);
  const [axis, setAxis] = useState<Axis>({ kind: "level" });
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("pick");
  const [view, setView] = useState<"doll" | "swimlanes">("doll");

  const items = useListItems(useMemo(() => collectItemRefs(payload), [payload]));
  const poolStats = usePoolStats(payload, items);

  const clampedLevel = Math.min(Math.max(level, 1), levelCap);
  const equipped = useMemo(
    () => computeEquippedAtLevel(poolStats, clampedLevel),
    [poolStats, clampedLevel],
  );
  const ticks = useMemo(() => upgradeLevels(poolStats, levelCap), [poolStats, levelCap]);
  const columns = useMemo(() => progressionColumns(poolStats, levelCap), [poolStats, levelCap]);
  const nextUpgradeIds = useMemo(
    () => nextUpgradesAfter(poolStats, clampedLevel, levelCap),
    [poolStats, clampedLevel, levelCap],
  );

  const itemLevelOf = (itemId: number) => items.get(itemRefKey(itemId))?.itemLevel ?? null;

  // Per-slot "next upgrade at level N is X", resolved to display names.
  const nextUpgrades = useMemo(() => {
    const out = new Map<number, { level: number; name: string }>();
    for (const [slot, up] of nextUpgradeIds) {
      out.set(slot, {
        level: up.level,
        name: items.get(itemRefKey(up.itemId))?.name || `Item #${up.itemId}`,
      });
    }
    return out;
  }, [nextUpgradeIds, items]);

  // Both halves feed the very same paperdoll: the levelling axis just
  // synthesises its stage from the pool instead of reading a stored one.
  const levelStage = useMemo(
    () => derivedStage(`Level ${clampedLevel}`, equipped, payload.pool),
    [clampedLevel, equipped, payload.pool],
  );
  const stageIndex = axis.kind === "stage" ? Math.min(axis.index, payload.stages.length - 1) : -1;
  const activeStage: GearStage =
    axis.kind === "stage" && payload.stages[stageIndex] ? payload.stages[stageIndex] : levelStage;

  const selectedEntry = selectedSlot != null ? activeStage.slots[String(selectedSlot)] : undefined;

  const stageSubLabels = payload.stages.map((s) => {
    const avg = stageAverageItemLevel(s, itemLevelOf);
    return avg != null ? `ilvl ${avg.toFixed(1)}` : undefined;
  });

  const selectStage = (index: number) => {
    setAxis({ kind: "stage", index });
    setEditorTab("pick");
  };

  /**
   * Equipping means different things on the two axes: on the levelling
   * axis you are adding a candidate to the pool (the derivation decides
   * whether it wins the slot); on a stage you are setting the pick.
   */
  const equip = (item: ItemSearchResult) => {
    if (axis.kind === "stage") {
      if (selectedSlot == null) return;
      editor.update((p) => setProgressionSlotItem(p, stageIndex, selectedSlot, item.entry));
      return;
    }
    editor.update((p) => addPoolItem(p, item.entry));
  };

  const clearSelected = () => {
    if (selectedSlot == null) return;
    if (axis.kind === "stage") {
      editor.update((p) => clearProgressionSlot(p, stageIndex, selectedSlot));
      return;
    }
    // On the levelling axis the slot is derived — "clear" means dropping
    // the winning candidate out of the pool.
    const winner = equipped[selectedSlot];
    if (winner != null) editor.update((p) => removePoolItem(p, winner));
  };

  const snapshotAtCap = () => {
    const atCap = computeEquippedAtLevel(poolStats, levelCap);
    if (Object.keys(atCap).length === 0) {
      toast.error(`Nothing in the pool is wearable at level ${levelCap} yet`);
      return;
    }
    const target = payload.stages.length === 0 ? 0 : Math.max(stageIndex, 0);
    editor.update((p) => {
      const withStage = p.stages.length === 0 ? addProgressionStage(p, `Fresh ${levelCap}`) : p;
      return snapshotStageFromDerived(withStage, target, atCap);
    });
    selectStage(target);
    toast.success(`Seeded from the pool at level ${levelCap}`);
  };

  const onLevelAxis = axis.kind === "level";

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <ProgressionHeader
        progression={progression}
        isOwner={isOwner}
        right={
          isOwner ? (
            <div className="flex items-center gap-2">
              {editor.dirty && <span className="text-xs text-amber-400">unsaved changes</span>}
              <Button size="sm" onClick={editor.save} disabled={!editor.dirty || editor.saving}>
                <Save className="mr-1 h-4 w-4" />
                {editor.saving ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : undefined
        }
      />
      {progression.description && (
        <p className="text-sm text-zinc-400">{progression.description}</p>
      )}

      {/* The levelling axis. The scrubber stays visible on both axes so
          the "next upgrade" annotations always have a reference level. */}
      <div
        className={cn(
          "rounded-md border p-3 transition-colors",
          onLevelAxis ? "border-blue-500/40 bg-blue-500/5" : "border-zinc-700/60 bg-zinc-900/40",
        )}
      >
        <LevelingScrubber
          level={clampedLevel}
          minLevel={1}
          maxLevel={levelCap}
          onChange={(next) => {
            setLevel(next);
            setAxis({ kind: "level" });
          }}
          upgradeLevels={ticks}
        />
      </div>

      {/* Stages are a peer of the level axis, not a separate section:
          the same tab strip the gear-list builder uses. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setAxis({ kind: "level" })}
          className={cn(
            "rounded border px-3 py-1.5 text-left text-sm transition-colors",
            onLevelAxis
              ? "border-blue-500 bg-blue-500/10 text-white"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
          )}
        >
          <span className="block leading-tight">Levelling</span>
          <span className="block font-mono text-2xs leading-tight text-zinc-500">
            Lv {clampedLevel}
          </span>
        </button>
        <StagesBar
          payload={{ version: GEAR_PAYLOAD_VERSION, stages: payload.stages }}
          stageIndex={stageIndex}
          onSelect={selectStage}
          subLabels={stageSubLabels}
          onAdd={isOwner ? () => editor.update((p) => addProgressionStage(p)) : undefined}
          onRename={
            isOwner
              ? (i, name) => editor.update((p) => renameProgressionStage(p, i, name))
              : undefined
          }
          onRemove={isOwner ? (i) => editor.update((p) => removeProgressionStage(p, i)) : undefined}
          onMove={
            isOwner
              ? (from, to) => editor.update((p) => moveProgressionStage(p, from, to))
              : undefined
          }
        />
        <div className="flex-1" />
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={snapshotAtCap}
            title={`Seed this stage from the pool evaluated at level ${levelCap}`}
          >
            <Camera className="mr-1 h-3.5 w-3.5" />
            Snapshot at cap
          </Button>
        )}
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "swimlanes" ? (
        <ProgressionSwimlanes
          columns={columns}
          items={items}
          currentLevel={onLevelAxis ? clampedLevel : undefined}
          onCellClick={(cellLevel, slotIndex) => {
            setLevel(cellLevel);
            setAxis({ kind: "level" });
            setSelectedSlot(slotIndex);
            setEditorTab("pick");
            setView("doll");
          }}
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
          <div className="space-y-3 rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4">
            <SetSummaryBar stage={activeStage} items={items} />
            <BuilderDoll
              stage={activeStage}
              items={items}
              selectedSlot={selectedSlot ?? undefined}
              onSelectSlot={
                isOwner
                  ? (i) => {
                      setSelectedSlot((prev) => (prev === i ? null : i));
                      setEditorTab("pick");
                    }
                  : undefined
              }
              nextUpgrades={onLevelAxis ? nextUpgrades : undefined}
            />
            <p className="text-2xs text-zinc-500">
              {onLevelAxis
                ? "Derived from your pool at this level — click a slot to see and edit its candidates."
                : "Click a slot to pick its item for this stage."}
            </p>
          </div>
          {selectedSlot != null && isOwner ? (
            <SlotEditorPanel
              slotIndex={selectedSlot}
              tab={editorTab}
              onTabChange={setEditorTab}
              entry={selectedEntry}
              items={items}
              onEquip={equip}
              equipLabel={onLevelAxis ? "Add to pool" : "Set"}
              characterLevel={onLevelAxis ? clampedLevel : levelCap}
              // The levelling half has no stored per-slot metadata to edit.
              tabs={onLevelAxis ? ["pick"] : undefined}
              beforePicker={
                onLevelAxis ? (
                  <SlotPoolList
                    slotIndex={selectedSlot}
                    pool={payload.pool}
                    items={items}
                    equippedItemId={equipped[selectedSlot]}
                    level={clampedLevel}
                    onRemove={(itemId) => editor.update((p) => removePoolItem(p, itemId))}
                  />
                ) : undefined
              }
              onAddAlternate={() => undefined}
              onClear={clearSelected}
              onClose={() => setSelectedSlot(null)}
              onSlotNote={() => undefined}
              onAlternateNote={() => undefined}
              onPromoteAlternate={() => undefined}
              onRemoveAlternate={() => undefined}
              onSetEnchant={() => undefined}
            />
          ) : (
            <div className="flex min-h-64 items-center justify-center self-stretch rounded-md border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">
              {isOwner
                ? "Select a slot on the paperdoll to search and add items."
                : "Read-only view."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Gear progression builder/viewer. Deliberately the gear-list builder's
 * ergonomics — same paperdoll, slot editor, and stage tabs — with a level
 * scrubber added and the pool standing in for stored picks on the
 * levelling half.
 */
export function GearProgressionPage() {
  const { progressionID } = useParams<{ progressionID: string }>();
  const { data: session } = useSession();
  const progression = useSharedGearProgression(progressionID);

  if (progression.isLoading) {
    return <div className="p-8 text-center text-zinc-400">Loading progression…</div>;
  }
  if (progression.isError || !progression.data) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p className="mb-2 text-red-400">Progression not found.</p>
        <Link to="/gear/progression" className="text-sm text-blue-400 hover:underline">
          Back to progressions
        </Link>
      </div>
    );
  }

  const isOwner = !!session && session.user_id === progression.data.user_id;
  return (
    <ProgressionView key={progression.data.id} progression={progression.data} isOwner={isOwner} />
  );
}
