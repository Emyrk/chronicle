import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import type { 
  WoWLogGroup as WoWLogGroupGenerated, 
  WoWLogFile as WoWLogFileGenerated,
  WoWLogGroupState as WoWLogGroupStateGenerated,
  JobStatus as JobStatusGenerated,
  RiverJobState as RiverJobStateGenerated,
  RiverAttemptError as RiverAttemptErrorGenerated,
  WoWParsedLogJobOutput as WoWParsedLogJobOutputGenerated,
  WoWParsedInstance as WoWParsedInstanceGenerated,
  WoWEncounter as WoWEncounterGenerated,
  WoWInstance as WoWInstanceGenerated,
  Video as VideoGenerated,
  AdminUsersResponse as AdminUsersResponseGenerated,
  AdminLogsResponse as AdminLogsResponseGenerated,
  User as UserGenerated,
  AdminLog as AdminLogGenerated,
  Session as SessionGenerated,
  AuthorizationRequest as AuthorizationRequestGenerated,
  AuthorizationResponse as AuthorizationResponseGenerated,
} from "./typesGenerated";

// Re-export types for convenience
export type WoWLogGroup = WoWLogGroupGenerated;
export type WoWLogFile = WoWLogFileGenerated;
export type WoWLogGroupState = WoWLogGroupStateGenerated;
export type JobStatus = JobStatusGenerated;
export type RiverJobState = RiverJobStateGenerated;
export type RiverAttemptError = RiverAttemptErrorGenerated;
export type WoWParsedLogJobOutput = WoWParsedLogJobOutputGenerated;
export type WoWParsedInstance = WoWParsedInstanceGenerated;
export type WoWEncounter = WoWEncounterGenerated;
export type WoWInstance = WoWInstanceGenerated;
export type Video = VideoGenerated;
export type AdminUsersResponse = AdminUsersResponseGenerated;
export type AdminLogsResponse = AdminLogsResponseGenerated;
export type User = UserGenerated;
export type AdminLog = AdminLogGenerated;
export type Session = SessionGenerated;
export type AuthorizationRequest = AuthorizationRequestGenerated;
export type AuthorizationResponse = AuthorizationResponseGenerated;

export function useWhoami(options?: Omit<UseQueryOptions<boolean>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["whoami"],
    queryFn: async () => {
      const response = await fetch("/api/v1/whoami");
      return response.ok;
    },
    retry: false,
    ...options,
  });
}

/**
 * Check authorization for one or more SpiceDB permission checks.
 * @param checks - Map of check names to SpiceDB-style object strings (e.g., "raid_log:uuid#view")
 * @param options - Additional query options
 * @returns Query result with authorization results keyed by check name
 */
export function useAuthorizationCheck(
  checks: Record<string, string>,
  options?: Omit<UseQueryOptions<AuthorizationResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["authorizationCheck", checks],
    queryFn: async () => {
      const response = await fetch("/api/v1/authcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checks } satisfies AuthorizationRequest),
      });
      if (!response.ok) {
        throw new Error("Authorization check failed");
      }
      return response.json() as Promise<AuthorizationResponse>;
    },
    retry: false,
    ...options,
  });
}

export function useAuthProviders(options?: Omit<UseQueryOptions<string[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["authProviders"],
    queryFn: async () => {
      const response = await fetch("/auth/list");
      if (!response.ok) throw new Error("Failed to fetch providers");
      return response.json() as Promise<string[]>;
    },
    ...options,
  });
}

export function useLogGroups(options?: Omit<UseQueryOptions<WoWLogGroup[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["logGroups"],
    retry: false,
    queryFn: async () => {
      const response = await fetch("/api/v1/raidlogs/logs/");
      if (!response.ok) throw new Error("Failed to fetch logs");
      return response.json() as Promise<WoWLogGroup[]>;
    },
    ...options,
  });
}

export function useLogGroup(logId: string, options?: Omit<UseQueryOptions<WoWLogGroupState>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["logGroup", logId],
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/logs/${logId}`);
      if (!response.ok) throw new Error("Failed to fetch log details");
      return response.json() as Promise<WoWLogGroupState>;
    },
    ...options,
  });
}

export function useDeleteLogGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (logId: string) => {
      const response = await fetch(`/api/v1/raidlogs/logs/${logId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to delete log" }));
        throw new Error(error.message || "Failed to delete log");
      }
      return logId;
    },
    onSuccess: (logId) => {
      // Invalidate and refetch log groups list
      queryClient.invalidateQueries({ queryKey: ["logGroups"] });
      // Remove the specific log from cache
      queryClient.removeQueries({ queryKey: ["logGroup", logId] });
    },
  });
}

export function useReparseLogGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (logId: string) => {
      const response = await fetch(`/api/v1/raidlogs/logs/${logId}/reparse`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to reparse log" }));
        throw new Error(error.message || "Failed to reparse log");
      }
      return response.json() as Promise<WoWLogGroupState>;
    },
    onSuccess: (_data, logId) => {
      // Invalidate to refetch with new job status
      queryClient.invalidateQueries({ queryKey: ["logGroup", logId] });
    },
  });
}

export function useInstance(instanceId: string, options?: Omit<UseQueryOptions<WoWParsedInstance>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["instance", instanceId],
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/instances/${instanceId}`);
      if (!response.ok) throw new Error("Failed to fetch instance");
      return response.json() as Promise<WoWParsedInstance>;
    },
    ...options,
  });
}

export function useInstanceYoutube(instanceId: string, options?: Omit<UseQueryOptions<Video | null>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["instanceYoutube", instanceId],
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/instances/${instanceId}/youtube`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Failed to fetch YouTube data");
      return response.json() as Promise<Video>;
    },
    ...options,
  });
}

// Admin queries

export function useSession(options?: Omit<UseQueryOptions<Session | null>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const response = await fetch("/api/v1/whoami");
      if (!response.ok) return null;
      return response.json() as Promise<Session>;
    },
    retry: false,
    ...options,
  });
}

export function useAdminUsers(options?: Omit<UseQueryOptions<AdminUsersResponse>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const response = await fetch("/api/v1/admin/users");
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json() as Promise<AdminUsersResponse>;
    },
    retry: false,
    ...options,
  });
}

export function useAdminLogs(options?: Omit<UseQueryOptions<AdminLogsResponse>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["admin", "logs"],
    queryFn: async () => {
      const response = await fetch("/api/v1/admin/logs");
      if (!response.ok) throw new Error("Failed to fetch logs");
      return response.json() as Promise<AdminLogsResponse>;
    },
    retry: false,
    ...options,
  });
}

export function useResyncUserRoles() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/v1/admin/users/${userId}/resync`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to resync roles" }));
        throw new Error(error.message || "Failed to resync roles");
      }
      return response.json() as Promise<User>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
