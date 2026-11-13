import { useContext, useState } from "react";
import { EncounterFloorContext } from "./encounterFloorContext";
import { useQuery } from "@tanstack/react-query";
import { mapAssetUrl, type WowMapInstance } from "@/pages/Technical/mapGallery";
import type { PanelRenderProps } from "../types";
import type { MapResult } from "./map.processor";
import { EncounterFloorMemory, encounterFloorScope, estimateEncounterFloor, firstFloorEncounter, instanceNameFloor } from "./encounterFloor";
import { fetchFloorSupport, usableFloorSupport } from "./floorSupport";

export function useEncounterFloor(props: PanelRenderProps<MapResult>, map: WowMapInstance | undefined) {
  const provided = useContext(EncounterFloorContext);
  const [fallback] = useState(() => new Map<string, EncounterFloorMemory>());
  const memories = provided ?? fallback;
  const [, update] = useState(0);
  const instance = props.context.instance;
  const anchor = firstFloorEncounter(instance.encounters, props.context.selectedEncounterIds);
  const floors = map?.floors.map(floor => floor.floor) ?? [];
  const namedFloor = instanceNameFloor(instance.name, map?.mapID ?? 0, floors);
  const descriptor = map?.floorSupport;
  const enabled = namedFloor === null && instance.positionCoordinateSpace !== "ui-map-normalized" && Boolean(instance.iconBaseUrl) && Boolean(map)
    && usableFloorSupport(descriptor, instance.datasetId, map?.mapID ?? 0, map?.floors ?? []);
  const query = useQuery({
    queryKey: ["map-floor-support", instance.iconBaseUrl, descriptor],
    enabled, retry: false, staleTime: Infinity,
    queryFn: ({ signal }) => fetchFloorSupport(mapAssetUrl(instance.iconBaseUrl!, descriptor!.path), descriptor!, signal),
  });
  const scope = encounterFloorScope(instance.datasetId, instance.id, map?.mapID ?? 0, descriptor?.sha256 ?? "no-support");
  let memory = memories.get(scope);
  if (!memory) {
    memory = new EncounterFloorMemory(); memories.set(scope, memory);
    if (memories.size > 8) memories.delete(memories.keys().next().value!);
  }
  const anchorID = anchor?.id ?? "";
  const manualFloorNumber = memory.correction(anchorID);
  const positions = props.result.encounters.get(anchorID);
  const pending = enabled && query.isPending;
  // Map uses syncDataMode:"full": aggregation publishes the complete worker
  // result before clearing processing, so first-frame partial data is not frozen.
  const estimate = memory.choose(anchorID, Date.parse(anchor?.start_time ?? ""), previous => estimateEncounterFloor(
    positions, map?.mapID ?? 0, floors,
    new Set(Object.keys(instance.players ?? {})), enabled ? query.data : undefined, previous,
  ), Boolean(map && positions) && !props.loading && !props.processing && !props.error && !pending);
  return {
    anchor,
    selectedFloorNumber: manualFloorNumber ?? namedFloor ?? estimate.floor,
    manualFloorNumber,
    floorUncertain: manualFloorNumber === null && namedFloor === null && estimate.uncertain,
    pending: namedFloor === null && (pending || (props.processing && !memory.has(anchorID))) && manualFloorNumber === null,
    setFloorNumber: (floor: number | null) => {
      if (!anchorID || (floor !== null && !map?.floors.some(item => item.floor === floor))) return;
      memory.correct(anchorID, floor); update(value => value + 1);
    },
  };
}
