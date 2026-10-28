import type { Instance } from "../../InstancePage";

export const MAP_TELEMETRY_WARNING_STORAGE_KEY = "chronicle:map-superwow-warning-dismissed";
export const MAP_TELEMETRY_WARNING_CACHE_SIZE = 20;

type TelemetryWarningInstance = Pick<Instance, "capabilities" | "format" | "versions">;

export function hasLimitedHostilePositionTelemetry(instance: TelemetryWarningInstance): boolean {
  if (!instance.capabilities.includes("unit-position")) return false;

  return instance.format === "3.3.5a-cc-addon"
    || (Boolean(instance.versions?.superwow) && !instance.versions?.classicapi);
}

function validInstanceIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
}

export function isMapTelemetryWarningDismissed(value: unknown, instanceId: string): boolean {
  return validInstanceIds(value).includes(instanceId);
}

export function dismissMapTelemetryWarning(value: unknown, instanceId: string): string[] {
  return [instanceId, ...validInstanceIds(value).filter((id) => id !== instanceId)]
    .slice(0, MAP_TELEMETRY_WARNING_CACHE_SIZE);
}
