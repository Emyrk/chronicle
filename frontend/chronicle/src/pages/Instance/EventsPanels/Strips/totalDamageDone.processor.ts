import type { DamageProcessorEvent, PanelProcessor } from "../processorTypes";

export interface TotalDamageEncounter {
  startMilli: number;
  endMilli: number;
  total: number;
  events: Array<{ offsetMilli: number; amount: number }>;
}

export interface TotalDamageDoneResult {
  encounters: Map<string, TotalDamageEncounter>;
  total: number;
}

export const totalDamageDoneStripProcessor: PanelProcessor<
  TotalDamageDoneResult,
  DamageProcessorEvent
> = {
  id: "total_damage_done_strip",
  streams: ["damage"],
  createState: () => ({ encounters: new Map(), total: 0 }),
  processEvent(state, event, encounterId, firstTimestamp) {
    if (event.type !== "damage") return;
    const amount = Math.max(0, event.amount);
    if (amount === 0) return;

    const startMilli = firstTimestamp.getTime();
    const encounter = state.encounters.get(encounterId) ?? {
      startMilli,
      endMilli: startMilli,
      total: 0,
      events: [],
    };
    encounter.total += amount;
    encounter.endMilli = Math.max(encounter.endMilli, startMilli + event.offsetMilli);
    encounter.events.push({ offsetMilli: event.offsetMilli, amount });
    state.encounters.set(encounterId, encounter);
    state.total += amount;
  },
};

export interface TotalDamageBucket {
  amount: number;
}

export function totalDamageBuckets(
  result: TotalDamageDoneResult,
  encounterIds: readonly string[],
  bucketCount: number,
): TotalDamageBucket[] {
  const count = Math.max(1, Math.floor(bucketCount));
  const buckets = Array.from({ length: count }, () => ({ amount: 0 }));
  const encounters = encounterIds
    .map((id) => result.encounters.get(id))
    .filter((encounter): encounter is TotalDamageEncounter => Boolean(encounter));
  const durations = encounters.map((encounter) => Math.max(1, encounter.endMilli - encounter.startMilli));
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
  if (totalDuration <= 0) return buckets;

  let elapsed = 0;
  encounters.forEach((encounter, encounterIndex) => {
    const duration = durations[encounterIndex];
    for (const event of encounter.events) {
      const position = (elapsed + Math.min(duration, Math.max(0, event.offsetMilli))) / totalDuration;
      const index = Math.min(count - 1, Math.floor(position * count));
      buckets[index].amount += event.amount;
    }
    elapsed += duration;
  });

  return buckets;
}
