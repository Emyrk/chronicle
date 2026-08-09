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
  addProgressionAlternate,
  addProgressionStage,
  clearProgressionSlot,
  computeEquippedAtLevel,
  derivedStage,
  levelCapForFlavor,
  moveProgressionStage,
  nextUpgradesAfter,
  parseProgressionPayload,
  progressionColumns,
  promoteProgressionAlternate,
  removePoolItem,
  removeProgressionAlternate,
  removeProgressionStage,
  renameProgressionStage,
  setProgressionAlternateNote,
  setProgressionSlotEnchant,
  setProgressionSlotItem,
  setProgressionSlotNote,
  setProgressionLevelingDisabled,
  setProgressionStageLevel,
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
      if (entry) refs.push({ itemId: entry.item_id, enchantId: entry.enchant_id });
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
  const [axis, setAxis] = useState<Axis>(() =>
    serverPayload.leveling_disabled && serverPayload.stages.length > 0
      ? { kind: "stage", index: 0 }
      : { kind: "level" },
  );
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

  // A stage may pin its own character level; unset means the slider is
  // disabled for the stage and the level cap is assumed. The document can
  // also turn its whole levelling half off, which locks the level axis to
  // the cap.
  const levelingDisabled = payload.leveling_disabled ?? false;
  const stageLevel = axis.kind === "stage" ? payload.stages[stageIndex]?.level : undefined;
  const effectiveLevel =
    axis.kind === "stage" ? (stageLevel ?? levelCap) : levelingDisabled ? levelCap : clampedLevel;

  const stageSubLabels = payload.stages.map((s) => {
    const avg = stageAverageItemLevel(s, itemLevelOf);
    const parts = [
      s.level != null ? `Lv ${s.level}` : undefined,
      avg != null ? `ilvl ${avg.toFixed(1)}` : undefined,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : undefined;
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

  /**
   * Apply one of the stage-slot operations to the selected stage slot.
   * Only reachable on the stage axis — the levelling half has no stored
   * entry to annotate, and hides those tabs.
   */
  const editStageSlot = <A extends unknown[]>(
    op: (p: ProgressionPayload, stage: number, slot: number, ...rest: A) => ProgressionPayload,
    ...args: A
  ) => {
    if (axis.kind !== "stage" || selectedSlot == null) return;
    editor.update((p) => op(p, stageIndex, selectedSlot, ...args));
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

      {/* The level slider follows the active axis: on the levelling axis
          it scrubs the derived set; on a stage it shows (and, when the
          stage's level is enabled, edits) the level that stage assumes.
          One toggle governs both: on the Levelling tab it turns the
          document's progressive-gear half on/off, on a stage it pins or
          releases that stage's level. Viewers of a leveling-disabled
          document see no panel at all. */}
      {(isOwner || !levelingDisabled) && (
        <div
          className={cn(
            "space-y-2 rounded-md border p-3 transition-colors",
            onLevelAxis && !levelingDisabled
              ? "border-blue-500/40 bg-blue-500/5"
              : "border-zinc-700/60 bg-zinc-900/40",
          )}
        >
          <LevelingScrubber
            level={effectiveLevel}
            minLevel={1}
            maxLevel={levelCap}
            disabled={
              onLevelAxis ? levelingDisabled : stageLevel == null || !isOwner
            }
            onChange={(next) => {
              if (onLevelAxis) {
                setLevel(next);
                return;
              }
              if (isOwner && stageLevel != null) {
                editor.update((p) => setProgressionStageLevel(p, stageIndex, next));
              }
            }}
            upgradeLevels={levelingDisabled ? [] : ticks}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {isOwner && (
              <label className="flex cursor-pointer select-none items-center gap-1.5 text-zinc-400">
                <input
                  type="checkbox"
                  className="accent-blue-500"
                  checked={onLevelAxis ? !levelingDisabled : stageLevel != null}
                  onChange={(e) =>
                    editor.update((p) =>
                      onLevelAxis
                        ? setProgressionLevelingDisabled(p, !e.target.checked)
                        : setProgressionStageLevel(
                            p,
                            stageIndex,
                            e.target.checked ? levelCap : undefined,
                          ),
                    )
                  }
                />
                Enable progressive gear
              </label>
            )}
            {(onLevelAxis ? levelingDisabled : stageLevel == null) && (
              <span>Assumes max level ({levelCap}).</span>
            )}
          </div>
        </div>
      )}

      {/* Stages are a peer of the level axis, not a separate section:
          the same tab strip the gear-list builder uses. */}
      <div className="flex flex-wrap items-center gap-3">
        {(isOwner || !levelingDisabled) && (
          <button
            type="button"
            onClick={() => setAxis({ kind: "level" })}
            className={cn(
              "rounded border px-3 py-1.5 text-left text-sm transition-colors",
              onLevelAxis
                ? "border-blue-500 bg-blue-500/10 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
              levelingDisabled && "opacity-60",
            )}
          >
            <span className="block leading-tight">Levelling</span>
            <span className="block font-mono text-2xs leading-tight text-zinc-500">
              {levelingDisabled ? "off" : `Lv ${clampedLevel}`}
            </span>
          </button>
        )}
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
        {!levelingDisabled && <ViewToggle view={view} onChange={setView} />}
      </div>

      {view === "swimlanes" && !levelingDisabled ? (
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
              onEnchantSlot={
                isOwner && axis.kind === "stage"
                  ? (i) => {
                      setSelectedSlot(i);
                      setEditorTab("enchant");
                    }
                  : undefined
              }
              nextUpgrades={onLevelAxis && !levelingDisabled ? nextUpgrades : undefined}
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
              characterLevel={effectiveLevel}
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
              onAddAlternate={(item) => editStageSlot(addProgressionAlternate, item.entry)}
              onClear={clearSelected}
              onClose={() => setSelectedSlot(null)}
              onSlotNote={(note) => editStageSlot(setProgressionSlotNote, note)}
              onAlternateNote={(itemId, note) =>
                editStageSlot(setProgressionAlternateNote, itemId, note)
              }
              onPromoteAlternate={(itemId) => editStageSlot(promoteProgressionAlternate, itemId)}
              onRemoveAlternate={(itemId) => editStageSlot(removeProgressionAlternate, itemId)}
              onSetEnchant={(enchantId) => editStageSlot(setProgressionSlotEnchant, enchantId)}
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
