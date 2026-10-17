import type { InstancePlayer, KillType, WoWHeroClasses } from "@/api/typesGenerated";
import type { ResolvedInstanceUnit } from "@/pages/Instance/instanceUnits";
import type { WowMapManifest } from "@/pages/Technical/mapGallery";
import type { StreamType } from "@/hooks/instanceEvents";
import type { Instance } from "../../../InstancePage";
import type { ProcessorContext } from "../../processorTypes";
import type { PanelContext, PanelRenderProps } from "../../types";
import { mapProcessor, type MapProcessorEvent, type MapResult } from "../map.processor";

/**
 * A captured encounter written by scripts/capture-kresh-fixture.mjs. Event
 * rows are `[code, offsetMilli, ...fields]` in stream-index order, with GUIDs
 * as indexes into `guids`; they keep only the fields map.processor.ts reads.
 */
export interface MapFixture {
  source: { host: string; instanceId: string; encounterId: string };
  instance: { name: string; iconBaseUrl: string; capabilities: string[] };
  encounter: {
    id: string;
    name: string;
    boss: boolean;
    mapId: number;
    killType: string;
    startTime: string;
    endTime: string;
    enemies: { id: string; name: string; boss: boolean }[];
  };
  firstTimestamp: string;
  manifest: WowMapManifest;
  players: Record<string, { name: string; class: string }>;
  units: Record<string, { name: string; entry: number; owner?: string }>;
  guids: string[];
  events: (string | number | null)[][];
}

export interface LoadedMapFixture {
  props: PanelRenderProps<MapResult>;
  manifest: WowMapManifest;
  startMs: number;
  endMs: number;
}

const STREAM_TYPES: Record<string, StreamType> = {
  p: "unit_position",
  r: "unit_resources",
  d: "damage",
  h: "heal",
  s: "spell_start",
  g: "spell_go",
  i: "interrupt",
  k: "slain",
  z: "ressurection",
};

// Rebuilds the stream event from a fixture row. Only the fields the Map
// processor reads are present, hence the cast.
function toEvent(row: MapFixture["events"][number], index: number, guids: string[]): MapProcessorEvent {
  const [code, offsetMilli, ...f] = row as [string, number, ...never[]];
  const guid = (value: number) => guids[value];
  const base = { type: STREAM_TYPES[code], index, offsetMilli };
  switch (code) {
    case "p":
      return { ...base, unit: guid(f[0]), x: f[1], y: f[2], mapId: f[3], facing: f[4] } as unknown as MapProcessorEvent;
    case "r":
      return { ...base, unit: guid(f[0]), currentHealth: f[1], maximumHealth: f[2], absorb: f[3] } as unknown as MapProcessorEvent;
    case "d":
    case "h":
      return {
        ...base,
        caster: guid(f[0]),
        target: guid(f[1]),
        amount: f[2],
        hitType: f[3],
        schools: [f[4]],
        spellId: f[5],
        sourceName: f[6],
        // The fixture does not record overheal or absorbs; count heals as fully effective.
        ...(code === "h" ? { overheal: 0, absorbed: 0 } : {}),
      } as unknown as MapProcessorEvent;
    case "s":
      return { ...base, caster: guid(f[0]), target: guid(f[1]), castTimeMilli: f[2], spell: { id: f[3], name: f[4] } } as unknown as MapProcessorEvent;
    case "g":
      return { ...base, caster: guid(f[0]), target: guid(f[1]), numHits: f[2], spell: { id: f[3], name: f[4] } } as unknown as MapProcessorEvent;
    case "z":
      return { ...base, source: guid(f[0]), target: guid(f[1]) } as unknown as MapProcessorEvent;
    case "i":
    case "k":
      return { ...base, caster: guid(f[0]), target: guid(f[1]) } as unknown as MapProcessorEvent;
    default:
      throw new Error(`Unknown fixture event code: ${code}`);
  }
}

/**
 * Runs a fixture's events through the production `mapProcessor` and builds
 * the Map panel's render props for that one encounter.
 */
export function loadMapFixture(fixture: MapFixture, options: { selectPlayers?: boolean } = {}): LoadedMapFixture {
  const encounterId = fixture.encounter.id;
  const playerIds = new Set(options.selectPlayers ? Object.keys(fixture.players) : []);
  const processorContext: ProcessorContext = {
    players: fixture.players,
    units: Object.fromEntries(Object.entries(fixture.units)
      .map(([guid, unit]) => [guid, { name: unit.name, entry: unit.entry, owner: unit.owner ?? null }])),
    selectedEncounterIds: new Set([encounterId]),
    entitySelection: { enemyIds: new Set(), playerIds },
  };

  const firstTimestamp = new Date(fixture.firstTimestamp);
  const result = mapProcessor.createState();
  fixture.events.forEach((row, index) => {
    const event = toEvent(row, index, fixture.guids);
    mapProcessor.processEvent(result, event, encounterId, firstTimestamp, event.type as StreamType, processorContext);
  });

  const players: Record<string, InstancePlayer> = Object.fromEntries(Object.entries(fixture.players)
    .map(([guid, player]) => [guid, { name: player.name, class: player.class as WoWHeroClasses, race: "Unknown", level: 0 }]));
  const instance: Instance = {
    id: fixture.source.instanceId,
    name: fixture.instance.name,
    iconBaseUrl: fixture.instance.iconBaseUrl,
    startTime: fixture.encounter.startTime,
    endTime: fixture.encounter.endTime,
    capabilities: fixture.instance.capabilities,
    players,
    // Owners stay the wire strings the API sends.
    units: fixture.units as unknown as Record<string, ResolvedInstanceUnit>,
    encounters: [{
      id: encounterId,
      name: fixture.encounter.name,
      boss: fixture.encounter.boss,
      mapId: fixture.encounter.mapId,
      kill_type: fixture.encounter.killType as KillType,
      start_time: fixture.encounter.startTime,
      end_time: fixture.encounter.endTime,
      enemies: fixture.encounter.enemies.map((enemy) => ({ ...enemy, damageTaken: 0, damageDone: 0, periods: [] })),
    }],
  };
  const context: PanelContext = {
    instance,
    selectedEncounterIds: [encounterId],
    entitySelection: { enemyIds: new Set(), playerIds },
  };

  const startMs = firstTimestamp.getTime();
  return {
    props: {
      result,
      totalEvents: fixture.events.length,
      processingTimeMs: null,
      durationMs: new Date(fixture.encounter.endTime).getTime() - startMs,
      perSecond: false,
      checkboxChecked: false,
      loading: false,
      processing: false,
      error: null,
      context,
    },
    manifest: fixture.manifest,
    startMs,
    endMs: new Date(fixture.encounter.endTime).getTime(),
  };
}
