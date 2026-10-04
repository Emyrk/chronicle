import { useQuery } from "@tanstack/react-query";
import { useDatasetId } from "@/hooks/useDatasetId";

export interface CooldownSpellEntry {
  id: number;
  name: string;
  name_subtext: string;
  cooldown_ms: number;
  recovery_time_ms: number;
  category_recovery_time_ms: number;
}

/** Cooldown spells keyed by class name (e.g. "Druid", "DeathKnight"). */
export type CooldownSpellsData = Record<string, CooldownSpellEntry[]>;

export function useCooldownSpells() {
  const datasetId = useDatasetId();
  return useQuery({
    queryKey: ["wowdb", "cooldown-spells", datasetId ?? "default"],
    queryFn: async () => {
      const params = datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : "";
      const response = await fetch(`/api/v1/wowdb/cooldown-spells${params}`);
      if (!response.ok) throw new Error("Failed to fetch cooldown spells");
      return response.json() as Promise<CooldownSpellsData>;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}
