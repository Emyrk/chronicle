import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useInstanceEventsContext, type CachedStream, type StreamType } from "@/hooks/instanceEvents";
import type { Instance } from "@/pages/Instance/InstancePage";
import { damageDoneProcessor, type DamageDoneResult } from "@/pages/Instance/EventsPanels/DamageDone/damageDone.processor";
import { damageDoneDefaultFilters, damageDoneFixedFilters } from "@/pages/Instance/EventsPanels/DamageDone/damageDoneFilters";
import { aggregateForEncounters } from "@/pages/Instance/EventsPanels/DamageDone/aggregateDamageDone";
import { processIncrementally, type IncrementalProcessorState } from "@/pages/Instance/EventsPanels/mainThreadProcessor";
import { raidFramesProcessor, type RaidFramesResult } from "@/pages/Instance/EventsPanels/RaidFrames/raidFrames.processor";
import { buildThreatView, threatProcessor, type ThreatResult } from "@/pages/Instance/EventsPanels/Threat/threat.processor";
import { serializableContext } from "./heroReplay";
import { meterTotals } from "./heroMeter";

const NO_SELECTION = { enemyIds: new Set<string>(), playerIds: new Set<string>() };
// The run page's Damage Done (players) with its fixed and default target filters; its time range is the pull's
// start to the cursor, where the processor stops.
const DAMAGE_FILTERS = [...damageDoneFixedFilters("players"), ...damageDoneDefaultFilters("players")];

/** The streams the hero already fetched; anything else a panel lists is left out, so nothing more downloads. */
function heroStreams(panelStreams: readonly StreamType[], fetched: readonly StreamType[]): StreamType[] {
  return [...new Set<StreamType>([...panelStreams, "unit_classification"])].filter((stream) => fetched.includes(stream));
}

/**
 * The live stats for the playing pull at `cursorMs` (absolute): Damage Done cumulative from the pull's start
 * (the run page's processor and filters, stopped at the cursor as the Watch tab's sync mode does) as the glass
 * meter's totals, the run page's Threat (estimated) table at the cursor the same way (on the hero's streams, so
 * without auras: unknown stances read as tanking once meleed), and Raid Frames processed once for the pull, for
 * reading at the cursor.
 */
export function useHeroStats(instance: Instance, encounterId: string | null, cursorMs: number | null, fetched: readonly StreamType[]) {
  const events = useInstanceEventsContext();
  const context = useMemo(() => encounterId ? serializableContext(instance, [encounterId]) : null, [encounterId, instance]);
  const damageContext = useMemo(() => context && { ...context, filters: DAMAGE_FILTERS }, [context]);

  const frames = useQuery({
    queryKey: ["landing-hero-raid-frames", instance.id, encounterId],
    enabled: context !== null,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const streams = heroStreams(raidFramesProcessor.streams, fetched);
      const loaded = await Promise.all(streams.map(async (type) => [type, await events.fetchStream(type)] as [StreamType, CachedStream]));
      const processed = await processIncrementally<RaidFramesResult>({
        panelId: raidFramesProcessor.id,
        streams: new Map(loaded),
        context: context!,
        stopAtTimestamp: null,
        previousState: null,
      });
      if (processed.error) throw new Error(processed.error);
      return processed.result;
    },
  });

  // Damage at the cursor: resumed forward from the last call; a seek back starts the pull over.
  const [damage, setDamage] = useState<{ encounterId: string; result: DamageDoneResult } | null>(null);
  const [threat, setThreat] = useState<{ encounterId: string; result: ThreatResult } | null>(null);
  // The run the loop works on, read afresh each time round; its state resumes only for the same context.
  const latest = useRef({ context, damageContext, encounterId, fetched });
  const damageState = useRef<{ context: typeof damageContext; state: IncrementalProcessorState<DamageDoneResult> } | null>(null);
  const threatState = useRef<{ context: typeof context; state: IncrementalProcessorState<ThreatResult> } | null>(null);
  const running = useRef(false);
  const pending = useRef<number | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    latest.current = { context, damageContext, encounterId, fetched };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!damageContext || cursorMs === null) return;
    pending.current = cursorMs;
    if (running.current) return;
    running.current = true;
    void (async () => {
      try {
        // The latest cursor each time round; ticks that arrive meanwhile collapse into one.
        while (pending.current !== null && mounted.current) {
          const stopAt = new Date(pending.current);
          pending.current = null;
          const { context: pullContext, damageContext: context, encounterId: id, fetched: available } = latest.current;
          if (!context || !pullContext || !id) break;
          const streams = heroStreams(damageDoneProcessor.streams, available);
          const loaded = await Promise.all(streams.map(async (type) => [type, await events.fetchStream(type)] as [StreamType, CachedStream]));
          const previous = damageState.current?.context === context ? damageState.current.state : null;
          const processed = await processIncrementally<DamageDoneResult>({
            panelId: damageDoneProcessor.id,
            streams: new Map(loaded),
            context,
            stopAtTimestamp: stopAt,
            previousState: previous,
          });
          if (processed.error || !mounted.current) break;
          damageState.current = { context, state: processed };
          setDamage({ encounterId: id, result: processed.result });
          const threatStreams = heroStreams(threatProcessor.streams, available);
          const threatLoaded = await Promise.all(threatStreams.map(async (type) => [type, await events.fetchStream(type)] as [StreamType, CachedStream]));
          const threatPrevious = threatState.current?.context === pullContext ? threatState.current.state : null;
          const threatProcessed = await processIncrementally<ThreatResult>({
            panelId: threatProcessor.id,
            streams: new Map(threatLoaded),
            context: pullContext,
            stopAtTimestamp: stopAt,
            previousState: threatPrevious,
          });
          if (threatProcessed.error || !mounted.current) break;
          threatState.current = { context: pullContext, state: threatProcessed };
          setThreat({ encounterId: id, result: threatProcessed.result });
        }
      } finally {
        running.current = false;
      }
    })();
  }, [cursorMs, damageContext, events]);

  const encounterStartMs = useMemo(() => {
    const encounter = instance.encounters.find((candidate) => candidate.id === encounterId);
    return encounter ? Date.parse(encounter.start_time) : null;
  }, [encounterId, instance]);
  const damageResult = damage?.encounterId === encounterId ? damage.result : null;
  const framesResult = frames.data ?? null;
  const threatResult = threat?.encounterId === encounterId ? threat.result : null;
  const bossIds = useMemo(() => new Set((instance.encounters.find((encounter) => encounter.id === encounterId)?.enemies ?? [])
    .filter((enemy) => enemy.boss).map((enemy) => enemy.id)), [encounterId, instance]);
  // One object per change, so the hero reports it only when it moves.
  return useMemo(() => {
    if (!encounterId || cursorMs === null) return null;
    // Rates over the pull so far, as the run page's Damage Done over the same window; its rows, as the meter shows them.
    const elapsedMs = encounterStartMs === null ? 0 : cursorMs - encounterStartMs;
    const rows = damageResult ? aggregateForEncounters("players", damageResult, [encounterId], NO_SELECTION) : null;
    return {
      encounterId,
      cursorMs,
      elapsedMs,
      damage: rows && meterTotals(rows.map((row) => ({ name: row.playerName, className: row.className, amount: row.value })), elapsedMs),
      frames: framesResult,
      threat: threatResult && buildThreatView(threatResult, [encounterId], NO_SELECTION.enemyIds, bossIds),
    };
  }, [bossIds, cursorMs, damageResult, encounterId, encounterStartMs, framesResult, threatResult]);
}

export type HeroStats = NonNullable<ReturnType<typeof useHeroStats>>;
