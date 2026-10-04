import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDatasetId } from "@/hooks/useDatasetId";
import type { SetCooldownIgnoredRequest } from "./typesGenerated";

export interface CooldownSpellEntry {
  id: number;
  name: string;
  name_subtext: string;
  cooldown_ms: number;
  recovery_time_ms: number;
  category_recovery_time_ms: number;
  /** Hidden from the Cooldown Usage panel by an admin. */
  ignored: boolean;
}

/** Cooldown spells keyed by class name (e.g. "Druid", "DeathKnight"). */
export type CooldownSpellsByClass = Record<string, CooldownSpellEntry[]>;

export interface CooldownSpellsData {
  byClass: CooldownSpellsByClass;
  /** Dataset the server resolved, used for admin writes. */
  datasetId: string | null;
}

const COOLDOWN_SPELLS_KEY = ["wowdb", "cooldown-spells"] as const;

async function fetchCooldownSpells(datasetId: string | undefined): Promise<CooldownSpellsData> {
  const params = datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : "";
  const response = await fetch(`/api/v1/wowdb/cooldown-spells${params}`);
  if (!response.ok) throw new Error("Failed to fetch cooldown spells");
  return {
    byClass: (await response.json()) as CooldownSpellsByClass,
    datasetId: response.headers.get("X-Chronicle-Dataset") ?? datasetId ?? null,
  };
}

export function useCooldownSpells() {
  const datasetId = useDatasetId();
  return useQuery({
    queryKey: [...COOLDOWN_SPELLS_KEY, datasetId ?? "default"],
    queryFn: () => fetchCooldownSpells(datasetId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCooldownSpellsForDatasets(datasetIds: readonly string[]) {
  return useQueries({
    queries: datasetIds.map((datasetId) => ({
      queryKey: [...COOLDOWN_SPELLS_KEY, datasetId],
      queryFn: () => fetchCooldownSpells(datasetId),
      staleTime: 5 * 60 * 1000,
    })),
  });
}

export function useSetCooldownIgnored() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ datasetId, ...request }: SetCooldownIgnoredRequest & { datasetId: string }) => {
      const response = await fetch(`/api/v1/game-data/datasets/${datasetId}/cooldown-ignores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to update cooldown (${response.status})`);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COOLDOWN_SPELLS_KEY }),
  });
}
