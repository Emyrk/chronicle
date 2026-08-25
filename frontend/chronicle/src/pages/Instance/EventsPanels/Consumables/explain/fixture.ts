import type { Instance } from "../../../InstancePage";
import type { EntitySelection, PanelContext, PanelRenderProps } from "../../types";
import type {
  ConsumableObservation,
  ConsumablesResult,
  ConsumableUse,
} from "../consumables.processor";

export const FIXTURE_DURATION_MS = 315_000;

export const FIXTURE_PLAYERS = {
  warrior: "0x000000000000C001",
  mage: "0x000000000000C002",
  priest: "0x000000000000C003",
  rogue: "0x000000000000C004",
  hunter: "0x000000000000C005",
  warlock: "0x000000000000C006",
  druid: "0x000000000000C007",
  paladin: "0x000000000000C008",
} as const;

const ENCOUNTERS = ["consume-enc-1", "consume-enc-2", "consume-enc-3"] as const;
const START = Date.parse("2024-01-01T20:00:00Z");

interface UseInput {
  id: string;
  player: string;
  itemId: number | null;
  encounter: (typeof ENCOUNTERS)[number];
  offset: number;
  spellId: number;
  spellName: string;
  confidence?: number;
  candidates?: number[];
  kind?: number;
  activeAtPullOnly?: boolean;
}

function makeUse(input: UseInput): ConsumableUse {
  const confidence = input.confidence ?? 1;
  const kind = input.kind ?? 1;
  const observedAt = START + input.offset;
  const observation: ConsumableObservation = {
    evidenceId: `${input.id}-evidence`,
    kind,
    confidence,
    isProjection: false,
    encounterID: input.encounter,
    observedAtUnixMilli: observedAt,
    amount: kind === 5 ? 1800 : null,
    resourceType: kind === 5 ? "Mana" : null,
  };

  return {
    consumeId: input.id,
    player: input.player,
    itemId: input.itemId,
    candidateItemIds: input.candidates ?? [],
    candidateEffectKind: input.candidates?.length ? "buff" : null,
    candidateSpellId: input.candidates?.length ? input.spellId : null,
    spellId: input.spellId,
    spellName: input.spellName,
    bestConfidence: confidence,
    kinds: [kind],
    activeAtPullOnly: input.activeAtPullOnly ?? false,
    observedAtUnixMilli: observedAt,
    consumedAtUnixMilli: input.activeAtPullOnly ? null : observedAt,
    auraSpells: kind === 3 || kind === 7 ? [{ id: input.spellId, name: input.spellName }] : [],
    encounterID: input.encounter,
    offsetMilli: input.offset,
    dateMilli: observedAt,
    observations: [observation],
  };
}

const USE_INPUTS: UseInput[] = [
  { id: "c01", player: FIXTURE_PLAYERS.warrior, itemId: 13446, encounter: ENCOUNTERS[0], offset: 18_000, spellId: 17534, spellName: "Major Healing Potion" },
  { id: "c02", player: FIXTURE_PLAYERS.warrior, itemId: 13446, encounter: ENCOUNTERS[1], offset: 142_000, spellId: 17534, spellName: "Major Healing Potion" },
  { id: "c03", player: FIXTURE_PLAYERS.warrior, itemId: 12451, encounter: ENCOUNTERS[0], offset: -12_000, spellId: 16323, spellName: "Juju Power", confidence: 2, kind: 3 },
  { id: "c04", player: FIXTURE_PLAYERS.mage, itemId: 13444, encounter: ENCOUNTERS[0], offset: 64_000, spellId: 17531, spellName: "Major Mana Potion", kind: 5 },
  { id: "c05", player: FIXTURE_PLAYERS.mage, itemId: 13444, encounter: ENCOUNTERS[2], offset: 244_000, spellId: 17531, spellName: "Major Mana Potion", kind: 5 },
  { id: "c06", player: FIXTURE_PLAYERS.mage, itemId: 20007, encounter: ENCOUNTERS[0], offset: -8_000, spellId: 24363, spellName: "Mageblood Potion", confidence: 2, kind: 7, activeAtPullOnly: true },
  { id: "c07", player: FIXTURE_PLAYERS.priest, itemId: 13444, encounter: ENCOUNTERS[1], offset: 105_000, spellId: 17531, spellName: "Major Mana Potion", kind: 5 },
  { id: "c08", player: FIXTURE_PLAYERS.priest, itemId: 20007, encounter: ENCOUNTERS[0], offset: -7_000, spellId: 24363, spellName: "Mageblood Potion", confidence: 2, kind: 7, activeAtPullOnly: true },
  { id: "c09", player: FIXTURE_PLAYERS.rogue, itemId: 13452, encounter: ENCOUNTERS[0], offset: -5_000, spellId: 17538, spellName: "Elixir of the Mongoose", confidence: 2, kind: 3 },
  { id: "c10", player: FIXTURE_PLAYERS.rogue, itemId: 5634, encounter: ENCOUNTERS[2], offset: 225_000, spellId: 6615, spellName: "Free Action Potion" },
  { id: "c11", player: FIXTURE_PLAYERS.hunter, itemId: 13446, encounter: ENCOUNTERS[2], offset: 252_000, spellId: 17534, spellName: "Major Healing Potion" },
  { id: "c12", player: FIXTURE_PLAYERS.warlock, itemId: 13512, encounter: ENCOUNTERS[0], offset: -15_000, spellId: 17628, spellName: "Flask of Supreme Power", confidence: 2, kind: 7, activeAtPullOnly: true },
  { id: "c13", player: FIXTURE_PLAYERS.druid, itemId: 13446, encounter: ENCOUNTERS[1], offset: 155_000, spellId: 17534, spellName: "Major Healing Potion" },
  { id: "c14", player: FIXTURE_PLAYERS.paladin, itemId: 13444, encounter: ENCOUNTERS[2], offset: 266_000, spellId: 17531, spellName: "Major Mana Potion", kind: 5 },
  { id: "c15", player: FIXTURE_PLAYERS.mage, itemId: null, candidates: [13453, 20004], encounter: ENCOUNTERS[1], offset: 128_000, spellId: 24361, spellName: "Mighty Troll's Blood Potion", confidence: 3, kind: 3 },
  { id: "c16", player: FIXTURE_PLAYERS.priest, itemId: null, candidates: [], encounter: ENCOUNTERS[2], offset: 278_000, spellId: 11371, spellName: "Gift of Arthas", confidence: 4, kind: 3 },
];

let fixtureResult: ConsumablesResult | null = null;

export function getFixtureResult(): ConsumablesResult {
  if (fixtureResult) return fixtureResult;
  const uses = USE_INPUTS.map(makeUse);
  fixtureResult = {
    seenEvidence: new Map(uses.flatMap((use) => use.observations.map((obs) => [obs.evidenceId, true] as const))),
    uses: new Map(uses.map((use) => [use.consumeId, use])),
    unknownUseIds: new Map([["c16", true]]),
  };
  return fixtureResult;
}

export function getUnresolvedFixtureResult(): ConsumablesResult {
  const result = getFixtureResult();
  const ids = new Set(["c04", "c06", "c15", "c16"]);
  const uses = new Map([...result.uses].filter(([id]) => ids.has(id)));
  return {
    uses,
    seenEvidence: new Map(
      [...result.seenEvidence].filter(([evidenceId]) =>
        [...ids].some((id) => evidenceId.startsWith(id)),
      ),
    ),
    unknownUseIds: new Map([["c16", true]]),
  };
}

export function getFixtureInstance(): Instance {
  return {
    id: "consumables-example",
    name: "Molten Core Example",
    startTime: new Date(START).toISOString(),
    encounters: ENCOUNTERS.map((id, index) => ({
      id,
      name: ["Lucifron", "Magmadar", "Gehennas"][index],
      boss: true,
      kill_type: "clean",
      start_time: new Date(START + index * 105_000).toISOString(),
      end_time: new Date(START + (index + 1) * 105_000).toISOString(),
      enemies: [],
    })),
    players: {
      [FIXTURE_PLAYERS.warrior]: { name: "Ironwall", class: "WARRIOR", race: "Human", level: 60 },
      [FIXTURE_PLAYERS.mage]: { name: "Frostweaver", class: "MAGE", race: "Gnome", level: 60 },
      [FIXTURE_PLAYERS.priest]: { name: "Dawnmend", class: "PRIEST", race: "Dwarf", level: 60 },
      [FIXTURE_PLAYERS.rogue]: { name: "Nightshiv", class: "ROGUE", race: "Human", level: 60 },
      [FIXTURE_PLAYERS.hunter]: { name: "Eagleeye", class: "HUNTER", race: "Night Elf", level: 60 },
      [FIXTURE_PLAYERS.warlock]: { name: "Hexbinder", class: "WARLOCK", race: "Gnome", level: 60 },
      [FIXTURE_PLAYERS.druid]: { name: "Oakheart", class: "DRUID", race: "Night Elf", level: 60 },
      [FIXTURE_PLAYERS.paladin]: { name: "Lightward", class: "PALADIN", race: "Human", level: 60 },
    },
    units: {},
    capabilities: [],
  } as unknown as Instance;
}

export function getFixturePanelContext(): PanelContext {
  const entitySelection: EntitySelection = { enemyIds: new Set(), playerIds: new Set() };
  return {
    instance: getFixtureInstance(),
    selectedPhaseIds: [],
    selectedEncounterIds: [...ENCOUNTERS],
    entitySelection,
  };
}

export function getFixtureRenderProps(): PanelRenderProps<ConsumablesResult> {
  return {
    result: getFixtureResult(),
    totalEvents: USE_INPUTS.length,
    processingTimeMs: 0,
    durationMs: FIXTURE_DURATION_MS,
    perSecond: false,
    checkboxChecked: false,
    loading: false,
    processing: false,
    error: null,
    context: getFixturePanelContext(),
    panelOption: `pl:${FIXTURE_PLAYERS.mage}`,
    panelContextVersion: 0,
  };
}
