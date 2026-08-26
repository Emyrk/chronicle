/**
 * Pure gear-progression model: the versioned payload, immutable document
 * operations, and the leveling derivation. No React imports — safe for
 * tests and workers.
 *
 * The payload is the document stored in gear_progressions.payload:
 * { version: 1,
 *   pool: [{ item_id, enchant_id?, note? }],
 *   stages: [{ name, slots: { "0".."18": GearSlotEntry } }] }
 *
 * Every stage is an explicit gear set with the same behavior. Item
 * availability is evaluated at the deployment's level cap.
 */
import {
  parseTargets,
  parseWeights,
  type StatTarget,
  type StatWeights,
} from "../builder/gearScoring";
import {
  COSMETIC_SLOTS,
  GEAR_PAYLOAD_VERSION,
  MAX_STAGES,
  SLOT,
  SLOT_COUNT,
  addAlternate,
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
  setSlotGem,
  setSlotItem,
  setSlotNote,
  type GearPayload,
  type GearStage,
} from "../builder/gearListModel";

export const PROGRESSION_PAYLOAD_VERSION = 1;
export const MAX_POOL_ITEMS = 400;
export const MAX_PROGRESSION_TAGS = 24;
export const MAX_PROGRESSION_TAG_LENGTH = 48;

export interface ProgressionPoolItem {
  item_id: number;
  enchant_id?: number;
  note?: string;
}

export interface EmbeddedAnalysisProfile {
  id: string;
  name: string;
  description: string;
  weights: StatWeights;
  targets: StatTarget[];
}

export type AnalysisProfileSnapshotSource = EmbeddedAnalysisProfile;

export interface ProgressionPayload {
  version: number;
  pool: ProgressionPoolItem[];
  stages: GearStage[];
  /** Free-form labels shown under the progression title. */
  tags?: string[];
  /** Source profile ID retained for owner-side profile selection. */
  analysis_profile_id?: string;
  /** Portable snapshot used when the source profile is private or unavailable. */
  analysis_profile?: EmbeddedAnalysisProfile;
}

// ─── Level caps ──────────────────────────────────────────────

/**
 * Level cap for the deployment's dataset flavor. Same precedent as the
 * talent calculator and `gearClassesForFlavor`: the tenant's dataset tags
 * decide which expansion we are in.
 */
export function levelCapForFlavor(tags: readonly string[]): number {
  if (tags.includes("wrath")) return 80;
  if (tags.includes("tbc")) return 70;
  return 60;
}

// ─── Parsing / serializing ───────────────────────────────────

function emptyPayload(): ProgressionPayload {
  return { version: PROGRESSION_PAYLOAD_VERSION, pool: [], stages: [] };
}

/**
 * Parse a payload from the API (string or object). Never throws;
 * malformed input degrades to an empty document. Stage parsing is
 * intentionally shared with the gear-list model so the two documents
 * cannot drift.
 */
export function parseProgressionPayload(raw: unknown): ProgressionPayload {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return emptyPayload();
    }
  }
  if (!value || typeof value !== "object") return emptyPayload();

  const poolRaw = (value as { pool?: unknown }).pool;
  const pool: ProgressionPoolItem[] = [];
  const seen = new Set<number>();
  if (Array.isArray(poolRaw)) {
    for (const entryRaw of poolRaw.slice(0, MAX_POOL_ITEMS)) {
      const entry = parsePoolItem(entryRaw);
      // A pool is a set: duplicate item IDs would double-count in the
      // derivation's per-slot ranking.
      if (entry && !seen.has(entry.item_id)) {
        seen.add(entry.item_id);
        pool.push(entry);
      }
    }
  }

  // The gear-list parser only reads `stages`, so the progression document
  // can be handed to it directly — one stage parser, no drift.
  const parsed = parsePayload(value);
  const stages = parsed.stages.map((stage) => {
    const next = { ...stage };
    delete next.level;
    return next;
  });
  const doc: ProgressionPayload = {
    version: PROGRESSION_PAYLOAD_VERSION,
    pool,
    stages,
  };
  const analysisProfileId = (
    value as { analysis_profile_id?: unknown }
  ).analysis_profile_id;
  if (typeof analysisProfileId === "string" && analysisProfileId) {
    doc.analysis_profile_id = analysisProfileId.slice(0, 128);
  }
  const embeddedProfile = parseEmbeddedAnalysisProfile(
    (value as { analysis_profile?: unknown }).analysis_profile,
  );
  if (embeddedProfile) doc.analysis_profile = embeddedProfile;
  const tagsRaw = (value as { tags?: unknown }).tags;
  if (Array.isArray(tagsRaw)) {
    const tags: string[] = [];
    const seenTags = new Set<string>();
    for (const rawTag of tagsRaw.slice(0, MAX_PROGRESSION_TAGS)) {
      if (typeof rawTag !== "string") continue;
      const tag = rawTag.trim().slice(0, MAX_PROGRESSION_TAG_LENGTH);
      const normalized = tag.toLocaleLowerCase();
      if (!tag || seenTags.has(normalized)) continue;
      seenTags.add(normalized);
      tags.push(tag);
    }
    if (tags.length > 0) doc.tags = tags;
  }
  return doc;
}

function parsePoolItem(raw: unknown): ProgressionPoolItem | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0 ? { item_id: raw } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.item_id !== "number" ||
    !Number.isInteger(obj.item_id) ||
    obj.item_id <= 0
  ) {
    return null;
  }
  const entry: ProgressionPoolItem = { item_id: obj.item_id };
  if (
    typeof obj.enchant_id === "number" &&
    Number.isInteger(obj.enchant_id) &&
    obj.enchant_id > 0
  ) {
    entry.enchant_id = obj.enchant_id;
  }
  if (typeof obj.note === "string" && obj.note) entry.note = obj.note;
  return entry;
}

function parseEmbeddedAnalysisProfile(raw: unknown): EmbeddedAnalysisProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const profile = raw as Record<string, unknown>;
  if (
    typeof profile.id !== "string" ||
    !profile.id ||
    typeof profile.name !== "string" ||
    !profile.name
  ) {
    return null;
  }
  const weights = parseWeights(profile.weights);
  if (Object.keys(weights).length === 0) return null;
  return {
    id: profile.id.slice(0, 128),
    name: profile.name.slice(0, 128),
    description:
      typeof profile.description === "string"
        ? profile.description.slice(0, 2000)
        : "",
    weights,
    targets: parseTargets(profile.targets),
  };
}

export function embeddedAnalysisProfile(
  profile: AnalysisProfileSnapshotSource,
): EmbeddedAnalysisProfile {
  return {
    id: profile.id.slice(0, 128),
    name: profile.name.slice(0, 128),
    description: profile.description.slice(0, 2000),
    weights: { ...profile.weights },
    targets: profile.targets.map((target) => ({ ...target })),
  };
}

export function serializeProgressionPayload(
  payload: ProgressionPayload,
): string {
  return JSON.stringify(payload);
}

export function setProgressionAnalysisProfile(
  payload: ProgressionPayload,
  profile: AnalysisProfileSnapshotSource | null,
): ProgressionPayload {
  const next = { ...payload };
  if (profile) {
    next.analysis_profile_id = profile.id.slice(0, 128);
    next.analysis_profile = embeddedAnalysisProfile(profile);
  } else {
    delete next.analysis_profile_id;
    delete next.analysis_profile;
  }
  return next;
}

// ─── Document tags ────────────────────────────────────────────

export function addProgressionTag(
  payload: ProgressionPayload,
  rawTag: string,
): ProgressionPayload {
  const tag = rawTag.trim().slice(0, MAX_PROGRESSION_TAG_LENGTH);
  if (!tag) return payload;
  const tags = payload.tags ?? [];
  if (tags.length >= MAX_PROGRESSION_TAGS) return payload;
  if (
    tags.some(
      (existing) => existing.toLocaleLowerCase() === tag.toLocaleLowerCase(),
    )
  ) {
    return payload;
  }
  return { ...payload, tags: [...tags, tag] };
}

export function removeProgressionTag(
  payload: ProgressionPayload,
  tag: string,
): ProgressionPayload {
  const tags = (payload.tags ?? []).filter((existing) => existing !== tag);
  if (tags.length === (payload.tags ?? []).length) return payload;
  const next = { ...payload };
  if (tags.length > 0) next.tags = tags;
  else delete next.tags;
  return next;
}

// ─── Pool operations ─────────────────────────────────────────
// Each returns a new payload; the input is never mutated.

export function addPoolItem(
  payload: ProgressionPayload,
  itemId: number,
): ProgressionPayload {
  if (itemId <= 0) return payload;
  if (payload.pool.length >= MAX_POOL_ITEMS) return payload;
  if (payload.pool.some((p) => p.item_id === itemId)) return payload;
  return { ...payload, pool: [...payload.pool, { item_id: itemId }] };
}

export function removePoolItem(
  payload: ProgressionPayload,
  itemId: number,
): ProgressionPayload {
  const pool = payload.pool.filter((p) => p.item_id !== itemId);
  if (pool.length === payload.pool.length) return payload;
  return { ...payload, pool };
}

export function setPoolItemNote(
  payload: ProgressionPayload,
  itemId: number,
  note: string,
): ProgressionPayload {
  return {
    ...payload,
    pool: payload.pool.map((p) => {
      if (p.item_id !== itemId) return p;
      const next = { ...p };
      if (note) {
        next.note = note;
      } else {
        delete next.note;
      }
      return next;
    }),
  };
}

export function setPoolItemEnchant(
  payload: ProgressionPayload,
  itemId: number,
  enchantId: number | undefined,
): ProgressionPayload {
  return {
    ...payload,
    pool: payload.pool.map((p) => {
      if (p.item_id !== itemId) return p;
      const next = { ...p };
      if (enchantId && enchantId > 0) {
        next.enchant_id = enchantId;
      } else {
        delete next.enchant_id;
      }
      return next;
    }),
  };
}

// ─── Stage operations ────────────────────────────────────────
// The max-level half reuses the shipped gear-list stage model verbatim;
// these adapters keep the pool alongside it.

function withStages(
  payload: ProgressionPayload,
  fn: (doc: GearPayload) => GearPayload,
): ProgressionPayload {
  const next = fn({ version: GEAR_PAYLOAD_VERSION, stages: payload.stages });
  if (next.stages === payload.stages) return payload;
  return { ...payload, stages: next.stages };
}

export function addProgressionStage(
  payload: ProgressionPayload,
  name?: string,
): ProgressionPayload {
  if (payload.stages.length >= MAX_STAGES) return payload;
  return {
    ...payload,
    stages: [
      ...payload.stages,
      {
        name: name ?? `Stage ${payload.stages.length + 1}`,
        slots: {},
      },
    ],
  };
}

export interface ResolvedProgressionStage {
  /** Effective gear after carrying empty slots forward from earlier stages. */
  stage: GearStage;
  /** Outfit slot index → the earlier stage index supplying that slot. */
  inheritedFrom: Map<number, number>;
}

/**
 * Resolve a progression stage for display and analysis. A stage stores only
 * its changes; any absent slot carries forward the nearest explicit pick from
 * an earlier stage.
 */
export function resolveProgressionStage(
  payload: ProgressionPayload,
  stageIndex: number,
): ResolvedProgressionStage {
  const target = payload.stages[stageIndex];
  if (!target) {
    return {
      stage: { name: `Stage ${stageIndex + 1}`, slots: {} },
      inheritedFrom: new Map(),
    };
  }

  const slots: GearStage["slots"] = {};
  const sourceBySlot = new Map<number, number>();
  for (let index = 0; index <= stageIndex; index++) {
    const stage = payload.stages[index];
    if (!stage) continue;
    for (const [slot, entry] of Object.entries(stage.slots)) {
      if (!entry) continue;
      slots[slot] = entry;
      sourceBySlot.set(Number(slot), index);
    }
  }

  const inheritedFrom = new Map<number, number>();
  for (const [slot, sourceIndex] of sourceBySlot) {
    if (sourceIndex < stageIndex) inheritedFrom.set(slot, sourceIndex);
  }

  return {
    stage: { ...target, slots },
    inheritedFrom,
  };
}

export function removeProgressionStage(
  payload: ProgressionPayload,
  index: number,
): ProgressionPayload {
  return withStages(payload, (doc) => removeStage(doc, index));
}

export function renameProgressionStage(
  payload: ProgressionPayload,
  index: number,
  name: string,
): ProgressionPayload {
  return withStages(payload, (doc) => renameStage(doc, index, name));
}

export function moveProgressionStage(
  payload: ProgressionPayload,
  from: number,
  to: number,
): ProgressionPayload {
  return withStages(payload, (doc) => moveStage(doc, from, to));
}

export function setProgressionSlotItem(
  payload: ProgressionPayload,
  stageIndex: number,
  slotIndex: number,
  itemId: number,
): ProgressionPayload {
  return withStages(payload, (doc) =>
    setSlotItem(doc, stageIndex, slotIndex, itemId),
  );
}

export function clearProgressionSlot(
  payload: ProgressionPayload,
  stageIndex: number,
  slotIndex: number,
): ProgressionPayload {
  return withStages(payload, (doc) => clearSlot(doc, stageIndex, slotIndex));
}

// Stage slots are gear-list slots, so they get the gear-list builder's
// full per-slot editing: notes, ranked alternates, and enchants.

export function setProgressionSlotNote(
  payload: ProgressionPayload,
  stageIndex: number,
  slotIndex: number,
  note: string,
): ProgressionPayload {
  return withStages(payload, (doc) =>
    setSlotNote(doc, stageIndex, slotIndex, note),
  );
}

export function setProgressionSlotEnchant(
  payload: ProgressionPayload,
  stageIndex: number,
  slotIndex: number,
  enchantId: number | undefined,
): ProgressionPayload {
  return withStages(payload, (doc) =>
    setSlotEnchant(doc, stageIndex, slotIndex, enchantId),
  );
}

export function setProgressionSlotGem(
  payload: ProgressionPayload,
  stageIndex: number,
  slotIndex: number,
  socketIndex: number,
  gemEnchantId: number | undefined,
): ProgressionPayload {
  return withStages(payload, (doc) =>
    setSlotGem(doc, stageIndex, slotIndex, socketIndex, gemEnchantId),
  );
}

export function addProgressionAlternate(
  payload: ProgressionPayload,
  stageIndex: number,
  slotIndex: number,
  itemId: number,
): ProgressionPayload {
  return withStages(payload, (doc) =>
    addAlternate(doc, stageIndex, slotIndex, itemId),
  );
}

export function removeProgressionAlternate(
  payload: ProgressionPayload,
  stageIndex: number,
  slotIndex: number,
  itemId: number,
): ProgressionPayload {
  return withStages(payload, (doc) =>
    removeAlternate(doc, stageIndex, slotIndex, itemId),
  );
}

export function setProgressionAlternateNote(
  payload: ProgressionPayload,
  stageIndex: number,
  slotIndex: number,
  itemId: number,
  note: string,
): ProgressionPayload {
  return withStages(payload, (doc) =>
    setAlternateNote(doc, stageIndex, slotIndex, itemId, note),
  );
}

export function promoteProgressionAlternate(
  payload: ProgressionPayload,
  stageIndex: number,
  slotIndex: number,
  itemId: number,
): ProgressionPayload {
  return withStages(payload, (doc) =>
    promoteAlternate(doc, stageIndex, slotIndex, itemId),
  );
}

/**
 * The bridge between the two halves: seed a stage from the leveling
 * derivation evaluated at the level cap. Existing picks are replaced so
 * the snapshot is a faithful copy of what the pool implies at cap.
 */
export function snapshotStageFromDerived(
  payload: ProgressionPayload,
  stageIndex: number,
  derived: DerivedEquipped,
): ProgressionPayload {
  const enchantOf = new Map(payload.pool.map((p) => [p.item_id, p.enchant_id]));
  const equipped: ({ item_id: number; enchant_id?: number } | undefined)[] = [];
  for (let slot = 0; slot < 19; slot++) {
    const itemId = derived[slot];
    if (itemId == null) continue;
    const enchantId = enchantOf.get(itemId);
    equipped[slot] = {
      item_id: itemId,
      ...(enchantId ? { enchant_id: enchantId } : {}),
    };
  }
  return withStages(payload, (doc) =>
    fillStageFromOutfit(doc, stageIndex, equipped, true),
  );
}

// ─── Leveling derivation ─────────────────────────────────────

/** Everything the derivation needs to know about a pool item. */
export interface PoolItemStats {
  item_id: number;
  /** WoWDB inventory type (1 = Head … 28 = Relic). */
  inventory_type: number;
  required_level: number;
  item_level: number;
}

/** Outfit slot index → item ID. Absent slots have no eligible item. */
export type DerivedEquipped = Partial<Record<number, number>>;

/**
 * Slot groups the derivation ranks within. Two-slot groups (fingers,
 * trinkets) take the top two candidates; weapons are assigned by
 * `assignWeapons` because a two-hander also consumes the off hand.
 */
const GROUP_SLOTS: Record<string, readonly number[]> = {
  head: [SLOT.head],
  neck: [SLOT.neck],
  shoulder: [SLOT.shoulder],
  shirt: [SLOT.shirt],
  chest: [SLOT.chest],
  waist: [SLOT.waist],
  legs: [SLOT.legs],
  feet: [SLOT.feet],
  wrist: [SLOT.wrist],
  hands: [SLOT.hands],
  finger: [SLOT.finger1, SLOT.finger2],
  trinket: [SLOT.trinket1, SLOT.trinket2],
  back: [SLOT.back],
  weapon: [SLOT.mainHand, SLOT.offHand],
  ranged: [SLOT.ranged],
  tabard: [SLOT.tabard],
};

/** Inventory type → slot group. Types not listed here are not equippable. */
const GROUP_BY_INVENTORY_TYPE: Record<number, string> = {
  1: "head",
  2: "neck",
  3: "shoulder",
  4: "shirt",
  5: "chest",
  20: "chest", // robe
  6: "waist",
  7: "legs",
  8: "feet",
  9: "wrist",
  10: "hands",
  11: "finger",
  12: "trinket",
  16: "back",
  19: "tabard",
  13: "weapon", // one-hand
  14: "weapon", // shield
  17: "weapon", // two-hand
  21: "weapon", // main hand
  22: "weapon", // off hand
  23: "weapon", // holdable
  15: "ranged",
  25: "ranged", // thrown
  26: "ranged", // wand / gun
  28: "ranged", // relic
};

const TWO_HAND_TYPES: ReadonlySet<number> = new Set([17]);
const OFF_HAND_TYPES: ReadonlySet<number> = new Set([13, 14, 22, 23]);

/**
 * Outfit slots an item of this inventory type can occupy. Empty when the
 * item is not equippable (bags, reagents, …).
 */
export function slotsForInventoryType(
  inventoryType: number,
): readonly number[] {
  const group = GROUP_BY_INVENTORY_TYPE[inventoryType];
  return group ? GROUP_SLOTS[group] : [];
}

/** Whether a pool item is a candidate for a given outfit slot. */
export function itemFitsSlot(
  inventoryType: number,
  slotIndex: number,
): boolean {
  return slotsForInventoryType(inventoryType).includes(slotIndex);
}

/**
 * Rank order within a slot group: the *latest-unlocked* item wins, then
 * the higher item level, then the lower item ID so ties are stable.
 *
 * Required level beats item level on purpose — while leveling, an item
 * you just unlocked is almost always the upgrade you actually put on,
 * and it keeps the scrubber's timeline monotonic and legible.
 */
function compareCandidates(a: PoolItemStats, b: PoolItemStats): number {
  if (a.required_level !== b.required_level)
    return b.required_level - a.required_level;
  if (a.item_level !== b.item_level) return b.item_level - a.item_level;
  return a.item_id - b.item_id;
}

/**
 * Best-per-slot from the pool at a given character level. Items whose
 * required level is above `level` are ignored; the rest are ranked per
 * slot group and the top pick (top two for fingers and trinkets) is
 * equipped. Slots with no eligible item stay empty.
 */
export function computeEquippedAtLevel(
  pool: readonly PoolItemStats[],
  level: number,
): DerivedEquipped {
  const byGroup = new Map<string, PoolItemStats[]>();
  for (const item of pool) {
    if ((item.required_level ?? 0) > level) continue;
    const group = GROUP_BY_INVENTORY_TYPE[item.inventory_type];
    if (!group) continue;
    const bucket = byGroup.get(group);
    if (bucket) {
      bucket.push(item);
    } else {
      byGroup.set(group, [item]);
    }
  }

  const equipped: DerivedEquipped = {};
  for (const [group, candidates] of byGroup) {
    candidates.sort(compareCandidates);
    if (group === "weapon") {
      assignWeapons(candidates, equipped);
      continue;
    }
    GROUP_SLOTS[group].forEach((slot, i) => {
      const pick = candidates[i];
      if (pick) equipped[slot] = pick.item_id;
    });
  }
  return equipped;
}

/**
 * Weapons need their own rule: the best candidate takes the main hand,
 * and the off hand goes to the best remaining off-hand-capable item —
 * unless the main hand is a two-hander, which occupies both.
 */
function assignWeapons(
  candidates: PoolItemStats[],
  equipped: DerivedEquipped,
): void {
  const main = candidates[0];
  if (!main) return;
  equipped[SLOT.mainHand] = main.item_id;
  if (TWO_HAND_TYPES.has(main.inventory_type)) return;
  const off = candidates
    .slice(1)
    .find((c) => OFF_HAND_TYPES.has(c.inventory_type));
  if (off) equipped[SLOT.offHand] = off.item_id;
}

/**
 * Levels at which the derived set changes. Used to mark the scrubber's
 * rail so a player can see where their pool actually delivers upgrades.
 */
export function upgradeLevels(
  pool: readonly PoolItemStats[],
  maxLevel: number,
): number[] {
  const levels = new Set<number>();
  for (const item of pool) {
    if (!GROUP_BY_INVENTORY_TYPE[item.inventory_type]) continue;
    const required = Math.max(1, item.required_level ?? 0);
    if (required <= maxLevel) levels.add(required);
  }
  return [...levels].sort((a, b) => a - b);
}

/**
 * Average item level over the non-cosmetic equipped slots, or null when
 * nothing with a known item level is equipped. Shared by the leveling
 * readout and the max-level stage labels so the two agree.
 */
export function averageEquippedItemLevel(
  slots: Iterable<readonly [number, number]>,
  itemLevelOf: (itemId: number) => number | null | undefined,
): number | null {
  let total = 0;
  let count = 0;
  for (const [slot, itemId] of slots) {
    if (COSMETIC_SLOTS.has(slot)) continue;
    const level = itemLevelOf(itemId);
    if (level == null) continue;
    total += level;
    count++;
  }
  return count > 0 ? total / count : null;
}

/** `averageEquippedItemLevel` over a derived leveling set. */
export function derivedAverageItemLevel(
  derived: DerivedEquipped,
  itemLevelOf: (itemId: number) => number | null | undefined,
): number | null {
  const entries: [number, number][] = [];
  for (const [key, itemId] of Object.entries(derived)) {
    if (itemId != null) entries.push([Number(key), itemId]);
  }
  return averageEquippedItemLevel(entries, itemLevelOf);
}

/** `averageEquippedItemLevel` over one max-level stage. */
export function stageAverageItemLevel(
  stage: GearStage,
  itemLevelOf: (itemId: number) => number | null | undefined,
): number | null {
  const entries: [number, number][] = [];
  for (const [key, entry] of Object.entries(stage.slots)) {
    if (entry) entries.push([Number(key), entry.item_id]);
  }
  return averageEquippedItemLevel(entries, itemLevelOf);
}

/** What a slot becomes, and when. */
export interface NextUpgrade {
  level: number;
  itemId: number;
}

/**
 * For each slot, the next level above `level` at which the derived set
 * changes, and what it changes to. Slots that never change again are
 * absent.
 *
 * The derivation is a step function of the character level — it can only
 * change at a level where some pool item becomes eligible — so it is
 * enough to evaluate the candidate levels rather than every integer.
 */
export function nextUpgradesAfter(
  pool: readonly PoolItemStats[],
  level: number,
  maxLevel: number,
): Map<number, NextUpgrade> {
  const current = computeEquippedAtLevel(pool, level);
  const pending = new Map<number, NextUpgrade>();
  for (const candidate of upgradeLevels(pool, maxLevel)) {
    if (candidate <= level) continue;
    const at = computeEquippedAtLevel(pool, candidate);
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      if (pending.has(slot)) continue;
      const next = at[slot];
      if (next != null && next !== current[slot]) {
        pending.set(slot, { level: candidate, itemId: next });
      }
    }
  }
  return pending;
}

/** One column of the swimlane view: a level and the set derived there. */
export interface ProgressionColumn {
  level: number;
  equipped: DerivedEquipped;
}

/**
 * The levels worth showing as swimlane columns: level 1, every level at
 * which the pool delivers something, and the cap. Columns whose derived
 * set is identical to the previous one are dropped — they would be a
 * fully-carried column with nothing to say.
 */
export function progressionColumns(
  pool: readonly PoolItemStats[],
  maxLevel: number,
): ProgressionColumn[] {
  const levels = new Set<number>([1, maxLevel]);
  for (const level of upgradeLevels(pool, maxLevel)) levels.add(level);

  const columns: ProgressionColumn[] = [];
  for (const level of [...levels].sort((a, b) => a - b)) {
    const equipped = computeEquippedAtLevel(pool, level);
    const previous = columns[columns.length - 1];
    if (previous && sameEquipped(previous.equipped, equipped)) continue;
    columns.push({ level, equipped });
  }
  return columns;
}

function sameEquipped(a: DerivedEquipped, b: DerivedEquipped): boolean {
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (a[slot] !== b[slot]) return false;
  }
  return true;
}

/**
 * Convert a pool derivation to a GearStage for previews and snapshots.
 * Enchants come from the pool entries that produced the picks.
 */
export function derivedStage(
  name: string,
  equipped: DerivedEquipped,
  pool: readonly ProgressionPoolItem[],
): GearStage {
  const enchantOf = new Map(pool.map((p) => [p.item_id, p.enchant_id]));
  const slots: GearStage["slots"] = {};
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const itemId = equipped[slot];
    if (itemId == null) continue;
    const enchantId = enchantOf.get(itemId);
    slots[String(slot)] = {
      item_id: itemId,
      ...(enchantId ? { enchant_id: enchantId } : {}),
    };
  }
  return { name, slots };
}

// Re-exported so the progression views import slot names from one module.
export { SLOT };
export type { GearStage };
