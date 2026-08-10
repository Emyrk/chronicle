import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  LayoutGrid,
  Pencil,
  Plus,
  Shirt,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useArmoryGearHistory,
  useArmoryPlayer,
  useSession,
  useSiteConfig,
} from "@/api/queries";
import { useSharedGearProgression } from "@/api/gearProgressionQueries";
import type { GearProgression, ItemSearchResult } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import {
  GEAR_PAYLOAD_VERSION,
  type GearStage,
} from "@/pages/Gear/builder/gearListModel";
import {
  CharacterMatchPanel,
  formatCharParam,
  parseCharParam,
  type MatchedCharacter,
} from "@/pages/Gear/builder/CharacterMatchPanel";
import {
  buildCharacterMatch,
  progressionStageCoverage,
  stageCoverage,
  type CharacterMatch,
} from "@/pages/Gear/builder/characterMatch";
import { ArmoryDoll } from "@/pages/Gear/builder/ArmoryDoll";
import { BuilderDoll } from "@/pages/Gear/builder/BuilderDoll";
import { SetSummaryBar } from "@/pages/Gear/builder/SetSummaryBar";
import { GearAnalysisSheet } from "@/pages/Gear/builder/GearAnalysisSheet";
import { useGearAnalysis } from "@/pages/Gear/builder/useGearAnalysis";
import {
  SlotEditorPanel,
  type EditorTab,
} from "@/pages/Gear/builder/SlotEditorPanel";
import {
  StagesBar,
  type StageProgressIndicator,
} from "@/pages/Gear/builder/StagesBar";
import {
  itemRefKey,
  stageWithValidWeaponSlots,
  useListItems,
  type ItemRef,
} from "@/pages/Gear/builder/useListItems";
import {
  gearClassById,
  gearClassesForFlavor,
  type GearClassInfo,
} from "../../classInfo";
import {
  addProgressionAlternate,
  addProgressionStage,
  addProgressionTag,
  clearProgressionSlot,
  levelCapForFlavor,
  moveProgressionStage,
  parseProgressionPayload,
  promoteProgressionAlternate,
  removeProgressionAlternate,
  removeProgressionStage,
  removeProgressionTag,
  renameProgressionStage,
  resolveProgressionStage,
  setProgressionAlternateNote,
  setProgressionAnalysisProfile,
  setProgressionSlotEnchant,
  setProgressionSlotItem,
  setProgressionSlotNote,
  stageAverageItemLevel,
  MAX_PROGRESSION_TAG_LENGTH,
  type ProgressionPayload,
} from "../progressionModel";
import { ProgressionStageGrid } from "./ProgressionStageGrid";
import { useProgressionEditor } from "./useProgressionEditor";

/** Item details needed by the currently displayed stage. */
function collectStageItemRefs(stage: GearStage): ItemRef[] {
  const refs: ItemRef[] = [];
  for (const entry of Object.values(stage.slots)) {
    if (!entry) continue;
    refs.push({ itemId: entry.item_id, enchantId: entry.enchant_id });
    for (const alternate of entry.alternates ?? []) {
      refs.push({ itemId: alternate.item_id });
    }
  }
  return refs;
}

function collectPayloadItemRefs(payload: ProgressionPayload): ItemRef[] {
  return payload.stages.flatMap(collectStageItemRefs);
}

type ProgressionViewMode = "doll" | "grid";

function ProgressionViewToggle({
  view,
  onChange,
}: {
  view: ProgressionViewMode;
  onChange: (view: ProgressionViewMode) => void;
}) {
  const options = [
    { id: "doll" as const, label: "Paperdoll", icon: Shirt },
    { id: "grid" as const, label: "Grid", icon: LayoutGrid },
  ];
  return (
    <div className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-950/60 p-0.5">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs transition-colors",
            view === id
              ? "bg-zinc-800 text-zinc-100 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function ProgressionHeader({
  title,
  classId,
  specName,
  classes,
  level,
  tags,
  onTitleChange,
  onClassChange,
  onSpecChange,
  onAddTag,
  onRemoveTag,
  right,
}: {
  title: string;
  classId: number;
  specName: string;
  classes: readonly GearClassInfo[];
  level: number;
  tags: readonly string[];
  onTitleChange?: (title: string) => void;
  onClassChange?: (classId: number) => void;
  onSpecChange?: (specName: string) => void;
  onAddTag?: (tag: string) => void;
  onRemoveTag?: (tag: string) => void;
  right?: React.ReactNode;
}) {
  const cls = gearClassById(classId);
  const classSpec = cls
    ? specName
      ? `${specName} ${cls.name}`
      : cls.name
    : "Gear Progression";
  const accentColor = cls ? getClassColorVar(cls.enumName) : undefined;
  const canEditMetadata = !!onTitleChange && !!onClassChange && !!onSpecChange;
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  const submitTag = () => {
    const tag = tagDraft.trim();
    if (tag) onAddTag?.(tag);
    setTagDraft("");
    setAddingTag(false);
  };

  return (
    <header className="relative -mx-4 -mt-6 border-y border-zinc-800 bg-zinc-900/35 px-4 py-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:-mx-10 xl:px-10 2xl:-mx-12 2xl:px-12">
      <div
        className="absolute left-5 top-0 h-px w-40 opacity-80"
        style={{ backgroundColor: accentColor }}
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Link
            to="/gear/progression"
            aria-label="Back to gear progressions"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div
            className="h-[3.25rem] w-1 shrink-0 rounded-full opacity-90"
            style={{ backgroundColor: accentColor }}
          />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              {editingMetadata && onTitleChange ? (
                <input
                  autoFocus
                  value={title}
                  onChange={(event) => onTitleChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" || event.key === "Enter") {
                      event.preventDefault();
                      setEditingMetadata(false);
                    }
                  }}
                  maxLength={128}
                  aria-label="Progression name"
                  className="block w-full min-w-48 border-b border-zinc-700 bg-transparent font-wow text-2xl leading-tight text-zinc-100 outline-none transition-colors focus:border-current"
                  style={{ borderColor: accentColor }}
                />
              ) : (
                <h1 className="truncate font-wow text-2xl leading-tight text-zinc-100">
                  {title}
                </h1>
              )}
              {canEditMetadata && (
                <button
                  type="button"
                  aria-label={
                    editingMetadata
                      ? "Finish editing progression details"
                      : "Edit progression details"
                  }
                  title={
                    editingMetadata
                      ? "Done editing"
                      : "Edit name, class, and spec"
                  }
                  onClick={() => setEditingMetadata((editing) => !editing)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
                >
                  {editingMetadata ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Pencil className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
              {editingMetadata && onClassChange && onSpecChange ? (
                <>
                  <select
                    value={classId}
                    aria-label="Progression class"
                    onChange={(event) =>
                      onClassChange(Number(event.target.value))
                    }
                    style={
                      cls
                        ? { color: getClassColorVar(cls.enumName) }
                        : undefined
                    }
                    className="h-6 rounded border border-zinc-700/70 bg-zinc-950/70 px-1.5 text-xs outline-none transition-colors hover:border-zinc-600 focus:border-amber-300/60"
                  >
                    {classes.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={specName}
                    aria-label="Progression specialization"
                    onChange={(event) => onSpecChange(event.target.value)}
                    className="h-6 rounded border border-zinc-700/70 bg-zinc-950/70 px-1.5 text-xs text-zinc-300 outline-none transition-colors hover:border-zinc-600 focus:border-amber-300/60"
                  >
                    <option value="">Any spec</option>
                    {(cls?.specs ?? []).map((spec) => (
                      <option key={spec} value={spec}>
                        {spec}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span
                  style={
                    cls ? { color: getClassColorVar(cls.enumName) } : undefined
                  }
                >
                  {classSpec}
                </span>
              )}
              <MetadataSeparator />
              <span>Level {level}</span>
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="group inline-flex items-center gap-1.5"
                >
                  <MetadataSeparator />
                  <span>{tag}</span>
                  {onRemoveTag && (
                    <button
                      type="button"
                      aria-label={`Remove ${tag} tag`}
                      onClick={() => onRemoveTag(tag)}
                      className="text-zinc-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
              {onAddTag &&
                (addingTag ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitTag();
                    }}
                    className="inline-flex items-center gap-1.5"
                  >
                    <MetadataSeparator />
                    <input
                      autoFocus
                      value={tagDraft}
                      maxLength={MAX_PROGRESSION_TAG_LENGTH}
                      aria-label="New progression tag"
                      placeholder="Add tag"
                      onChange={(event) => setTagDraft(event.target.value)}
                      onBlur={submitTag}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setTagDraft("");
                          setAddingTag(false);
                        }
                      }}
                      className="h-5 w-24 border-b border-zinc-700 bg-transparent px-0.5 text-xs text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-amber-300/60"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    aria-label="Add progression tag"
                    title="Add tag"
                    onClick={() => setAddingTag(true)}
                    className="inline-flex items-center gap-1 text-zinc-600 transition-colors hover:text-zinc-300"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Tag</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
        {right && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 pl-[3.25rem] lg:pl-0">
            {right}
          </div>
        )}
      </div>
    </header>
  );
}

function MetadataSeparator() {
  return (
    <span className="text-zinc-700" aria-hidden>
      ·
    </span>
  );
}

function useProgressionCharacterMatch(stage: GearStage | undefined) {
  const [searchParams, setSearchParams] = useSearchParams();
  const matched = parseCharParam(searchParams.get("char"));
  const setMatched = (character: MatchedCharacter | null) => {
    const next = new URLSearchParams(searchParams);
    if (character) next.set("char", formatCharParam(character));
    else next.delete("char");
    setSearchParams(next, { replace: true });
  };
  const history = useArmoryGearHistory(matched?.realm, matched?.name);
  const player = useArmoryPlayer(matched?.realm, matched?.name);
  const currentGear = player.data?.gear;
  const match = useMemo<CharacterMatch | undefined>(() => {
    if (!history.data && !currentGear) return undefined;
    return buildCharacterMatch(history.data ?? { snapshots: [] }, currentGear);
  }, [currentGear, history.data]);
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

function ProgressionView({
  progression,
  isOwner,
}: {
  progression: GearProgression;
  isOwner: boolean;
}) {
  const editor = useProgressionEditor(progression);
  const { data: siteConfig } = useSiteConfig();
  const classes = useMemo(
    () => gearClassesForFlavor(siteConfig?.dataset_flavor ?? []),
    [siteConfig?.dataset_flavor],
  );
  const levelCap = levelCapForFlavor(siteConfig?.dataset_flavor ?? []);

  const serverPayload = useMemo(
    () => parseProgressionPayload(progression.payload),
    [progression.payload],
  );
  const payload = isOwner ? editor.payload : serverPayload;

  const [stageIndex, setStageIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("pick");
  const [view, setView] = useState<ProgressionViewMode>("doll");

  const activeIndex = Math.min(
    stageIndex,
    Math.max(0, payload.stages.length - 1),
  );
  const explicitStage = useMemo<GearStage>(
    () =>
      payload.stages[activeIndex] ?? {
        name: "Stage 1",
        slots: {},
      },
    [activeIndex, payload.stages],
  );
  const resolvedStage = useMemo(
    () => resolveProgressionStage(payload, activeIndex),
    [activeIndex, payload],
  );
  const resolvedActiveStage = resolvedStage.stage;
  const inheritedSlots = useMemo(
    () =>
      new Map(
        [...resolvedStage.inheritedFrom].map(([slot, sourceIndex]) => [
          slot,
          payload.stages[sourceIndex]?.name ?? `Stage ${sourceIndex + 1}`,
        ]),
      ),
    [payload.stages, resolvedStage.inheritedFrom],
  );
  // Stage tabs show item level for every stage, so hydrate the complete
  // progression rather than only the currently selected paperdoll stage.
  const itemRefs = useMemo(() => collectPayloadItemRefs(payload), [payload]);
  const items = useListItems(itemRefs);
  const effectiveStages = useMemo(
    () =>
      payload.stages.map((_, index) =>
        stageWithValidWeaponSlots(
          resolveProgressionStage(payload, index).stage,
          items,
        ),
      ),
    [items, payload],
  );
  const activeStage = effectiveStages[activeIndex] ?? resolvedActiveStage;
  const analysis = useGearAnalysis(
    activeStage,
    payload.analysis_profile_id,
    isOwner
      ? (profileId) =>
          editor.update((current) =>
            setProgressionAnalysisProfile(current, profileId),
          )
      : undefined,
  );

  const characterMatch = useProgressionCharacterMatch(activeStage);

  const selectedEntry =
    selectedSlot != null
      ? explicitStage.slots[String(selectedSlot)]
      : undefined;
  const selectedInheritedFrom =
    selectedSlot != null ? inheritedSlots.get(selectedSlot) : undefined;
  const itemLevelOf = (itemId: number) =>
    items.get(itemRefKey(itemId))?.itemLevel ?? null;
  const stageSubLabels = effectiveStages.map((stage) => {
    const avg = stageAverageItemLevel(stage, itemLevelOf);
    return avg != null ? `ilvl ${avg.toFixed(1)}` : undefined;
  });
  const stageIndicators = useMemo<StageProgressIndicator[] | undefined>(() => {
    if (!characterMatch.match) return undefined;
    return progressionStageCoverage(effectiveStages, characterMatch.match).map(
      (coverage) => ({
        covered: coverage.covered,
        total: coverage.total,
        fromStage: coverage.fromStage,
        fromLaterStages: coverage.fromLaterStages.map((later) => ({
          stageName:
            payload.stages[later.stageIndex]?.name ??
            `Stage ${later.stageIndex + 1}`,
          count: later.count,
        })),
        open: coverage.open,
      }),
    );
  }, [characterMatch.match, effectiveStages, payload.stages]);

  const selectStage = (index: number) => {
    setStageIndex(index);
    setSelectedSlot(null);
    setEditorTab("pick");
  };

  const editGridCell = (stage: number, slot: number) => {
    setStageIndex(stage);
    if (slot >= 0) {
      setSelectedSlot(slot);
      setEditorTab("pick");
      setView("doll");
    } else {
      setSelectedSlot(null);
    }
  };

  const equip = (item: ItemSearchResult) => {
    if (selectedSlot == null || payload.stages.length === 0) return;
    editor.update((current) =>
      setProgressionSlotItem(current, activeIndex, selectedSlot, item.entry),
    );
  };

  const editStageSlot = <A extends unknown[]>(
    op: (
      p: ProgressionPayload,
      stage: number,
      slot: number,
      ...rest: A
    ) => ProgressionPayload,
    ...args: A
  ) => {
    if (selectedSlot == null || payload.stages.length === 0) return;
    editor.update((current) => op(current, activeIndex, selectedSlot, ...args));
  };

  const clearSelected = () => {
    if (selectedSlot == null || payload.stages.length === 0) return;
    editor.update((current) =>
      clearProgressionSlot(current, activeIndex, selectedSlot),
    );
  };

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
      <ProgressionHeader
        title={isOwner ? editor.title : progression.title}
        classId={isOwner ? editor.classId : progression.class_id}
        specName={isOwner ? editor.specName : progression.spec_name}
        classes={classes}
        level={levelCap}
        tags={payload.tags ?? []}
        onTitleChange={isOwner ? editor.setTitle : undefined}
        onClassChange={
          isOwner
            ? (classId) => {
                editor.setClassAndSpec(classId, "");
                analysis.setSelection(null);
              }
            : undefined
        }
        onSpecChange={
          isOwner
            ? (specName) => {
                editor.setSpecName(specName);
                analysis.setSelection(null);
              }
            : undefined
        }
        onAddTag={
          isOwner
            ? (tag) =>
                editor.update((current) => addProgressionTag(current, tag))
            : undefined
        }
        onRemoveTag={
          isOwner
            ? (tag) =>
                editor.update((current) => removeProgressionTag(current, tag))
            : undefined
        }
        right={
          <>
            <GearAnalysisSheet
              classId={isOwner ? editor.classId : progression.class_id}
              profileId={analysis.profileId}
              selection={analysis.selection}
              onSelect={analysis.setSelection}
              totalScore={analysis.totalScore}
              statTotals={analysis.statTotals}
              targetEvaluations={analysis.targetEvaluations}
              triggerVariant="header"
            />
            {isOwner && editor.dirty && (
              <span className="inline-flex items-center gap-2 text-xs text-amber-300">
                <span
                  className="h-2 w-2 rounded-full bg-amber-300"
                  aria-hidden
                />
                Unsaved changes
              </span>
            )}
            {isOwner && (
              <Button
                className="h-10 rounded-none bg-sky-900 px-4 text-zinc-100 hover:bg-sky-800"
                onClick={editor.save}
                disabled={!editor.dirty || editor.saving}
              >
                {editor.saving ? "Saving…" : "Save"}
              </Button>
            )}
          </>
        }
      />
      {progression.description && (
        <p className="text-sm text-zinc-400">{progression.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {view === "doll" && (
          <StagesBar
            payload={{ version: GEAR_PAYLOAD_VERSION, stages: payload.stages }}
            stageIndex={activeIndex}
            onSelect={selectStage}
            subLabels={stageSubLabels}
            indicators={stageIndicators}
            onAdd={
              isOwner
                ? () => editor.update((current) => addProgressionStage(current))
                : undefined
            }
            onRename={
              isOwner
                ? (index, name) =>
                    editor.update((current) =>
                      renameProgressionStage(current, index, name),
                    )
                : undefined
            }
            onRemove={
              isOwner
                ? (index) =>
                    editor.update((current) =>
                      removeProgressionStage(current, index),
                    )
                : undefined
            }
            onMove={
              isOwner
                ? (from, to) =>
                    editor.update((current) =>
                      moveProgressionStage(current, from, to),
                    )
                : undefined
            }
          />
        )}
        <div className="flex-1" />
        {payload.stages.length > 0 && (
          <ProgressionViewToggle view={view} onChange={setView} />
        )}
      </div>

      {view === "grid" && payload.stages.length > 0 ? (
        <ProgressionStageGrid
          payload={payload}
          items={items}
          match={characterMatch.match}
          activeStageIndex={activeIndex}
          onCellClick={editGridCell}
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,1fr)] xl:grid-cols-[minmax(42rem,1.35fr)_minmax(26rem,1fr)] 2xl:grid-cols-[minmax(50rem,1.5fr)_minmax(30rem,1fr)]">
          <div className="space-y-3 rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4">
            <SetSummaryBar
              stage={activeStage}
              items={items}
              totalScore={analysis.totalScore}
            />
            <BuilderDoll
              stage={activeStage}
              items={items}
              scores={analysis.scores}
              match={characterMatch.match}
              matchName={characterMatch.matched?.name}
              inheritedSlots={inheritedSlots}
              size="large"
              selectedSlot={selectedSlot ?? undefined}
              onSelectSlot={
                isOwner && payload.stages.length > 0
                  ? (index) => {
                      setSelectedSlot((previous) =>
                        previous === index ? null : index,
                      );
                      setEditorTab("pick");
                    }
                  : undefined
              }
              onPromoteAlternate={
                isOwner && payload.stages.length > 0
                  ? (slotIndex, itemId) =>
                      editor.update((current) =>
                        promoteProgressionAlternate(
                          current,
                          activeIndex,
                          slotIndex,
                          itemId,
                        ),
                      )
                  : undefined
              }
              onEnchantSlot={
                isOwner && payload.stages.length > 0
                  ? (index) => {
                      setSelectedSlot(index);
                      setEditorTab("enchant");
                    }
                  : undefined
              }
            />
            <p className="text-2xs text-zinc-500">
              Click a slot to pick its item for this stage.
            </p>
          </div>
          <div className={cn(characterMatch.match && "relative")}>
            {characterMatch.match && characterMatch.matched && (
              <ArmoryDoll
                match={characterMatch.match}
                characterName={characterMatch.matched.name}
                progressionStages={effectiveStages}
                onClear={() => characterMatch.setMatched(null)}
              />
            )}

            {selectedSlot != null && isOwner && payload.stages.length > 0 && (
              <div
                className={cn(
                  characterMatch.match &&
                    "absolute inset-x-2 top-2 z-20 rounded-md bg-zinc-900 shadow-[0_18px_60px_rgba(0,0,0,0.72)] ring-1 ring-zinc-600/80",
                )}
              >
                <SlotEditorPanel
                  slotIndex={selectedSlot}
                  tab={editorTab}
                  onTabChange={setEditorTab}
                  entry={selectedEntry}
                  items={items}
                  tabs={selectedInheritedFrom ? ["pick"] : undefined}
                  beforePicker={
                    selectedInheritedFrom ? (
                      <div className="rounded border border-dashed border-zinc-700 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
                        This slot is inherited from{" "}
                        <strong className="font-medium text-zinc-300">
                          {selectedInheritedFrom}
                        </strong>{" "}
                        and is read-only here. Pick a replacement to override it
                        for this stage.
                      </div>
                    ) : undefined
                  }
                  onEquip={equip}
                  equipLabel="Set"
                  characterLevel={levelCap}
                  weights={analysis.selection?.weights ?? null}
                  equippedScore={analysis.scores?.get(selectedSlot)}
                  equippedItemId={
                    activeStage.slots[String(selectedSlot)]?.item_id
                  }
                  stageStats={analysis.statTotals}
                  targets={analysis.selection?.targets}
                  onAddAlternate={(item) =>
                    editStageSlot(addProgressionAlternate, item.entry)
                  }
                  onClear={clearSelected}
                  onClose={() => setSelectedSlot(null)}
                  onSlotNote={(note) =>
                    editStageSlot(setProgressionSlotNote, note)
                  }
                  onAlternateNote={(itemId, note) =>
                    editStageSlot(setProgressionAlternateNote, itemId, note)
                  }
                  onPromoteAlternate={(itemId) =>
                    editStageSlot(promoteProgressionAlternate, itemId)
                  }
                  onRemoveAlternate={(itemId) =>
                    editStageSlot(removeProgressionAlternate, itemId)
                  }
                  onSetEnchant={(enchantId) =>
                    editStageSlot(setProgressionSlotEnchant, enchantId)
                  }
                />
              </div>
            )}

            {!characterMatch.match &&
              !(
                selectedSlot != null &&
                isOwner &&
                payload.stages.length > 0
              ) && (
                <CharacterMatchPanel
                  matched={characterMatch.matched}
                  onMatch={characterMatch.setMatched}
                  historyLoading={characterMatch.loading}
                  historyError={characterMatch.error}
                />
              )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Gear progression builder/viewer. Every stage uses the same paperdoll and
 * slot editor, with item availability evaluated at the deployment level cap.
 */
export function GearProgressionPage() {
  const { progressionID } = useParams<{ progressionID: string }>();
  const { data: session } = useSession();
  const progression = useSharedGearProgression(progressionID);

  if (progression.isLoading) {
    return (
      <div className="p-8 text-center text-zinc-400">Loading progression…</div>
    );
  }
  if (progression.isError || !progression.data) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p className="mb-2 text-red-400">Progression not found.</p>
        <Link
          to="/gear/progression"
          className="text-sm text-blue-400 hover:underline"
        >
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
