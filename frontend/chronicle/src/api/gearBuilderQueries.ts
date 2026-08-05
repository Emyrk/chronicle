import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateGearListRequest,
  CreateGearStatWeightPinRequest,
  CreateGearStatWeightRequest,
  GearList,
  GearListRevision,
  GearListRevisionSummary,
  GearStatWeight,
  GearStatWeightPin,
  UpdateGearListRequest,
  UpdateGearStatWeightRequest,
} from "./typesGenerated";

const BASE = "/api/v1/gear-builder";

function gearAPIError(defaultMessage: string, body: unknown): Error {
  if (body && typeof body === "object" && "error" in body) {
    return new Error((body as { error: string }).error);
  }
  return new Error(defaultMessage);
}

// ─── Gear Lists ──────────────────────────────────────────────

export function useMyGearLists(enabled = true) {
  return useQuery({
    queryKey: ["gear-lists"],
    queryFn: async (): Promise<GearList[]> => {
      const res = await fetch(`${BASE}/lists`, { credentials: "include" });
      if (!res.ok) throw gearAPIError("Failed to fetch gear lists", await res.json().catch(() => null));
      return res.json();
    },
    enabled,
  });
}

export function usePublicGearLists(classID?: number) {
  return useQuery({
    queryKey: ["gear-lists-public", classID ?? null],
    queryFn: async (): Promise<GearList[]> => {
      const params = classID ? `?class_id=${classID}` : "";
      const res = await fetch(`${BASE}/lists/public${params}`);
      if (!res.ok) throw gearAPIError("Failed to fetch public gear lists", await res.json().catch(() => null));
      return res.json();
    },
    staleTime: 60 * 1000,
  });
}

export function useSharedGearList(listID: string | undefined) {
  return useQuery({
    queryKey: ["gear-list-shared", listID],
    queryFn: async (): Promise<GearList> => {
      const res = await fetch(`${BASE}/lists/shared/${listID}`, { credentials: "include" });
      if (!res.ok) throw gearAPIError("Failed to fetch gear list", await res.json().catch(() => null));
      return res.json();
    },
    enabled: !!listID,
  });
}

export function useCreateGearList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: CreateGearListRequest): Promise<GearList> => {
      const res = await fetch(`${BASE}/lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to create gear list", await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gear-lists"] }),
  });
}

export function useUpdateGearList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...req }: UpdateGearListRequest & { id: string }): Promise<GearList> => {
      const res = await fetch(`${BASE}/lists/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to update gear list", await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: (list) => {
      qc.invalidateQueries({ queryKey: ["gear-lists"] });
      qc.setQueryData(["gear-list-shared", list.id], list);
    },
  });
}

export function useDeleteGearList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/lists/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to delete gear list", await res.json().catch(() => null));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gear-lists"] }),
  });
}

// ─── Revisions & Forks ───────────────────────────────────────

export function useGearListRevisions(listID: string | undefined) {
  return useQuery({
    queryKey: ["gear-list-revisions", listID],
    queryFn: async (): Promise<GearListRevisionSummary[]> => {
      const res = await fetch(`${BASE}/lists/${listID}/revisions`, { credentials: "include" });
      if (!res.ok) throw gearAPIError("Failed to fetch revisions", await res.json().catch(() => null));
      return res.json();
    },
    enabled: !!listID,
  });
}

export function useGearListRevision(listID: string | undefined, revNumber: number | null) {
  return useQuery({
    queryKey: ["gear-list-revision", listID, revNumber],
    queryFn: async (): Promise<GearListRevision> => {
      const res = await fetch(`${BASE}/lists/${listID}/revisions/${revNumber}`, {
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to fetch revision", await res.json().catch(() => null));
      return res.json();
    },
    enabled: !!listID && revNumber != null && revNumber > 0,
    staleTime: Infinity, // published revisions are immutable
  });
}

export function usePublishGearList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (listID: string): Promise<GearListRevision> => {
      const res = await fetch(`${BASE}/lists/${encodeURIComponent(listID)}/revisions`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to publish revision", await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: (rev) => qc.invalidateQueries({ queryKey: ["gear-list-revisions", rev.list_id] }),
  });
}

export function useForkGearList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      listID,
      revNumber,
    }: {
      listID: string;
      revNumber?: number;
    }): Promise<GearList> => {
      const res = await fetch(`${BASE}/lists/${encodeURIComponent(listID)}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(revNumber != null ? { rev_number: revNumber } : {}),
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to fork gear list", await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gear-lists"] }),
  });
}

// ─── Stat Weights ────────────────────────────────────────────

export function useMyStatWeights(enabled = true) {
  return useQuery({
    queryKey: ["gear-stat-weights"],
    queryFn: async (): Promise<GearStatWeight[]> => {
      const res = await fetch(`${BASE}/stat-weights`, { credentials: "include" });
      if (!res.ok) throw gearAPIError("Failed to fetch stat weights", await res.json().catch(() => null));
      return res.json();
    },
    enabled,
  });
}

export function useCreateStatWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: CreateGearStatWeightRequest): Promise<GearStatWeight> => {
      const res = await fetch(`${BASE}/stat-weights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to create stat weight", await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gear-stat-weights"] }),
  });
}

export function useUpdateStatWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...req }: UpdateGearStatWeightRequest & { id: string }): Promise<GearStatWeight> => {
      const res = await fetch(`${BASE}/stat-weights/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to update stat weight", await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gear-stat-weights"] }),
  });
}

export function useDeleteStatWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/stat-weights/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to delete stat weight", await res.json().catch(() => null));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gear-stat-weights"] }),
  });
}

// ─── Stat Weight Pins ────────────────────────────────────────

export function useStatWeightPins(datasetID: string | undefined) {
  return useQuery({
    queryKey: ["gear-stat-weight-pins", datasetID],
    queryFn: async (): Promise<GearStatWeightPin[]> => {
      const res = await fetch(`${BASE}/stat-weight-pins?dataset_id=${datasetID}`, { credentials: "include" });
      if (!res.ok) throw gearAPIError("Failed to fetch stat weight pins", await res.json().catch(() => null));
      return res.json();
    },
    enabled: !!datasetID,
  });
}

export function useCreateStatWeightPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: CreateGearStatWeightPinRequest): Promise<GearStatWeightPin> => {
      const res = await fetch(`${BASE}/admin/stat-weight-pins/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to pin stat weight", await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gear-stat-weight-pins"] }),
  });
}

export function useDeleteStatWeightPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/admin/stat-weight-pins/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to unpin stat weight", await res.json().catch(() => null));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gear-stat-weight-pins"] }),
  });
}
