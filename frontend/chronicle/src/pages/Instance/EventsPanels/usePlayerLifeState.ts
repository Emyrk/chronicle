import { useEffect, useState } from "react";
import { useInstanceEventsContext, type StreamType } from "@/hooks/instanceEvents";
import type { PanelContext } from "./types";
import type { ProcessorPlayer, WorkerRequest } from "./processorTypes";
import { executeRequest } from "./workerPool";
import {
  PlayerLifeStateIndex,
  type PlayerLifeStateResult,
} from "./processors/playerLifeState.processor";

const PLAYER_LIFE_STREAMS: StreamType[] = ["slain", "ressurection", "damage", "heal"];

interface PlayerLifeStateSnapshot {
  state: PlayerLifeStateIndex;
  loading: boolean;
  error: Error | null;
}

interface PlayerLifeStateCacheEntry {
  snapshot: PlayerLifeStateSnapshot;
  promise: Promise<void> | null;
  listeners: Set<() => void>;
}

const EMPTY_PLAYER_LIFE_STATE = new PlayerLifeStateIndex([]);
const cache = new Map<string, PlayerLifeStateCacheEntry>();
let nextRequestId = 1_000_000;

function cacheEntry(instanceId: string): PlayerLifeStateCacheEntry {
  let entry = cache.get(instanceId);
  if (!entry) {
    entry = {
      snapshot: { state: EMPTY_PLAYER_LIFE_STATE, loading: true, error: null },
      promise: null,
      listeners: new Set(),
    };
    cache.set(instanceId, entry);
  }
  return entry;
}

function publish(entry: PlayerLifeStateCacheEntry, snapshot: PlayerLifeStateSnapshot): void {
  entry.snapshot = snapshot;
  for (const listener of entry.listeners) listener();
}

function processorPlayers(context: PanelContext): Record<string, ProcessorPlayer> {
  return Object.fromEntries(Object.entries(context.instance.players ?? {}).map(([guid, player]) => [guid, {
    name: player.name,
    class: player.class,
    level: player.level,
  }]));
}

function loadPlayerLifeState(
  entry: PlayerLifeStateCacheEntry,
  context: PanelContext,
  fetchStream: ReturnType<typeof useInstanceEventsContext>["fetchStream"],
): void {
  if (entry.promise) return;
  entry.promise = (async () => {
    try {
      const streams = await Promise.all(PLAYER_LIFE_STREAMS.map(async (type) => ({
        type,
        data: (await fetchStream(type)).data,
      })));
      const request: WorkerRequest = {
        requestId: nextRequestId++,
        panelId: "player_life_state",
        context: {
          players: processorPlayers(context),
          units: {},
          selectedEncounterIds: context.instance.encounters.map((encounter) => encounter.id),
          entitySelection: { playerIds: [], enemyIds: [] },
          capabilities: context.instance.capabilities ?? [],
          filters: [],
        },
        streams,
      };
      const response = await executeRequest(request);
      if (response.error) throw new Error(response.error);
      const result = response.result as Pick<PlayerLifeStateResult, "transitions">;
      publish(entry, {
        state: new PlayerLifeStateIndex(result.transitions ?? []),
        loading: false,
        error: null,
      });
    } catch (error) {
      publish(entry, {
        state: EMPTY_PLAYER_LIFE_STATE,
        loading: false,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  })();
}

/**
 * Lazily builds one unfiltered player life-state timeline per instance. The
 * first mounted consumer starts processing; later consumers reuse the cached
 * result and raw streams from InstanceEventsContext.
 */
export function usePlayerLifeState(
  context: PanelContext,
  enabled = true,
): PlayerLifeStateSnapshot {
  const events = useInstanceEventsContext();
  const instanceId = context.instance.id;
  const entry = cacheEntry(instanceId);
  const [, rerender] = useState(0);

  useEffect(() => {
    const listener = () => rerender((version) => version + 1);
    entry.listeners.add(listener);
    if (enabled) loadPlayerLifeState(entry, context, events.fetchStream);
    return () => {
      entry.listeners.delete(listener);
    };
  }, [context, enabled, entry, events.fetchStream]);

  return entry.snapshot;
}
