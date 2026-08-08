import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSession, useSiteConfig } from "@/api/queries";
import { useSharedGearProgression } from "@/api/gearProgressionQueries";
import type { GearProgression, ItemSearchResult } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { ItemPickerPanel } from "@/pages/Gear/builder/ItemPickerPanel";
import { slotLabel } from "@/pages/Gear/builder/SlotEditorPanel";
import { COSMETIC_SLOTS, SLOT_COUNT } from "@/pages/Gear/builder/gearListModel";
import { itemRefKey, useListItems, type ItemRef } from "@/pages/Gear/builder/useListItems";
import { gearClassById } from "../../classInfo";
import {
  addPoolItem,
  addProgressionStage,
  clearProgressionSlot,
  computeEquippedAtLevel,
  derivedAverageItemLevel,
  levelCapForFlavor,
  moveProgressionStage,
  parseProgressionPayload,
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
import { DerivedSlotGrid } from "./DerivedSlotGrid";
import { LevelingScrubber } from "./LevelingScrubber";
import { PoolPanel } from "./PoolPanel";
import { StageScrubber, type StageStop } from "./StageScrubber";
import { StageSlotGrid } from "./StageSlotGrid";
import { useProgressionEditor } from "./useProgressionEditor";

const NON_COSMETIC_SLOTS = SLOT_COUNT - COSMETIC_SLOTS.size;

/**
 * Every item the document references, for tooltip hydration. Refs are
 * deliberately enchant-free: the progression views show item identity and
 * item level only, so one fetch per item keeps every lookup on one key.
 */
function collectItemRefs(payload: ProgressionPayload): ItemRef[] {
  const refs: ItemRef[] = payload.pool.map((entry) => ({ itemId: entry.item_id }));
  for (const stage of payload.stages) {
    for (const entry of Object.values(stage.slots)) {
      if (entry) refs.push({ itemId: entry.item_id });
    }
  }
  return refs;
}

/**
 * Everything the leveling derivation needs, read off the hydrated item
 * tooltips. Items still loading are left out — they reappear as soon as
 * their tooltip lands.
 */
function usePoolStats(payload: ProgressionPayload, items: ReturnType<typeof useListItems>) {
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
          className="font-wow text-xl truncate"
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

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-0.5">
      <h2 className="font-wow text-lg text-amber-100/90">{title}</h2>
      <p className="text-xs text-zinc-500">{subtitle}</p>
    </div>
  );
}

interface ProgressionViewProps {
  progression: GearProgression;
  isOwner: boolean;
}

function ProgressionView({ progression, isOwner }: ProgressionViewProps) {
  const editor = useProgressionEditor(progression);
  const { data: siteConfig } = useSiteConfig();
  const levelCap = levelCapForFlavor(siteConfig?.dataset_flavor ?? []);

  // Read-only viewers still get the derived scrubbers, just no controls.
  const serverPayload = useMemo(
    () => parseProgressionPayload(progression.payload),
    [progression.payload],
  );
  const payload = isOwner ? editor.payload : serverPayload;

  const [level, setLevel] = useState(Math.max(1, levelCap - 1));
  const [stageIndex, setStageIndex] = useState(0);
  const [stageSlot, setStageSlot] = useState<number | null>(null);

  const items = useListItems(useMemo(() => collectItemRefs(payload), [payload]));
  const poolStats = usePoolStats(payload, items);

  const clampedLevel = Math.min(Math.max(level, 1), Math.max(1, levelCap - 1));
  const equipped = useMemo(
    () => computeEquippedAtLevel(poolStats, clampedLevel),
    [poolStats, clampedLevel],
  );
  const previousEquipped = useMemo(
    () => computeEquippedAtLevel(poolStats, Math.max(1, clampedLevel - 1)),
    [poolStats, clampedLevel],
  );
  const atCap = useMemo(() => computeEquippedAtLevel(poolStats, levelCap), [poolStats, levelCap]);
  const ticks = useMemo(
    () => upgradeLevels(poolStats, Math.max(1, levelCap - 1)),
    [poolStats, levelCap],
  );

  const itemLevelOf = (itemId: number) => items.get(itemRefKey(itemId))?.itemLevel ?? null;

  const filledSlots = Object.keys(equipped)
    .map(Number)
    .filter((slot) => !COSMETIC_SLOTS.has(slot)).length;

  const safeStageIndex = Math.min(stageIndex, Math.max(payload.stages.length - 1, 0));
  const stage = payload.stages[safeStageIndex];
  const stops: StageStop[] = payload.stages.map((s) => ({
    stage: s,
    averageItemLevel: stageAverageItemLevel(s, itemLevelOf),
    filledSlots: Object.values(s.slots).filter(Boolean).length,
  }));

  const snapshotAtCap = () => {
    if (Object.keys(atCap).length === 0) {
      toast.error(`Nothing in the pool is wearable at level ${levelCap} yet`);
      return;
    }
    editor.update((p) => {
      const withStage = p.stages.length === 0 ? addProgressionStage(p, `Fresh ${levelCap}`) : p;
      const target = p.stages.length === 0 ? 0 : safeStageIndex;
      return snapshotStageFromDerived(withStage, target, atCap);
    });
    if (payload.stages.length === 0) setStageIndex(0);
    toast.success(`Seeded from the pool at level ${levelCap}`);
  };

  const equipInStage = (item: ItemSearchResult) => {
    if (stageSlot == null) return;
    editor.update((p) => setProgressionSlotItem(p, safeStageIndex, stageSlot, item.entry));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
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

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <PoolPanel
          pool={payload.pool}
          items={items}
          onAdd={isOwner ? (itemId) => editor.update((p) => addPoolItem(p, itemId)) : undefined}
          onRemove={
            isOwner ? (itemId) => editor.update((p) => removePoolItem(p, itemId)) : undefined
          }
        />

        <div className="space-y-6">
          <section className="space-y-3 rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4">
            <SectionHeading
              title="Leveling"
              subtitle={`Best-per-slot derived from the pool at each level, 1 to ${Math.max(1, levelCap - 1)}. Nothing here is stored.`}
            />
            <LevelingScrubber
              level={clampedLevel}
              minLevel={1}
              maxLevel={Math.max(1, levelCap - 1)}
              onChange={setLevel}
              upgradeLevels={ticks}
              averageItemLevel={derivedAverageItemLevel(equipped, itemLevelOf)}
              filledSlots={filledSlots}
              totalSlots={NON_COSMETIC_SLOTS}
            />
            <DerivedSlotGrid
              equipped={equipped}
              previous={clampedLevel > 1 ? previousEquipped : undefined}
              items={items}
            />
          </section>

          <section className="space-y-3 rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4">
            <div className="flex flex-wrap items-start gap-2">
              <SectionHeading
                title={`Max level (${levelCap})`}
                subtitle="Explicit snapshots — at cap, upgrades come in tiers and the best set is a judgement call."
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
            </div>

            <StageScrubber
              stops={stops}
              stageIndex={safeStageIndex}
              onSelect={(i) => {
                setStageIndex(i);
                setStageSlot(null);
              }}
              onAdd={isOwner ? () => editor.update((p) => addProgressionStage(p)) : undefined}
              onRename={
                isOwner
                  ? (i, name) => editor.update((p) => renameProgressionStage(p, i, name))
                  : undefined
              }
              onRemove={
                isOwner ? (i) => editor.update((p) => removeProgressionStage(p, i)) : undefined
              }
              onMove={
                isOwner
                  ? (from, to) => editor.update((p) => moveProgressionStage(p, from, to))
                  : undefined
              }
            />

            {stage && (
              <div className="grid items-start gap-4 xl:grid-cols-2">
                <StageSlotGrid
                  stage={stage}
                  previous={safeStageIndex > 0 ? payload.stages[safeStageIndex - 1] : undefined}
                  items={items}
                  selectedSlot={stageSlot ?? undefined}
                  onSelectSlot={
                    isOwner
                      ? (slot) => setStageSlot((prev) => (prev === slot ? null : slot))
                      : undefined
                  }
                  onClearSlot={
                    isOwner
                      ? (slot) => editor.update((p) => clearProgressionSlot(p, safeStageIndex, slot))
                      : undefined
                  }
                />
                {isOwner &&
                  (stageSlot != null ? (
                    <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
                      <div className="text-xs text-zinc-400">
                        Picking {slotLabel(stageSlot)} for{" "}
                        {stage.name || `stage ${safeStageIndex + 1}`}
                      </div>
                      <ItemPickerPanel
                        slotIndex={stageSlot}
                        usedItemIds={
                          new Set(
                            [stage.slots[String(stageSlot)]?.item_id].filter(
                              (id): id is number => id != null,
                            ),
                          )
                        }
                        equipLabel="Set"
                        onEquip={equipInStage}
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-40 items-center justify-center self-stretch rounded-md border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">
                      Select a slot to pick its item for this stage.
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Gear progression builder/viewer. Owners edit; everyone else gets the
 * same two scrubbers without controls.
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
    <ProgressionView
      key={progression.data.id}
      progression={progression.data}
      isOwner={isOwner}
    />
  );
}
