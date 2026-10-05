import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDatasetId } from "@/hooks/useDatasetId";
import type { ClassBuffIgnorePolicy, SetClassBuffIgnoresRequest } from "./typesGenerated";

export interface FriendlyClassBuffEffect {
  effect_index: number;
  aura_effect: number;
  aura_name: string;
  implicit_targets: number[];
}

export interface FriendlyClassBuffSpell {
  id: number;
  name: string;
  name_subtext: string;
  targeting: "friendly" | "group";
  effects: FriendlyClassBuffEffect[];
  ignored: boolean;
}

export type FriendlyClassBuffsByClass = Record<string, FriendlyClassBuffSpell[]>;

const CLASS_BUFFS_KEY = ["wowdb", "class-buffs"] as const;
const CLASS_BUFF_IGNORE_POLICIES_KEY = ["game-data", "class-buff-ignores"] as const;

export function useFriendlyClassBuffs() {
  const datasetId = useDatasetId();
  return useQuery({
    queryKey: [...CLASS_BUFFS_KEY, datasetId ?? "default"],
    queryFn: async () => {
      const params = datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : "";
      const response = await fetch(`/api/v1/wowdb/class-buffs${params}`);
      if (response.status === 404) return {};
      if (!response.ok) throw new Error("Failed to fetch friendly class buffs");
      return response.json() as Promise<FriendlyClassBuffsByClass>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useClassBuffIgnorePolicies(enabled: boolean) {
  return useQuery({
    queryKey: CLASS_BUFF_IGNORE_POLICIES_KEY,
    queryFn: async () => {
      const response = await fetch("/api/v1/game-data/class-buff-ignores");
      if (!response.ok) throw new Error("Failed to fetch class buff ignore policies");
      return response.json() as Promise<ClassBuffIgnorePolicy[]>;
    },
    enabled,
  });
}

export function useSetClassBuffIgnores() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: SetClassBuffIgnoresRequest) => {
      const response = await fetch("/api/v1/game-data/class-buff-ignores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to update class buff (${response.status})`);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CLASS_BUFFS_KEY }),
        queryClient.invalidateQueries({ queryKey: CLASS_BUFF_IGNORE_POLICIES_KEY }),
      ]);
    },
  });
}
