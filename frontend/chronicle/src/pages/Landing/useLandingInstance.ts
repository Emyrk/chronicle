import { useMemo } from "react";
import { useInstance } from "@/api/queries";
import { transformToInstance } from "@/pages/Instance/transformInstance";
import type { Instance } from "@/pages/Instance/InstancePage";

/** The landing's run, transformed for the scene; kept for the page view, so the Explore modal reuses the hero's copy. */
export function useLandingInstance(instanceId: string): Instance | null {
  const { data: apiInstance } = useInstance(instanceId, { staleTime: Infinity });
  return useMemo(() => apiInstance ? transformToInstance(apiInstance) : null, [apiInstance]);
}
