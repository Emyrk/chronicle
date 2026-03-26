import { useQuery, useMutation, useQueryClient, keepPreviousData, type UseQueryOptions } from "@tanstack/react-query";
import type { WoWSpell } from "./wowdb";
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
  UserStorageInfo as UserStorageInfoGenerated,
  DataGrant as DataGrantGenerated,
  UpsertDataGrantRequest as UpsertDataGrantRequestGenerated,
  ListUserPanelLayoutsResponse as ListUserPanelLayoutsResponseGenerated,
  CreateUserPanelLayoutRequest as CreateUserPanelLayoutRequestGenerated,
  UpdateUserPanelLayoutRequest as UpdateUserPanelLayoutRequestGenerated,
  UserPanelLayout as UserPanelLayoutGenerated,
  ActionBarSlotsResponse as ActionBarSlotsResponseGenerated,
  InstanceDefaultsResponse as InstanceDefaultsResponseGenerated,
  CreateShareRequest as CreateShareRequestGenerated,
  CreateShareResponse as CreateShareResponseGenerated,
  SharedViewResponse as SharedViewResponseGenerated,
  ArmorySearchResponse as ArmorySearchResponseGenerated,
  GuildPageConfig as GuildPageConfigGenerated,
  GuildPageTheme as GuildPageThemeGenerated,
  GuildPageTab as GuildPageTabGenerated,
  GuildPagePanel as GuildPagePanelGenerated,
  UpdateTabRequest as UpdateTabRequestGenerated,
  CreateTabRequest as CreateTabRequestGenerated,
  UpdateGuildPageRequest as UpdateGuildPageRequestGenerated,
  GuildRosterMember as GuildRosterMemberGenerated,
  GuildSettings as GuildSettingsGenerated,
  GuildJoinRequest as GuildJoinRequestGenerated,
  UpdateGuildSettingsRequest as UpdateGuildSettingsRequestGenerated,
  CreateJoinRequestBody as CreateJoinRequestBodyGenerated,
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
export type UserStorageInfo = UserStorageInfoGenerated;
export type DataGrant = DataGrantGenerated;
export type UpsertDataGrantRequest = UpsertDataGrantRequestGenerated;
export type ListUserPanelLayoutsResponse = ListUserPanelLayoutsResponseGenerated;
export type CreateUserPanelLayoutRequest = CreateUserPanelLayoutRequestGenerated;
export type UpdateUserPanelLayoutRequest = UpdateUserPanelLayoutRequestGenerated;
export type UserPanelLayout = UserPanelLayoutGenerated;
export type ActionBarSlotsResponse = ActionBarSlotsResponseGenerated;
export type InstanceDefaultsResponse = InstanceDefaultsResponseGenerated;
export type CreateShareRequest = CreateShareRequestGenerated;
export type CreateShareResponse = CreateShareResponseGenerated;
export type SharedViewResponse = SharedViewResponseGenerated;
export type ArmorySearchResponse = ArmorySearchResponseGenerated;
export type GuildPageConfig = GuildPageConfigGenerated;
export type GuildPageTab = GuildPageTabGenerated;
export type GuildPagePanel = GuildPagePanelGenerated;
export type UpdateTabRequest = UpdateTabRequestGenerated;
export type CreateTabRequest = CreateTabRequestGenerated;
export type UpdateGuildPageRequest = UpdateGuildPageRequestGenerated;
export type GuildPageTheme = GuildPageThemeGenerated;
export type GuildRosterMember = GuildRosterMemberGenerated;
export type GuildSettings = GuildSettingsGenerated;
export type GuildJoinRequest = GuildJoinRequestGenerated;
export type UpdateGuildSettingsRequest = UpdateGuildSettingsRequestGenerated;
export type CreateJoinRequestBody = CreateJoinRequestBodyGenerated;

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

interface APIErrorResponse {
  message?: string;
  detail?: string;
}

export interface RequestError extends Error {
  detail?: string;
}

function buildAPIError(defaultMessage: string, error: unknown): RequestError {
  if (error && typeof error === "object") {
    const apiError = error as APIErrorResponse;
    const message = typeof apiError.message === "string" ? apiError.message : defaultMessage;
    const detail = typeof apiError.detail === "string" ? apiError.detail : undefined;
    const requestError = new Error(message) as RequestError;
    requestError.detail = detail;
    return requestError;
  }

  return new Error(defaultMessage) as RequestError;
}

export function useUserPanelLayouts(
  userID: string,
  options?: Omit<UseQueryOptions<ListUserPanelLayoutsResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["user-panel-layouts", userID],
    queryFn: async () => {
      const response = await fetch(`/api/v1/panel-layout/${encodeURIComponent(userID)}/`);
      if (!response.ok) {
        throw new Error("Failed to fetch user panel layouts");
      }
      return response.json() as Promise<ListUserPanelLayoutsResponse>;
    },
    enabled: !!userID,
    ...options,
  });
}

export function useInstanceDefaults(
  options?: Omit<UseQueryOptions<InstanceDefaultsResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["instance-defaults"],
    queryFn: async () => {
      const response = await fetch("/api/v1/panel-layout/instance-defaults", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch instance defaults");
      }
      return response.json() as Promise<InstanceDefaultsResponse>;
    },
    ...options,
  });
}

export function useSharedLayout(
  layoutID: string,
  options?: Omit<UseQueryOptions<UserPanelLayout>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["shared-panel-layout", layoutID],
    queryFn: async () => {
      const response = await fetch(`/api/v1/panel-layout/shared/${encodeURIComponent(layoutID)}`);
      if (!response.ok) {
        throw new Error("Failed to fetch shared layout");
      }
      return response.json() as Promise<UserPanelLayout>;
    },
    enabled: !!layoutID,
    ...options,
  });
}
export function useSharedLayoutByCode(
  code: string,
  options?: Omit<UseQueryOptions<UserPanelLayout>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["shared-panel-layout-code", code],
    queryFn: async () => {
      const response = await fetch(`/api/v1/panel-layout/code/${encodeURIComponent(code)}`);
      if (!response.ok) {
        throw new Error("Failed to fetch shared layout");
      }
      return response.json() as Promise<UserPanelLayout>;
    },
    enabled: !!code,
    ...options,
  });
}



export async function fetchSharedView(code: string): Promise<SharedViewResponse> {
  const response = await fetch(`/api/v1/share/${encodeURIComponent(code)}`);
  if (!response.ok) {
    throw new Error("Failed to fetch shared view");
  }
  return response.json() as Promise<SharedViewResponse>;
}

export function useCreateShare() {
  return useMutation({
    mutationFn: async (request: CreateShareRequest) => {
      const response = await fetch("/api/v1/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to create share link", error);
      }

      return response.json() as Promise<CreateShareResponse>;
    },
  });
}

export function useTrackLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (layoutID: string) => {
      const response = await fetch("/api/v1/panel-layout/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout_id: layoutID }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to track layout", error);
      }

      return layoutID;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-panel-layouts"] });
      queryClient.invalidateQueries({ queryKey: ["shared-panel-layout"] });
    },
  });
}

export function useUntrackLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (layoutID: string) => {
      const response = await fetch(`/api/v1/panel-layout/track/${encodeURIComponent(layoutID)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to untrack layout", error);
      }

      return layoutID;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-panel-layouts"] });
      queryClient.invalidateQueries({ queryKey: ["shared-panel-layout"] });
    },
  });
}

export function useCreatePanelLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateUserPanelLayoutRequest) => {
      const response = await fetch("/api/v1/panel-layout/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to create layout", error);
      }

      return response.json() as Promise<UserPanelLayout>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-panel-layouts"] });
      queryClient.invalidateQueries({ queryKey: ["instance-defaults"] });
    },
  });
}

export interface UpdatePanelLayoutRequest extends UpdateUserPanelLayoutRequest {
  layoutID: string;
}

export function useUpdatePanelLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ layoutID, ...request }: UpdatePanelLayoutRequest) => {
      const response = await fetch(`/api/v1/panel-layout/${encodeURIComponent(layoutID)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to update layout", error);
      }

      return response.json() as Promise<UserPanelLayout>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-panel-layouts"] });
      queryClient.invalidateQueries({ queryKey: ["instance-defaults"] });
    },
  });
}

export function useDeletePanelLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (layoutID: string) => {
      const response = await fetch(`/api/v1/panel-layout/${encodeURIComponent(layoutID)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to delete layout", error);
      }

      return layoutID;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-panel-layouts"] });
      queryClient.invalidateQueries({ queryKey: ["instance-defaults"] });
    },
  });
}

export interface UpdateLayoutDefaultsRequest {
  default_desktop_layout_id?: string | null;
  default_mobile_layout_id?: string | null;
}

export interface LayoutDefaultsResponse {
  default_desktop_layout_id: string | null;
  default_mobile_layout_id: string | null;
}

export function useUpdateLayoutDefaults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: UpdateLayoutDefaultsRequest) => {
      const response = await fetch("/api/v1/panel-layout/defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to update layout defaults", error);
      }

      return response.json() as Promise<LayoutDefaultsResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-panel-layouts"] });
      queryClient.invalidateQueries({ queryKey: ["instance-defaults"] });
    },
  });
}

export function useUpdateActionBarSlots() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: ActionBarSlotsResponse) => {
      const response = await fetch("/api/v1/panel-layout/action-bar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to update action bar", error);
      }

      return response.json() as Promise<ActionBarSlotsResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-panel-layouts"] });
    },
  });
}

export function useMyStorage(options?: Omit<UseQueryOptions<UserStorageInfo>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["my-storage"],
    queryFn: async () => {
      const response = await fetch("/api/v1/me/storage");
      if (!response.ok) {
        throw new Error("Failed to fetch storage info");
      }
      return response.json() as Promise<UserStorageInfo>;
    },
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

// Map of instance name to optional note/caveat (empty string = fully supported)
export type SupportedInstances = Record<string, string>;

export function useSupportedInstances(options?: Omit<UseQueryOptions<SupportedInstances>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["supportedInstances"],
    queryFn: async () => {
      const response = await fetch("/api/v1/raidlogs/supported");
      if (!response.ok) throw new Error("Failed to fetch supported instances");
      return response.json() as Promise<SupportedInstances>;
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour - this data rarely changes
    ...options,
  });
}

export function useLogGroups(options?: Omit<UseQueryOptions<WoWLogGroup[]>, "queryKey" | "queryFn"> & {
  start?: string;
  end?: string;
}) {
  const { start, end, ...queryOptions } = options ?? {};
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const qs = params.toString();
  return useQuery({
    queryKey: ["logGroups", start, end],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/logs/${qs ? `?${qs}` : ""}`);
      if (!response.ok) throw new Error("Failed to fetch logs");
      return response.json() as Promise<WoWLogGroup[]>;
    },
    ...queryOptions,
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

export function useLogGroupByFileHash(fileHash: string, options?: Omit<UseQueryOptions<WoWLogGroupState>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["logGroupByFile", fileHash],
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/logs/by-file-hash/${fileHash}`);
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

export interface DeleteLogInstanceOptions {
  logId: string;
  instanceId: string;
}

export function useDeleteLogInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ logId, instanceId }: DeleteLogInstanceOptions) => {
      const response = await fetch(`/api/v1/raidlogs/logs/${logId}/instances/${instanceId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to delete instance" }));
        throw new Error(error.message || "Failed to delete instance");
      }
      return { logId, instanceId };
    },
    onSuccess: ({ logId, instanceId }) => {
      queryClient.invalidateQueries({ queryKey: ["logGroup", logId] });
      queryClient.invalidateQueries({ queryKey: ["logGroups"] });
      queryClient.removeQueries({ queryKey: ["instance", instanceId] });
      queryClient.removeQueries({ queryKey: ["instanceYoutube", instanceId] });
    },
  });
}

export interface ReparseLogGroupOptions {
  logId: string;
  /** Enable debug mode annotations in parsed output */
  withDebug?: boolean;
}

export function useReparseLogGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ logId, withDebug = false }: ReparseLogGroupOptions) => {
      const url = new URL(`/api/v1/raidlogs/logs/${logId}/reparse`, window.location.origin);
      if (withDebug) {
        url.searchParams.set("verbose", "true");
      }
      const response = await fetch(url.toString(), {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to reparse log" }));
        throw new Error(error.message || "Failed to reparse log");
      }
      return response.json() as Promise<WoWLogGroupState>;
    },
    onSuccess: (_data, { logId }) => {
      // Invalidate to refetch with new job status
      queryClient.invalidateQueries({ queryKey: ["logGroup", logId] });
    },
  });
}

export function useDeleteLogFiles() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (logId: string) => {
      const response = await fetch(`/api/v1/raidlogs/logs/${logId}/delete-files`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to delete files" }));
        throw new Error(error.message || "Failed to delete files");
      }
      return logId;
    },
    onSuccess: (logId) => {
      // Invalidate to refetch with updated file status
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

export function useUploadInstanceYoutube() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ instanceId, data }: { instanceId: string; data: Video }) => {
      const response = await fetch(
        `/api/v1/raidlogs/instances/${encodeURIComponent(instanceId)}/youtube`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to upload YouTube sync data");
      }
      return response.json();
    },
    onSuccess: (_, { instanceId }) => {
      queryClient.invalidateQueries({ queryKey: ["instanceYoutube", instanceId] });
    },
  });
}

// Admin queries

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

export type AdminLogsSortField = "date" | "user" | "size" | "instance";

export interface AdminLogsParams {
  limit?: number;
  offset?: number;
  sortBy?: AdminLogsSortField;
  sortOrder?: "asc" | "desc";
  userId?: string;
  instanceName?: string;
}

export function useAdminLogs(
  params: AdminLogsParams = {},
  options?: Omit<UseQueryOptions<AdminLogsResponse>, "queryKey" | "queryFn">
) {
  const { limit = 50, offset = 0, sortBy = "date", sortOrder = "desc", userId, instanceName } = params;

  return useQuery({
    queryKey: ["admin", "logs", { limit, offset, sortBy, sortOrder, userId, instanceName }],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (userId) searchParams.set("user_id", userId);
      if (instanceName) searchParams.set("instance_name", instanceName);
      const response = await fetch(`/api/v1/admin/logs?${searchParams}`);
      if (!response.ok) throw new Error("Failed to fetch logs");
      return response.json() as Promise<AdminLogsResponse>;
    },
    retry: false,
    ...options,
  });
}

export function useAdminInstanceNames(options?: Omit<UseQueryOptions<string[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["admin", "instance-names"],
    queryFn: async () => {
      const response = await fetch("/api/v1/admin/instance-names");
      if (!response.ok) throw new Error("Failed to fetch instance names");
      return response.json() as Promise<string[]>;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
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

export function useUserGrants(userId: string, options?: Omit<UseQueryOptions<DataGrant[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["admin", "users", userId, "grants"],
    queryFn: async () => {
      const response = await fetch(`/api/v1/admin/users/${userId}/grants`);
      if (!response.ok) {
        throw new Error("Failed to fetch user grants");
      }
      return response.json() as Promise<DataGrant[]>;
    },
    ...options,
  });
}

export function useUpsertUserGrant() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      userId, 
      source, 
      storageBytes, 
      description,
      expiresAt,
    }: { 
      userId: string; 
      source: string; 
      storageBytes: number;
      description?: string;
      expiresAt?: string;
    }) => {
      const response = await fetch(`/api/v1/admin/users/${userId}/grants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          source,
          storage_bytes: storageBytes,
          description,
          expires_at: expiresAt,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to upsert grant" }));
        throw new Error(error.message || "Failed to upsert grant");
      }
      return response.json() as Promise<DataGrant>;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users", variables.userId, "grants"] });
    },
  });
}

export function useDeleteUserGrant() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, source }: { userId: string; source: string }) => {
      const response = await fetch(`/api/v1/admin/users/${userId}/grants/${encodeURIComponent(source)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to delete grant" }));
        throw new Error(error.message || "Failed to delete grant");
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users", variables.userId, "grants"] });
    },
  });
}
// WoWDB queries

export function useSpell(
  spellId: string,
  options?: Omit<UseQueryOptions<WoWSpell>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["wowdb", "spell", spellId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/wowdb/spell/${spellId}`);
      if (!response.ok) throw new Error("Spell not found");
      return response.json() as Promise<WoWSpell>;
    },
    staleTime: Infinity, // DBC data never changes
    retry: false, // Don't retry on 404
    ...options,
  });
}

export function useSpellsByName(
  name: string,
  options?: Omit<UseQueryOptions<WoWSpell[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["wowdb", "spell-by-name", name],
    queryFn: async () => {
      const response = await fetch(`/api/v1/wowdb/spell-by-name/${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error("Spell not found");
      return response.json() as Promise<WoWSpell[]>;
    },
    staleTime: Infinity, // DBC data never changes
    retry: false, // Don't retry on 404
    ...options,
  });
}

export function useArmorySearch(
  params: { q: string; class?: string; realm?: string; guild?: string },
  options?: Omit<UseQueryOptions<ArmorySearchResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["armory-search", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set("q", params.q);
      if (params.class) searchParams.set("class", params.class);
      if (params.realm) searchParams.set("realm", params.realm);
      if (params.guild) searchParams.set("guild", params.guild);
      const response = await fetch(`/api/v1/armory/search?${searchParams}`);
      if (!response.ok) {
        throw buildAPIError("Search failed", await response.json());
      }
      return response.json() as Promise<ArmorySearchResponse>;
    },
    enabled: params.q.length >= 2,
    staleTime: 30_000,
    ...options,
  });
}

// --- Guild Pages ---

export function useGuildPage(guildId: string | undefined) {
  return useQuery({
    queryKey: ["guild-page", guildId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/guilds/${guildId}/page`, {
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to fetch guild page", error);
      }
      return response.json() as Promise<GuildPageConfig>;
    },
    enabled: !!guildId,
  });
}

export function useGuildRoster(guildId: string | undefined) {
  return useQuery({
    queryKey: ["guild-roster", guildId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/guilds/${guildId}/roster`, {
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to fetch guild roster", error);
      }
      return response.json() as Promise<GuildRosterMember[]>;
    },
    enabled: !!guildId,
  });
}

export function useGuildSettings(guildId: string | undefined) {
  return useQuery({
    queryKey: ["guild-settings", guildId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/guilds/${guildId}/settings`, {
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to fetch guild settings", error);
      }
      return response.json() as Promise<GuildSettings>;
    },
    enabled: !!guildId,
  });
}

export function useUpdateGuildSettings(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (req: UpdateGuildSettingsRequest) => {
      const response = await fetch(`/api/v1/guilds/${guildId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to update guild settings", error);
      }
      return response.json() as Promise<GuildSettings>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guild-settings", guildId] });
    },
  });
}

export function useGuildJoinRequests(guildId: string | undefined) {
  return useQuery({
    queryKey: ["guild-join-requests", guildId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/guilds/${guildId}/join-requests`, {
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to fetch join requests", error);
      }
      return response.json() as Promise<GuildJoinRequest[]>;
    },
    enabled: !!guildId,
  });
}

export function useMyJoinRequest(guildId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["guild-join-request-me", guildId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/guilds/${guildId}/join-requests/me`, {
        credentials: "include",
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to check join request status", error);
      }
      return response.json() as Promise<GuildJoinRequest>;
    },
    enabled: !!guildId && enabled,
  });
}

export function useCreateJoinRequest(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateJoinRequestBody) => {
      const response = await fetch(`/api/v1/guilds/${guildId}/join-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to submit join request", error);
      }
      return response.json() as Promise<GuildJoinRequest>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guild-join-request-me", guildId] });
    },
  });
}

export function useAcceptJoinRequest(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const response = await fetch(`/api/v1/guilds/${guildId}/join-requests/${requestId}/accept`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to accept join request", error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guild-join-requests", guildId] });
      queryClient.invalidateQueries({ queryKey: ["guild-roster", guildId] });
    },
  });
}

export function useDenyJoinRequest(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const response = await fetch(`/api/v1/guilds/${guildId}/join-requests/${requestId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to deny join request", error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guild-join-requests", guildId] });
    },
  });
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

export function useSaveGuildPage(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tabs, theme }: { tabs: readonly GuildPageTab[]; theme?: GuildPageTheme }) => {
      // Upsert page with theme (always if theme provided, or if new tabs need page to exist)
      const hasNewTabs = tabs.some((t) => t.id === NIL_UUID || t.id.startsWith("tab-"));
      if (theme || hasNewTabs) {
        const upsertResp = await fetch(`/api/v1/guilds/${guildId}/page`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: theme ?? {} } satisfies UpdateGuildPageRequest),
          credentials: "include",
        });
        if (!upsertResp.ok) {
          const error = await upsertResp.json().catch(() => null);
          throw buildAPIError("Failed to save guild page", error);
        }
      }

      // Save each tab
      await Promise.all(
        tabs.map(async (tab) => {
          let tabId = tab.id;

          // Create tab if it doesn't exist in the DB yet
          if (tabId === NIL_UUID || tabId.startsWith("tab-")) {
            const createResp = await fetch(`/api/v1/guilds/${guildId}/page/tabs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ label: tab.label, slug: tab.slug } satisfies CreateTabRequest),
              credentials: "include",
            });
            if (!createResp.ok) {
              const error = await createResp.json().catch(() => null);
              throw buildAPIError("Failed to create tab", error);
            }
            const created = await createResp.json() as GuildPageTab;
            tabId = created.id;
          }

          // Update tab with panels — normalize IDs for backend (must be valid UUIDs)
          const cleanPanels = (tab.panels ?? []).map((p) => ({
            id: isValidUUID(p.id) ? p.id : NIL_UUID,
            panel_type: p.panel_type,
            config: p.config ?? {},
            position: p.position ?? { x: 0, y: 0, w: 6, h: 2 },
            visibility: p.visibility ?? "all",
          }));
          const updateResp = await fetch(`/api/v1/guilds/${guildId}/page/tabs/${tabId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: tab.label, panels: cleanPanels }),
            credentials: "include",
          });
          if (!updateResp.ok) {
            const error = await updateResp.json().catch(() => null);
            throw buildAPIError("Failed to update tab", error);
          }
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guild-page", guildId] });
    },
  });
}

