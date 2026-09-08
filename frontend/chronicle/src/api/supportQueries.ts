import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSupportServiceRequest,
  SupportAdminResponse,
  SupportService,
  SupportSummary,
  UpdateSupportSettingsRequest,
} from "./typesGenerated";

async function readJSON<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? fallback);
  }
  return response.json() as Promise<T>;
}

export function useSupportSummary() {
  return useQuery({
    queryKey: ["support-summary"],
    queryFn: async () => readJSON<SupportSummary>(await fetch("/api/v1/support/summary"), "Failed to load support totals"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdminSupport() {
  return useQuery({
    queryKey: ["admin-support"],
    queryFn: async () => readJSON<SupportAdminResponse>(await fetch("/api/v1/admin/support/"), "Failed to load support settings"),
  });
}

export function useUpdateSupportSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: UpdateSupportSettingsRequest) =>
      readJSON(await fetch("/api/v1/admin/support/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }), "Failed to update support settings"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-support"] });
      void queryClient.invalidateQueries({ queryKey: ["support-summary"] });
    },
  });
}

export function useCreateSupportService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateSupportServiceRequest) =>
      readJSON<SupportService>(await fetch("/api/v1/admin/support/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }), "Failed to create support service"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-support"] });
      void queryClient.invalidateQueries({ queryKey: ["support-summary"] });
    },
  });
}

export function useUpdateSupportService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, request }: { id: string; request: CreateSupportServiceRequest }) =>
      readJSON<SupportService>(await fetch(`/api/v1/admin/support/services/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }), "Failed to update support service"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-support"] });
      void queryClient.invalidateQueries({ queryKey: ["support-summary"] });
    },
  });
}

export function useDeleteSupportService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/admin/support/services/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete support service");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-support"] });
      void queryClient.invalidateQueries({ queryKey: ["support-summary"] });
    },
  });
}
