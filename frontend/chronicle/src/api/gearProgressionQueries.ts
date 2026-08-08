import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateGearProgressionRequest,
  GearProgression,
  UpdateGearProgressionRequest,
} from "./typesGenerated";

const BASE = "/api/v1/gear-progressions";

function progressionAPIError(defaultMessage: string, body: unknown): Error {
  if (body && typeof body === "object" && "error" in body) {
    return new Error((body as { error: string }).error);
  }
  return new Error(defaultMessage);
}

export function useMyGearProgressions(enabled = true) {
  return useQuery({
    queryKey: ["gear-progressions"],
    queryFn: async (): Promise<GearProgression[]> => {
      const res = await fetch(`${BASE}/`, { credentials: "include" });
      if (!res.ok) {
        throw progressionAPIError("Failed to fetch progressions", await res.json().catch(() => null));
      }
      return res.json();
    },
    enabled,
  });
}

export function useSharedGearProgression(progressionID: string | undefined) {
  return useQuery({
    queryKey: ["gear-progression-shared", progressionID],
    queryFn: async (): Promise<GearProgression> => {
      const res = await fetch(`${BASE}/shared/${progressionID}`, { credentials: "include" });
      if (!res.ok) {
        throw progressionAPIError("Failed to fetch progression", await res.json().catch(() => null));
      }
      return res.json();
    },
    enabled: !!progressionID,
  });
}

export function useCreateGearProgression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: CreateGearProgressionRequest): Promise<GearProgression> => {
      const res = await fetch(`${BASE}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        credentials: "include",
      });
      if (!res.ok) {
        throw progressionAPIError("Failed to create progression", await res.json().catch(() => null));
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gear-progressions"] }),
  });
}

export function useUpdateGearProgression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...req
    }: UpdateGearProgressionRequest & { id: string }): Promise<GearProgression> => {
      const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        credentials: "include",
      });
      if (!res.ok) {
        throw progressionAPIError("Failed to save progression", await res.json().catch(() => null));
      }
      return res.json();
    },
    onSuccess: (prog) => {
      qc.invalidateQueries({ queryKey: ["gear-progressions"] });
      qc.setQueryData(["gear-progression-shared", prog.id], prog);
    },
  });
}

export function useDeleteGearProgression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        throw progressionAPIError("Failed to delete progression", await res.json().catch(() => null));
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gear-progressions"] }),
  });
}
