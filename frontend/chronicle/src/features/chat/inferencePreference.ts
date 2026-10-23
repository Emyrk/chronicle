import type { InferenceSettings } from "@/api/typesGenerated";

export type InferenceStatus = "enabled" | "disabled" | "unavailable" | "not-capable";

export function inferenceStatus(settings: InferenceSettings): InferenceStatus {
  if (!settings.service_available) return "unavailable";
  if (!settings.available) return "not-capable";
  if (settings.disabled) return "disabled";
  return "enabled";
}
