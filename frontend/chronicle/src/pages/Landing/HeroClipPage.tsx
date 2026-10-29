import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useInstance } from "@/api/queries";
import { InstanceEventsProvider, useInstanceEventsContext, type CachedStream, type StreamType } from "@/hooks/instanceEvents";
import type { Instance } from "@/pages/Instance/InstancePage";
import { transformToInstance } from "@/pages/Instance/transformInstance";
import { damageDoneProcessor, type DamageDoneResult } from "@/pages/Instance/EventsPanels/DamageDone/damageDone.processor";
import { deathsProcessor, type DeathsResult } from "@/pages/Instance/EventsPanels/Deaths/deaths.processor";
import { processIncrementally } from "@/pages/Instance/EventsPanels/mainThreadProcessor";
import LandingHero3D from "./LandingHero3D";
import { serializableContext, type HeroReplay, type HeroWindow } from "./heroReplay";

/** The pull's numbers, for the landing clip manifest (scripts/record-hero-clip.mjs). */
export interface HeroClipPull {
  durationMs: number;
  players: { name: string; className: string; damage: number }[];
  deaths: { victim: string; className: string; offsetMs: number; ability: string | null; amount: number | null; source: string }[];
}

declare global {
  interface Window {
    /** Read by scripts/record-hero-clip.mjs: the replay's clock (ms from the window's start) once it shows, and the pull's numbers. */
    __heroClip?: { currentMs: number | null; pull: HeroClipPull | null; startOffsetMs: number };
  }
}

function sumTargets(target: Map<string, number>): number {
  let total = 0;
  for (const amount of target.values()) total += amount;
  return total;
}

function usePullNumbers(instance: Instance, encounterId: string, startOffsetMs: number) {
  const events = useInstanceEventsContext();
  return useQuery({
    queryKey: ["hero-clip-pull", instance.id, encounterId],
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<HeroClipPull> => {
      const context = serializableContext(instance, [encounterId]);
      const run = async <T,>(panelId: string, streams: StreamType[]) => {
        const fetched = await Promise.all(streams.map(async (type) => [type, await events.fetchStream(type)] as [StreamType, CachedStream]));
        const processed = await processIncrementally<T>({ panelId, streams: new Map(fetched), context, stopAtTimestamp: null, previousState: null });
        if (processed.error) throw new Error(processed.error);
        return processed.result;
      };
      const damage = await run<DamageDoneResult>(damageDoneProcessor.id, damageDoneProcessor.streams);
      const deaths = await run<DeathsResult>("death_log", deathsProcessor.streams);
      const encounter = instance.encounters.find((candidate) => candidate.id === encounterId)!;
      const instanceStartMs = Date.parse(instance.startTime);
      return {
        durationMs: Date.parse(encounter.end_time) - Date.parse(encounter.start_time),
        // The run's players only: a mind-controlled player's damage is credited to the boss.
        players: [...(damage.EncounterDamage.get(encounterId)?.values() ?? [])]
          .filter((player) => instance.players?.[player.playerID])
          .map((player) => ({ name: player.playerName, className: player.className, damage: sumTargets(player.target) }))
          .sort((a, b) => b.damage - a.damage),
        // Offsets from the window's start, as the replay's clock.
        deaths: deaths.DeathEvents.map((death) => ({
          victim: death.playerName,
          className: death.className,
          offsetMs: death.dateMilli - instanceStartMs - startOffsetMs,
          ability: death.attribution?.sourceName ?? null,
          amount: death.attribution?.amount ?? null,
          source: death.killerName,
        })),
      };
    },
  });
}

function HeroClip({ instance, encounterId, fromMs }: { instance: Instance; encounterId: string; fromMs: number }) {
  const encounter = instance.encounters.find((candidate) => candidate.id === encounterId);
  const instanceStartMs = Date.parse(instance.startTime);
  const pull = useMemo((): HeroWindow | null => encounter ? {
    encounterId,
    startOffsetMs: Date.parse(encounter.start_time) - instanceStartMs + fromMs,
    endOffsetMs: Date.parse(encounter.end_time) - instanceStartMs,
  } : null, [encounter, encounterId, fromMs, instanceStartMs]);
  const numbers = usePullNumbers(instance, encounterId, pull?.startOffsetMs ?? 0);
  const [currentMs, setCurrentMs] = useState<number | null>(null);
  const onReplay = useCallback((replay: HeroReplay | null) => setCurrentMs(replay?.currentMs ?? null), []);
  useEffect(() => {
    window.__heroClip = { currentMs, pull: numbers.data ?? null, startOffsetMs: pull?.startOffsetMs ?? 0 };
  }, [currentMs, numbers.data, pull]);
  if (!pull) return null;
  return <LandingHero3D instanceId={instance.id} startOffsetMs={pull.startOffsetMs} pull={pull} active onReplay={onReplay} />;
}

/**
 * One boss pull replayed full-window from the Watch camera, nothing but the 3D canvas:
 * recorded into the landing hero's clips by scripts/record-hero-clip.mjs.
 * `?encounter=<id>&from=<ms into the pull>`.
 */
export function HeroClipPage() {
  const { instanceId = "" } = useParams();
  const [search] = useSearchParams();
  const encounterId = search.get("encounter") ?? "";
  const fromMs = Number(search.get("from") ?? 0);
  const { data: apiInstance } = useInstance(instanceId);
  const instance = useMemo(() => apiInstance ? transformToInstance(apiInstance) : null, [apiInstance]);
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0c1322]">
      <InstanceEventsProvider instanceId={instanceId}>
        {instance && <HeroClip instance={instance} encounterId={encounterId} fromMs={fromMs} />}
      </InstanceEventsProvider>
    </div>
  );
}
