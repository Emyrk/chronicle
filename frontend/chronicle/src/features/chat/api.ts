import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useAuthorizationCheck } from "@/api/queries";
import type {
  InferenceAuthorizeRequest,
  InferenceAuthorizeResponse,
  InferenceConnectionsResponse,
  InferenceDebugPreviewRequest,
  InferenceModelsResponse,
  InferenceSettings,
  InferenceThreadResponse,
  UpdateInferenceSettingsRequest,
} from "@/api/typesGenerated";
import type { DebugSnapshotEvent } from "./protocol";

const inferenceKeys = {
  settings: ["inference", "settings"] as const,
  connections: ["inference", "connections"] as const,
  models: (connectionId: string) => ["inference", "connections", connectionId, "models"] as const,
  thread: (threadId: string) => ["inference", "threads", threadId] as const,
  instanceThread: (instanceId: string) => ["inference", "threads", "instance", instanceId] as const,
};

export class InferenceAPIError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "InferenceAPIError";
    this.status = status;
  }
}

export function isInferenceServiceUnavailable(error: unknown): boolean {
  return error instanceof InferenceAPIError && error.status === 503;
}

export function inferenceAPIErrorMessage(
  status: number,
  body: { message?: string; detail?: string } | null,
  fallback: string,
): string {
  if (status === 401) {
    return "Your session has expired or is no longer authorized. Refresh the page or sign in again.";
  }
  const detail = body?.detail ? `: ${body.detail}` : "";
  return `${body?.message ?? fallback}${detail}`;
}

export function isInferenceAuthorizationError(error: unknown): boolean {
  return error instanceof InferenceAPIError && (error.status === 401 || error.status === 403);
}

async function readError(response: Response, fallback: string): Promise<InferenceAPIError> {
  const body = await response.json().catch(() => null) as { message?: string; detail?: string } | null;
  return new InferenceAPIError(inferenceAPIErrorMessage(response.status, body, fallback), response.status);
}

export function useInferencePermission(enabled = true) {
  const query = useAuthorizationCheck(
    { inferenceChat: "chronicle:chronicle#use_inference_chat" },
    { enabled, retry: false },
  );
  return { ...query, allowed: query.data?.inferenceChat ?? false };
}

export function useInferenceDebugPermission(enabled = true) {
  const query = useAuthorizationCheck(
    { inferenceDebug: "chronicle:chronicle#debug_inference_chat" },
    { enabled, retry: false },
  );
  return { ...query, allowed: query.data?.inferenceDebug ?? false };
}

export function useInferenceSettings(enabled = true) {
  return useQuery({
    queryKey: inferenceKeys.settings,
    queryFn: async () => {
      const response = await fetch("/api/v1/me/inference", { credentials: "include" });
      if (!response.ok) throw await readError(response, "Failed to load AI settings");
      return response.json() as Promise<InferenceSettings>;
    },
    enabled,
    retry: false,
  });
}

export function useUpdateInferenceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: UpdateInferenceSettingsRequest) => {
      const response = await fetch("/api/v1/me/inference", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw await readError(response, "Failed to update AI settings");
      return response.json() as Promise<InferenceSettings>;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(inferenceKeys.settings, settings);
      queryClient.invalidateQueries({ queryKey: ["authorizationCheck"] });
      if (!settings.enabled) {
        queryClient.removeQueries({ queryKey: inferenceKeys.connections });
      }
    },
  });
}

export function useInferenceConnections(
  options?: Omit<UseQueryOptions<InferenceConnectionsResponse>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: inferenceKeys.connections,
    queryFn: async () => {
      const response = await fetch("/api/v1/inference/connections", { credentials: "include" });
      if (!response.ok) throw await readError(response, "Failed to load AI connections");
      return response.json() as Promise<InferenceConnectionsResponse>;
    },
    retry: false,
    ...options,
  });
}

export function useInferenceModels(
  connectionId: string | undefined,
  options?: Omit<UseQueryOptions<InferenceModelsResponse>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: inferenceKeys.models(connectionId ?? ""),
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/inference/connections/${encodeURIComponent(connectionId ?? "")}/models`,
        { credentials: "include" },
      );
      if (!response.ok) throw await readError(response, "Failed to load available AI models");
      return response.json() as Promise<InferenceModelsResponse>;
    },
    enabled: Boolean(connectionId),
    retry: false,
    ...options,
  });
}

export function useAuthorizeOpenRouter() {
  return useMutation({
    mutationFn: async (request: InferenceAuthorizeRequest) => {
      const response = await fetch("/api/v1/inference/openrouter/authorize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw await readError(response, "Failed to start OpenRouter authorization");
      return response.json() as Promise<InferenceAuthorizeResponse>;
    },
  });
}

export function useDeleteInferenceConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await fetch(`/api/v1/inference/connections/${encodeURIComponent(connectionId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw await readError(response, "Failed to disconnect AI provider");
      return connectionId;
    },
    onSuccess: (connectionId) => {
      queryClient.invalidateQueries({ queryKey: inferenceKeys.connections });
      queryClient.removeQueries({ queryKey: inferenceKeys.models(connectionId) });
    },
  });
}

export function useCreateInstanceInferenceThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (instanceId: string) => {
      const response = await fetch(`/api/v1/inference/threads/instance/${encodeURIComponent(instanceId)}`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw await readError(response, "Failed to open the instance assistant");
      return response.json() as Promise<InferenceThreadResponse>;
    },
    retry: false,
    onSuccess: (data, instanceId) => {
      queryClient.setQueryData(inferenceKeys.thread(data.thread.id), data);
      queryClient.setQueryData(inferenceKeys.instanceThread(instanceId), data);
    },
  });
}

export function useClearInferenceThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      const response = await fetch(`/api/v1/inference/threads/${encodeURIComponent(threadId)}/messages`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw await readError(response, "Failed to start a new chat");
      return response.json() as Promise<InferenceThreadResponse>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(inferenceKeys.thread(data.thread.id), data);
      if (data.thread.context_type === "instance" && data.thread.context_id) {
        queryClient.setQueryData(inferenceKeys.instanceThread(data.thread.context_id), data);
      }
    },
  });
}

export function useInferenceDebugPreview() {
  return useMutation({
    mutationFn: async (request: InferenceDebugPreviewRequest) => {
      const response = await fetch("/api/v1/inference/debug/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw await readError(response, "Failed to preview inference debug data");
      return response.json() as Promise<DebugSnapshotEvent>;
    },
  });
}

export function useInferenceThread(
  threadId: string | undefined,
  options?: Omit<UseQueryOptions<InferenceThreadResponse>, "queryKey" | "queryFn">,
) {
  return useQuery({
    ...options,
    queryKey: inferenceKeys.thread(threadId ?? ""),
    queryFn: async () => {
      const response = await fetch(`/api/v1/inference/threads/${encodeURIComponent(threadId ?? "")}`, {
        credentials: "include",
      });
      if (!response.ok) throw await readError(response, "Failed to refresh assistant history");
      return response.json() as Promise<InferenceThreadResponse>;
    },
    enabled: Boolean(threadId) && (options?.enabled ?? true),
    retry: false,
  });
}

export { inferenceKeys };
