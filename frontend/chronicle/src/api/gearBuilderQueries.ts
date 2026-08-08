import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateGearListRequest,
  CreateGearStatWeightPinRequest,
  CreateGearStatWeightRequest,
  GearList,
  GearStatWeight,
  GearStatWeightPin,
  GearTrendsResponse,
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

// ─── Forks ───────────────────────────────────────────────────

export function useForkGearList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (listID: string): Promise<GearList> => {
      const res = await fetch(`${BASE}/lists/${encodeURIComponent(listID)}/fork`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw gearAPIError("Failed to fork gear list", await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gear-lists"] }),
  });
}

// ─── Observed Gear Trends ────────────────────────────────────

export interface GearTrendsParams {
  /** Hero-class enum name, e.g. "WARRIOR". */
  class: string;
  /** Spec display name, e.g. "Fury". */
  spec: string;
  days?: 30 | 60 | 90;
  /** Raid instance name filter, e.g. "Molten Core"; omit for all raids. */
  raid?: string;
  /** Realm UUID filter; omit for all realms. */
  realmId?: string;
}

export function useGearTrends(params: GearTrendsParams | null) {
  return useQuery({
    queryKey: [
      "gear-trends",
      params?.class,
      params?.spec,
      params?.days ?? 60,
      params?.raid ?? "",
      params?.realmId ?? "",
    ],
    queryFn: async (): Promise<GearTrendsResponse> => {
      const qs = new URLSearchParams({ class: params!.class, spec: params!.spec });
      if (params!.days) qs.set("days", String(params!.days));
      if (params!.raid) qs.set("raid", params!.raid);
      if (params!.realmId) qs.set("realm_id", params!.realmId);
      const res = await fetch(`${BASE}/trends?${qs.toString()}`);
      if (!res.ok) throw gearAPIError("Failed to fetch gear trends", await res.json().catch(() => null));
      return res.json();
    },
    enabled: !!params && !!params.class && !!params.spec,
    staleTime: 5 * 60 * 1000,
    retry: false,
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
