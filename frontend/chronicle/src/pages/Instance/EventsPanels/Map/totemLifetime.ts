import type { ResolvedInstanceUnit } from "../../instanceUnits";
import type { MapEncounterPositions } from "./map.processor";

type Element = "air" | "earth" | "fire" | "water";

// Map-only visibility limits. Durations include the parser's longest known
// talent/set bonus for each family; a new totem in the same slot ends it sooner.
// Match names as well as entries: custom servers may have unlisted ranks/IDs.
const TOTEMS: Record<string, { element: Element; maxMs: number }> = {
  "grounding totem": { element: "air", maxMs: 45_000 },
  "windwall totem": { element: "air", maxMs: 144_000 },
  "windfury totem": { element: "air", maxMs: 144_000 },
  "wrath of air totem": { element: "air", maxMs: 144_000 },
  "grace of air totem": { element: "air", maxMs: 144_000 },
  "nature resistance totem": { element: "air", maxMs: 144_000 },
  "tremor totem": { element: "earth", maxMs: 144_000 },
  "earthbind totem": { element: "earth", maxMs: 54_000 },
  "stoneclaw totem": { element: "earth", maxMs: 18_000 },
  "strength of earth totem": { element: "earth", maxMs: 144_000 },
  "stoneskin totem": { element: "earth", maxMs: 144_000 },
  "earth elemental totem": { element: "earth", maxMs: 120_000 },
  "searing totem": { element: "fire", maxMs: 70_000 },
  "magma totem": { element: "fire", maxMs: 20_000 },
  "fire nova totem": { element: "fire", maxMs: 6_000 },
  "flametongue totem": { element: "fire", maxMs: 144_000 },
  "fire resistance totem": { element: "fire", maxMs: 144_000 },
  "fire elemental totem": { element: "fire", maxMs: 120_000 },
  "mana spring totem": { element: "water", maxMs: 72_000 },
  "ancient mana spring totem": { element: "water", maxMs: 24_000 },
  "healing stream totem": { element: "water", maxMs: 60_000 },
  "poison cleansing totem": { element: "water", maxMs: 144_000 },
  "poison cleaning totem": { element: "water", maxMs: 144_000 },
  "disease cleansing totem": { element: "water", maxMs: 144_000 },
  "frost resistance totem": { element: "water", maxMs: 144_000 },
  "mana tide totem": { element: "water", maxMs: 12_000 },
  "water elemental totem": { element: "water", maxMs: 300_000 },
};

interface TotemLife {
  guid: string;
  owner: string;
  element?: Element;
  startMs: number;
  endMs: number;
}

/** Compute map visibility, without using combat activity as a proxy for spawn time. */
export function totemLifetimes(
  encounter: MapEncounterPositions,
  units: Record<string, ResolvedInstanceUnit>,
): Map<string, { startMs: number; endMs: number }> {
  const lives: TotemLife[] = [];
  for (const [guid, positions] of encounter.positionsByUnit) {
    const unit = units[guid];
    if (!unit?.owner || !/\btotem\b/i.test(unit.name)) continue;
    // Synthetic positions can predate the actual first sighting of a summon.
    // If no real sample survives, still bound the marker to the synthetic one.
    const first = positions.find((position) => !position.synthetic) ?? positions[0];
    if (!first) continue;
    const family = unit.name.toLowerCase().replace(/\s+(?:[ivx]+|\d+)$/, "").trim();
    const definition = TOTEMS[family];
    // Unknown server-specific totems still expire; do not guess their element.
    const maxMs = definition?.maxMs ?? 144_000;
    lives.push({ guid, owner: unit.owner, element: definition?.element, startMs: first.timestampMs, endMs: first.timestampMs + maxMs });
  }
  lives.sort((a, b) => a.startMs - b.startMs || a.guid.localeCompare(b.guid));
  const active = new Map<string, TotemLife>();
  for (const life of lives) {
    if (!life.element) continue;
    const slot = `${life.owner}:${life.element}`;
    const previous = active.get(slot);
    if (previous) previous.endMs = Math.min(previous.endMs, life.startMs);
    active.set(slot, life);
  }
  const recallsByOwner = new Map<string, number[]>();
  for (const event of encounter.effects.events) {
    if (event.kind !== "cast_go" || event.spellId !== 45513 || event.source !== event.target) continue;
    const recalls = recallsByOwner.get(event.source) ?? [];
    recalls.push(event.timestampMs);
    recallsByOwner.set(event.source, recalls);
  }
  for (const life of lives) {
    for (const recall of recallsByOwner.get(life.owner) ?? []) {
      if (recall >= life.startMs) life.endMs = Math.min(life.endMs, recall);
    }
    for (const death of encounter.effects.deathsByUnit.get(life.guid) ?? []) {
      if (death >= life.startMs) life.endMs = Math.min(life.endMs, death);
    }
  }
  return new Map(lives.map(({ guid, startMs, endMs }) => [guid, { startMs, endMs }]));
}
