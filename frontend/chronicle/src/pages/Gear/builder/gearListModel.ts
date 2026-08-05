/**
 * Pure gear-list payload model: types, parsing, and immutable document
 * operations. No React imports — safe for tests and workers.
 *
 * The payload is the versioned document stored in gear_lists.payload:
 * { version: 2, stages: [{ name, slots: { "0".."18": GearSlotEntry } }] }
 * Slot keys are PlayerOutfit indexes (see ArmoryPage/types.ts).
 */

export const GEAR_PAYLOAD_VERSION = 2;
export const MAX_STAGES = 16;
export const MAX_ALTERNATES = 8;
export const SLOT_COUNT = 19;

export interface GearAlternate {
  item_id: number;
  note?: string;
}

export interface GearSlotEntry {
  item_id: number;
  enchant_id?: number;
  note?: string;
  alternates?: GearAlternate[];
}

export interface GearStage {
  name: string;
  slots: Partial<Record<string, GearSlotEntry>>;
}

export interface GearPayload {
  version: number;
  stages: GearStage[];
}

/** Outfit slot indexes, named. */
export const SLOT = {
  head: 0, neck: 1, shoulder: 2, shirt: 3, chest: 4, waist: 5, legs: 6,
  feet: 7, wrist: 8, hands: 9, finger1: 10, finger2: 11, trinket1: 12,
  trinket2: 13, back: 14, mainHand: 15, offHand: 16, ranged: 17, tabard: 18,
} as const;

/** Slots excluded from average item level (cosmetic). */
export const COSMETIC_SLOTS: ReadonlySet<number> = new Set([SLOT.shirt, SLOT.tabard]);

/**
 * Which item `inventory_type` values may go in each outfit slot. Used to
 * pre-filter the item picker search. Sourced from the WoWDB inventory-type
 * labels (1=Head ... 28=Relic).
 */
export const SLOT_INVENTORY_TYPES: Record<number, readonly number[]> = {
  [SLOT.head]: [1],
  [SLOT.neck]: [2],
  [SLOT.shoulder]: [3],
  [SLOT.shirt]: [4],
  [SLOT.chest]: [5, 20], // chest + robe
  [SLOT.waist]: [6],
  [SLOT.legs]: [7],
  [SLOT.feet]: [8],
  [SLOT.wrist]: [9],
  [SLOT.hands]: [10],
  [SLOT.finger1]: [11],
  [SLOT.finger2]: [11],
  [SLOT.trinket1]: [12],
  [SLOT.trinket2]: [12],
  [SLOT.back]: [16],
  [SLOT.mainHand]: [13, 17, 21], // one-hand, two-hand, main hand
  [SLOT.offHand]: [13, 14, 22, 23], // one-hand, shield, off hand, holdable
  [SLOT.ranged]: [15, 25, 26, 28], // ranged, thrown, wands/guns, relic
  [SLOT.tabard]: [19],
};

function emptyPayload(): GearPayload {
  return { version: GEAR_PAYLOAD_VERSION, stages: [] };
}

function isSlotKey(key: string): boolean {
  const n = Number(key);
  return Number.isInteger(n) && n >= 0 && n < SLOT_COUNT;
}

/**
 * Parse a payload from the API (string or object) into a well-formed
 * GearPayload. Tolerates the legacy v1 shape where slot values were bare
 * item IDs. Never throws; malformed input degrades to an empty document.
 */
export function parsePayload(raw: unknown): GearPayload {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return emptyPayload();
    }
  }
  if (!value || typeof value !== "object") return emptyPayload();

  const stagesRaw = (value as { stages?: unknown }).stages;
  if (!Array.isArray(stagesRaw)) return emptyPayload();

  const stages: GearStage[] = [];
  for (const stageRaw of stagesRaw.slice(0, MAX_STAGES)) {
    if (!stageRaw || typeof stageRaw !== "object") continue;
    const name = typeof (stageRaw as { name?: unknown }).name === "string"
      ? (stageRaw as { name: string }).name
      : "";
    const slotsRaw = (stageRaw as { slots?: unknown }).slots;
    const slots: Partial<Record<string, GearSlotEntry>> = {};
    if (slotsRaw && typeof slotsRaw === "object") {
      for (const [key, entryRaw] of Object.entries(slotsRaw)) {
        if (!isSlotKey(key)) continue;
        const entry = parseSlotEntry(entryRaw);
        if (entry) slots[key] = entry;
      }
    }
    stages.push({ name, slots });
  }
  return { version: GEAR_PAYLOAD_VERSION, stages };
}

function parseSlotEntry(raw: unknown): GearSlotEntry | null {
  // Legacy v1: slot value was a bare item ID.
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0 ? { item_id: raw } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const itemId = obj.item_id;
  if (typeof itemId !== "number" || !Number.isInteger(itemId) || itemId <= 0) return null;

  const entry: GearSlotEntry = { item_id: itemId };
  if (typeof obj.enchant_id === "number" && Number.isInteger(obj.enchant_id) && obj.enchant_id > 0) {
    entry.enchant_id = obj.enchant_id;
  }
  if (typeof obj.note === "string" && obj.note) entry.note = obj.note;
  if (Array.isArray(obj.alternates)) {
    const alternates: GearAlternate[] = [];
    for (const altRaw of obj.alternates.slice(0, MAX_ALTERNATES)) {
      if (!altRaw || typeof altRaw !== "object") continue;
      const alt = altRaw as Record<string, unknown>;
      if (typeof alt.item_id !== "number" || !Number.isInteger(alt.item_id) || alt.item_id <= 0) continue;
      const entryAlt: GearAlternate = { item_id: alt.item_id };
      if (typeof alt.note === "string" && alt.note) entryAlt.note = alt.note;
      alternates.push(entryAlt);
    }
    if (alternates.length > 0) entry.alternates = alternates;
  }
  return entry;
}

/** Serialize for the update API (payload travels as a JSON string). */
export function serializePayload(payload: GearPayload): string {
  return JSON.stringify(payload);
}

/** All unique item IDs referenced by the document, alternates included. */
export function collectItemIds(payload: GearPayload): number[] {
  const ids = new Set<number>();
  for (const stage of payload.stages) {
    for (const entry of Object.values(stage.slots)) {
      if (!entry) continue;
      ids.add(entry.item_id);
      for (const alt of entry.alternates ?? []) ids.add(alt.item_id);
    }
  }
  return [...ids];
}

// ─── Immutable document operations ───────────────────────────
// Each returns a new payload; the input is never mutated.

export function addStage(payload: GearPayload, name?: string): GearPayload {
  if (payload.stages.length >= MAX_STAGES) return payload;
  const prev = payload.stages[payload.stages.length - 1];
  const stage: GearStage = {
    name: name ?? `Stage ${payload.stages.length + 1}`,
    // Copy the previous stage: carried-forward items stay explicit and the
    // matrix computes "carried" cells at render time.
    slots: prev ? structuredClone(prev.slots) : {},
  };
  return { ...payload, stages: [...payload.stages, stage] };
}

export function removeStage(payload: GearPayload, index: number): GearPayload {
  if (index < 0 || index >= payload.stages.length) return payload;
  return { ...payload, stages: payload.stages.filter((_, i) => i !== index) };
}

export function renameStage(payload: GearPayload, index: number, name: string): GearPayload {
  return updateStage(payload, index, (stage) => ({ ...stage, name }));
}

export function moveStage(payload: GearPayload, from: number, to: number): GearPayload {
  const n = payload.stages.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return payload;
  const stages = [...payload.stages];
  const [moved] = stages.splice(from, 1);
  stages.splice(to, 0, moved);
  return { ...payload, stages };
}

function updateStage(
  payload: GearPayload,
  index: number,
  fn: (stage: GearStage) => GearStage,
): GearPayload {
  if (index < 0 || index >= payload.stages.length) return payload;
  const stages = payload.stages.map((s, i) => (i === index ? fn(s) : s));
  return { ...payload, stages };
}

function updateSlot(
  payload: GearPayload,
  stageIndex: number,
  slotIndex: number,
  fn: (entry: GearSlotEntry | undefined) => GearSlotEntry | undefined,
): GearPayload {
  return updateStage(payload, stageIndex, (stage) => {
    const key = String(slotIndex);
    const next = fn(stage.slots[key]);
    const slots = { ...stage.slots };
    if (next === undefined) {
      delete slots[key];
    } else {
      slots[key] = next;
    }
    return { ...stage, slots };
  });
}

/** Equip an item, replacing the current pick but keeping note/alternates. */
export function setSlotItem(
  payload: GearPayload,
  stageIndex: number,
  slotIndex: number,
  itemId: number,
): GearPayload {
  return updateSlot(payload, stageIndex, slotIndex, (entry) => {
    if (entry?.item_id === itemId) return entry;
    // Enchant belongs to the old item; drop it. Alternates and the note
    // describe the slot, keep them (minus the newly equipped item).
    const alternates = entry?.alternates?.filter((a) => a.item_id !== itemId);
    return {
      item_id: itemId,
      ...(entry?.note ? { note: entry.note } : {}),
      ...(alternates && alternates.length > 0 ? { alternates } : {}),
    };
  });
}

export function clearSlot(payload: GearPayload, stageIndex: number, slotIndex: number): GearPayload {
  return updateSlot(payload, stageIndex, slotIndex, () => undefined);
}

export function setSlotEnchant(
  payload: GearPayload,
  stageIndex: number,
  slotIndex: number,
  enchantId: number | undefined,
): GearPayload {
  return updateSlot(payload, stageIndex, slotIndex, (entry) => {
    if (!entry) return entry;
    const next = { ...entry };
    if (enchantId && enchantId > 0) {
      next.enchant_id = enchantId;
    } else {
      delete next.enchant_id;
    }
    return next;
  });
}

export function setSlotNote(
  payload: GearPayload,
  stageIndex: number,
  slotIndex: number,
  note: string,
): GearPayload {
  return updateSlot(payload, stageIndex, slotIndex, (entry) => {
    if (!entry) return entry;
    const next = { ...entry };
    if (note) {
      next.note = note;
    } else {
      delete next.note;
    }
    return next;
  });
}

export function addAlternate(
  payload: GearPayload,
  stageIndex: number,
  slotIndex: number,
  itemId: number,
): GearPayload {
  return updateSlot(payload, stageIndex, slotIndex, (entry) => {
    if (!entry) return entry;
    if (entry.item_id === itemId) return entry;
    const alternates = entry.alternates ?? [];
    if (alternates.length >= MAX_ALTERNATES) return entry;
    if (alternates.some((a) => a.item_id === itemId)) return entry;
    return { ...entry, alternates: [...alternates, { item_id: itemId }] };
  });
}

export function removeAlternate(
  payload: GearPayload,
  stageIndex: number,
  slotIndex: number,
  itemId: number,
): GearPayload {
  return updateSlot(payload, stageIndex, slotIndex, (entry) => {
    if (!entry?.alternates) return entry;
    const alternates = entry.alternates.filter((a) => a.item_id !== itemId);
    const next = { ...entry };
    if (alternates.length > 0) {
      next.alternates = alternates;
    } else {
      delete next.alternates;
    }
    return next;
  });
}

export function setAlternateNote(
  payload: GearPayload,
  stageIndex: number,
  slotIndex: number,
  itemId: number,
  note: string,
): GearPayload {
  return updateSlot(payload, stageIndex, slotIndex, (entry) => {
    if (!entry?.alternates) return entry;
    return {
      ...entry,
      alternates: entry.alternates.map((a) =>
        a.item_id === itemId ? (note ? { ...a, note } : { item_id: a.item_id }) : a,
      ),
    };
  });
}

/** Swap an alternate with the primary pick, preserving both notes. */
export function promoteAlternate(
  payload: GearPayload,
  stageIndex: number,
  slotIndex: number,
  itemId: number,
): GearPayload {
  return updateSlot(payload, stageIndex, slotIndex, (entry) => {
    if (!entry?.alternates) return entry;
    const idx = entry.alternates.findIndex((a) => a.item_id === itemId);
    if (idx < 0) return entry;
    const promoted = entry.alternates[idx];
    const alternates = [...entry.alternates];
    // The old primary takes the promoted alternate's list position.
    alternates[idx] = { item_id: entry.item_id };
    const next: GearSlotEntry = { ...entry, item_id: promoted.item_id, alternates };
    // The enchant belonged to the old primary item.
    delete next.enchant_id;
    return next;
  });
}
