import type { InstancePlayer, InstanceUnit, LandingFeaturedUpload, WoWEncounterWithHostiles, VehicleControlMetadata } from "@/api/typesGenerated";
import type { EnemyUnit, Encounter, Instance } from "./InstancePage";
import { resolveInstanceUnits, type ResolvedInstanceUnit } from "./instanceUnits";
import { defaultPositionCoordinateSpace, type PositionCoordinateSpace } from "./positionCoordinateSpace";

// Helper to get unit name from lookup, with fallback
function getUnitName(guidStr: string, units: Record<string, ResolvedInstanceUnit>): string {
  const unit = units[guidStr];
  if (unit) {
    return unit.name;
  }
  // Fallback: try to show a short version of the GUID
  return `Enemy ${guidStr}`;
}

function normalizeRecord<T>(value: Record<string, T> | null | undefined): Record<string, T> {
  return value ?? {};
}

function normalizeArray<T>(value: readonly T[] | null | undefined): readonly T[] {
  return value ?? [];
}

/** The instance page's view of the API instance (also built by the landing hero, without the page). */
export function transformToInstance(
  apiInstance: {
    id: string;
    slug?: string;
    owner_ads_free: boolean;
    log_group_id: string;
    name: string;
    start_time?: string;
    end_time?: string;
    realm_name?: string;
    dataset_id?: string | null;
    icon_base_url?: string;
    guild?: { id: string; name: string };
    encounters: readonly WoWEncounterWithHostiles[] | null;
    players: Record<string, InstancePlayer> | null;
    units: Record<string, InstanceUnit> | null;
    names_by_entry?: Record<number, string>;
    summons_by_owner?: Record<string, readonly string[]>;
    capabilities?: readonly string[];
    position_coordinate_space?: PositionCoordinateSpace;
    unlisted?: boolean;
    format?: string;
    flavor?: readonly string[];
    versions?: Record<string, string>;
    recorder_name?: string;
    recorder_guid?: string;
    difficulty_name?: string;
    max_players?: number;
    dynamic_difficulty?: number;
    invalidated_at?: string;
    invalid_reason?: string;
    vehicle_control_intervals?: VehicleControlMetadata;
    server_name?: string;
    tenant_name?: string;
    tenant_slug?: string;
    tenant_include_in_all?: boolean;
    upload?: LandingFeaturedUpload;
    log_owner?: string;
  },
): Instance {
  const players = normalizeRecord(apiInstance.players);
  const units = resolveInstanceUnits(
    apiInstance.units,
    apiInstance.names_by_entry,
    apiInstance.summons_by_owner,
  );
  const apiEncounters = normalizeArray(apiInstance.encounters);

  // Map encounters
  const encounters: Encounter[] = apiEncounters.map((enc) => {
    // Build enemies from encounter hostiles
    const enemies: EnemyUnit[] = normalizeArray(enc.hostiles)
      .map((hostile) => {
        const guidStr = String(hostile.id);
        return {
          id: guidStr,
          name: getUnitName(guidStr, units),
          boss: hostile.boss,
          damageTaken: 0,
          damageDone: 0,
          periods: hostile.periods,
        };
      });

    return {
      id: enc.id,
      name: enc.name,
      boss: enc.boss,
      mapId: enc.map_id,
      kill_type: enc.kill_type,
      start_time: enc.start_time,
      end_time: enc.end_time,
      players,
      enemies,
      remaining: enc.remaining as string[] | undefined,
      phases: normalizeArray(enc.phases).map((phase) => ({
        id: phase.id,
        encounter_id: enc.id,
        key: phase.key,
        name: phase.name,
        order: phase.order,
        start_offset_ms: phase.start_offset_ms,
        end_offset_ms: phase.end_offset_ms,
        start_time: new Date(new Date(enc.start_time).getTime() + phase.start_offset_ms).toISOString(),
        end_time: new Date(new Date(enc.start_time).getTime() + phase.end_offset_ms).toISOString(),
        kill_type: phase.kill_type,
      })),
    };
  });

  // Compute instance timing from encounters
  const sortedEncounters = [...apiEncounters].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  const startTime = apiInstance.start_time || sortedEncounters[0]?.start_time || new Date().toISOString();
  const endTime = apiInstance.end_time || sortedEncounters[sortedEncounters.length - 1]?.end_time;

  return {
    id: apiInstance.id,
    slug: apiInstance.slug,
    logGroupId: apiInstance.log_group_id,
    name: apiInstance.name,
    realm: apiInstance.realm_name,
    datasetId: apiInstance.dataset_id ?? undefined,
    iconBaseUrl: apiInstance.icon_base_url,
    guild: apiInstance.guild,
    startTime,
    endTime,
    encounters,
    players,
    units,
    capabilities: apiInstance.capabilities ?? [],
    positionCoordinateSpace: apiInstance.position_coordinate_space
      ?? defaultPositionCoordinateSpace(apiInstance.format),
    unlisted: apiInstance.unlisted,
    format: apiInstance.format,
    flavor: apiInstance.flavor,
    versions: apiInstance.versions,
    recorderName: apiInstance.recorder_name,
    recorderGuid: apiInstance.recorder_guid,
    difficultyName: apiInstance.difficulty_name,
    maxPlayers: apiInstance.max_players,
    dynamicDifficulty: apiInstance.dynamic_difficulty,
    invalidatedAt: apiInstance.invalidated_at,
    invalidReason: apiInstance.invalid_reason,
    vehicleControlIntervals: apiInstance.vehicle_control_intervals,
    serverName: apiInstance.server_name,
    tenantName: apiInstance.tenant_name,
    tenantSlug: apiInstance.tenant_slug,
    tenantIncludeInAll: apiInstance.tenant_include_in_all,
    upload: apiInstance.upload,
    logOwner: apiInstance.log_owner,
  };
}
