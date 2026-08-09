import { useQuery, useMutation, useQueryClient, keepPreviousData, type UseQueryOptions } from "@tanstack/react-query";
import type { WoWSpell } from "./wowdb";
import type { WoWServer, WoWServerRealm, UploadKey, CreateWoWServerRequest, CreateWoWServerRealmRequest, CreateUploadKeyRequest, RetentionPolicy, RetentionPreviewResponse, RetentionPreviewRequest, SupportedInstance, CensusEntry, Tenant, UpsertTenantRequest, ServerApplication, CreateServerApplicationRequest, CreateModificationRequestPayload, ApplicationAdminEntry } from "./typesGenerated";
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
  InstanceLoot as InstanceLootGenerated,
  AdminUsersResponse as AdminUsersResponseGenerated,
  AdminLogsResponse as AdminLogsResponseGenerated,
  User as UserGenerated,
  AdminLog as AdminLogGenerated,
  Session as SessionGenerated,
  AuthorizationRequest as AuthorizationRequestGenerated,
  AuthorizationResponse as AuthorizationResponseGenerated,
  UserStorageInfo as UserStorageInfoGenerated,
  LinkedCharacter as LinkedCharacterGenerated,
  SetPrimaryCharacterRequest as SetPrimaryCharacterRequestGenerated,
  CharacterLinkInfo as CharacterLinkInfoGenerated,
  LinkCharacterRequest as LinkCharacterRequestGenerated,
  ExternalSyncResponse as ExternalSyncResponseGenerated,
  DataGrant as DataGrantGenerated,
  UpsertDataGrantRequest as UpsertDataGrantRequestGenerated,
  ListUserPanelLayoutsResponse as ListUserPanelLayoutsResponseGenerated,
  CreateUserPanelLayoutRequest as CreateUserPanelLayoutRequestGenerated,
  UpdateUserPanelLayoutRequest as UpdateUserPanelLayoutRequestGenerated,
  UserPanelLayout as UserPanelLayoutGenerated,
  UserTalentBuild,
  ListUserTalentBuildsResponse,
  CreateUserTalentBuildRequest,
  UpdateUserTalentBuildRequest,
  ActionBarSlotsResponse as ActionBarSlotsResponseGenerated,
  InstanceDefaultsResponse as InstanceDefaultsResponseGenerated,
  CreateShareRequest as CreateShareRequestGenerated,
  CreateShareResponse as CreateShareResponseGenerated,
  SharedViewResponse as SharedViewResponseGenerated,
  ArmorySearchResponse as ArmorySearchResponseGenerated,
  ArmoryPlayer as ArmoryPlayerGenerated,
  ArmoryGearHistoryResponse as ArmoryGearHistoryResponseGenerated,
  ArmoryLootResponse as ArmoryLootResponseGenerated,
  ListGuildsResponse as ListGuildsResponseGenerated,
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
  RegressionFixture as RegressionFixtureGenerated,
  RegressionSnapshotSummary as RegressionSnapshotSummaryGenerated,
  RegressionSnapshotFull as RegressionSnapshotFullGenerated,
  CreateRegressionFixtureRequest as CreateRegressionFixtureRequestGenerated,
  RequeueVersionResponse as RequeueVersionResponseGenerated,
  AdminBulkDeleteResponse as AdminBulkDeleteResponseGenerated,
  AdminBulkSelectedReparseResponse as AdminBulkSelectedReparseResponseGenerated,
  AdminBulkReparseResponse as AdminBulkReparseResponseGenerated,
  AdminOutdatedInstancesResponse,
  SiteConfig,
  UpdateSiteConfigRequest,
  Dataset,
  UpsertDatasetRequest,
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
export type InstanceLoot = InstanceLootGenerated;

export type AdminUsersResponse = AdminUsersResponseGenerated;
export type AdminLogsResponse = AdminLogsResponseGenerated;
export type User = UserGenerated;
export type AdminLog = AdminLogGenerated;
export type Session = SessionGenerated;
export type AuthorizationRequest = AuthorizationRequestGenerated;
export type AuthorizationResponse = AuthorizationResponseGenerated;
export type UserStorageInfo = UserStorageInfoGenerated;
export type LinkedCharacter = LinkedCharacterGenerated;
export type SetPrimaryCharacterRequest = SetPrimaryCharacterRequestGenerated;
export type CharacterLinkInfo = CharacterLinkInfoGenerated;
export type LinkCharacterRequest = LinkCharacterRequestGenerated;
export type ExternalSyncResponse = ExternalSyncResponseGenerated;
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
export type ArmoryPlayer = ArmoryPlayerGenerated;
export type ArmoryGearHistoryResponse = ArmoryGearHistoryResponseGenerated;
export type ArmoryLootResponse = ArmoryLootResponseGenerated;
export type ListGuildsResponse = ListGuildsResponseGenerated;
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
export type AdminBulkDeleteResponse = AdminBulkDeleteResponseGenerated;
export type AdminBulkSelectedReparseResponse = AdminBulkSelectedReparseResponseGenerated;
export type AdminBulkReparseResponse = AdminBulkReparseResponseGenerated;

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

/** Show an API error as a toast, including the detail field if present. */
export function toastError(err: Error) {
  const detail = (err as RequestError).detail;
  const message = detail ? `${err.message}: ${detail}` : err.message;
  return message;
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

export function useMyCharacters(options?: Omit<UseQueryOptions<LinkedCharacter[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["my-characters"],
    queryFn: async () => {
      const response = await fetch("/api/v1/linked/me", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch linked characters");
      }
      return response.json() as Promise<LinkedCharacter[]>;
    },
    ...options,
  });
}

export function useSetPrimaryCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: SetPrimaryCharacterRequest) => {
      const response = await fetch("/api/v1/linked/me/primary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to set primary character", error);
      }
      return response.json() as Promise<LinkedCharacter[]>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-characters"] });
    },
  });
}

export function useExternalCharacterSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/v1/linked/me/external-sync", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to sync characters", error);
      }
      return response.json() as Promise<ExternalSyncResponse>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["my-characters"] });
      queryClient.setQueryData(["external-sync-status"], result);
    },
  });
}

export function useExternalSyncStatus(options?: Omit<UseQueryOptions<ExternalSyncResponse | null>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["external-sync-status"],
    queryFn: async () => {
      const response = await fetch("/api/v1/linked/me/external-sync", { credentials: "include" });
      // 204: never synced; 404: provider disabled.
      if (response.status === 204 || response.status === 404) return null;
      if (!response.ok) {
        throw new Error("Failed to fetch sync status");
      }
      return response.json() as Promise<ExternalSyncResponse>;
    },
    ...options,
  });
}

export function useUnlinkMyCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (character: { realm_id: string; character_guid: string }) => {
      const response = await fetch(
        `/api/v1/linked/me/${encodeURIComponent(character.realm_id)}/${encodeURIComponent(character.character_guid)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to unlink character", error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-characters"] });
    },
  });
}

export function useAdminUserCharacters(userId: string, options?: Omit<UseQueryOptions<LinkedCharacter[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["admin", "users", userId, "characters"],
    queryFn: async () => {
      const response = await fetch(`/api/v1/linked/users/${encodeURIComponent(userId)}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw buildAPIError("Failed to fetch linked characters", await response.json().catch(() => null));
      }
      return response.json() as Promise<LinkedCharacter[]>;
    },
    ...options,
  });
}

export function useAdminCharacterLink(
  character: { realm_id?: string; character_guid?: string },
  options?: Omit<UseQueryOptions<CharacterLinkInfo | null>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["admin", "character-link", character.realm_id, character.character_guid],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/linked/characters/${encodeURIComponent(character.realm_id!)}/${encodeURIComponent(character.character_guid!)}`,
        { credentials: "include" },
      );
      if (response.status === 404) return null;
      if (!response.ok) {
        throw buildAPIError("Failed to fetch character link", await response.json().catch(() => null));
      }
      return response.json() as Promise<CharacterLinkInfo>;
    },
    enabled: !!character.realm_id && !!character.character_guid,
    ...options,
  });
}

export function useAdminLinkCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, request }: { userId: string; request: LinkCharacterRequest }) => {
      const response = await fetch(`/api/v1/linked/users/${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });
      if (!response.ok) {
        throw buildAPIError("Failed to link character", await response.json().catch(() => null));
      }
      return response.json() as Promise<LinkedCharacter>;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users", vars.userId, "characters"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "character-link"] });
      queryClient.invalidateQueries({ queryKey: ["my-characters"] });
    },
  });
}

export function useAdminUnlinkCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      realmId,
      characterGuid,
    }: {
      userId: string;
      realmId: string;
      characterGuid: string;
    }) => {
      const response = await fetch(
        `/api/v1/linked/users/${encodeURIComponent(userId)}/${encodeURIComponent(realmId)}/${encodeURIComponent(characterGuid)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) {
        throw buildAPIError("Failed to unlink character", await response.json().catch(() => null));
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users", vars.userId, "characters"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "character-link"] });
      queryClient.invalidateQueries({ queryKey: ["my-characters"] });
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

const supportedInstancesCacheTime = 1000 * 60 * 60 * 24;

function supportedInstancesQueryKey() {
  return ["supportedInstances", window.location.host] as const;
}

async function fetchSupportedInstances(): Promise<SupportedInstance[]> {
  const response = await fetch("/api/v1/raidlogs/supported");
  if (!response.ok) throw new Error("Failed to fetch supported instances");
  return response.json() as Promise<SupportedInstance[]>;
}

export function useSupportedInstances(options?: Omit<UseQueryOptions<SupportedInstance[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: supportedInstancesQueryKey(),
    queryFn: fetchSupportedInstances,
    staleTime: supportedInstancesCacheTime,
    gcTime: supportedInstancesCacheTime,
    ...options,
  });
}

function selectSupportedInstanceBossCounts(instances: SupportedInstance[]) {
  return new Map(
    instances.flatMap((instance) =>
      instance.boss_count == null ? [] : [[instance.name, instance.boss_count] as const],
    ),
  );
}

export function useSupportedInstanceBossCounts() {
  return useQuery({
    queryKey: supportedInstancesQueryKey(),
    queryFn: fetchSupportedInstances,
    staleTime: supportedInstancesCacheTime,
    gcTime: supportedInstancesCacheTime,
    select: selectSupportedInstanceBossCounts,
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
  /** Enable identity mode to collect all creatures/spells (admin only) */
  identityMode?: boolean;
  /** Override the log type before reparsing (admin only) */
  logType?: string;
  /** Override the parse format before reparsing (admin only) */
  format?: string;
  /** Override the server flavor (comma-joined tags) before reparsing (admin only) */
  flavor?: string;
}

export function useReparseLogGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ logId, withDebug = false, identityMode = false, logType, format, flavor }: ReparseLogGroupOptions) => {
      const url = new URL(`/api/v1/raidlogs/logs/${logId}/reparse`, window.location.origin);
      if (withDebug) {
        url.searchParams.set("verbose", "true");
      }
      if (identityMode) {
        url.searchParams.set("identity_mode", "true");
      }
      if (logType) {
        url.searchParams.set("log_type", logType);
      }
      if (format) {
        url.searchParams.set("format", format);
      }
      if (flavor) {
        url.searchParams.set("flavor", flavor);
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

export function useBulkReparseOutdatedInstances() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ instanceName, parserVersion }: { instanceName?: string; parserVersion?: string }) => {
      const params = new URLSearchParams();
      if (instanceName) params.set("instance_name", instanceName);
      if (parserVersion) params.set("parser_version", parserVersion);
      const url = "/api/v1/admin/outdated-instances/reparse" + (params.toString() ? `?${params}` : "");
      const response = await fetch(url, { method: "POST" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to bulk reparse logs" }));
        throw new Error(error.message || "Failed to bulk reparse logs");
      }
      return response.json() as Promise<AdminBulkReparseResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "outdated-instances"] });
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

export function useInstanceLoot(instanceId: string, options?: Omit<UseQueryOptions<InstanceLoot[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["instanceLoot", instanceId],
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/instances/${instanceId}/loot`);
      if (!response.ok) throw new Error("Failed to fetch loot");
      return response.json() as Promise<InstanceLoot[]>;
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
  withoutInstance?: boolean;
}

export function useAdminLogs(
  params: AdminLogsParams = {},
  options?: Omit<UseQueryOptions<AdminLogsResponse>, "queryKey" | "queryFn">
) {
  const {
    limit = 50,
    offset = 0,
    sortBy = "date",
    sortOrder = "desc",
    userId,
    instanceName,
    withoutInstance = false,
  } = params;

  return useQuery({
    queryKey: ["admin", "logs", { limit, offset, sortBy, sortOrder, userId, instanceName, withoutInstance }],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (userId) searchParams.set("user_id", userId);
      if (instanceName) searchParams.set("instance_name", instanceName);
      if (withoutInstance) searchParams.set("without_instance", "true");
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

export function useAdminBulkDeleteLogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (logIds: string[]) => {
      const response = await fetch("/api/v1/admin/logs/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_ids: logIds }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to bulk delete logs" }));
        throw new Error(error.message || "Failed to bulk delete logs");
      }
      return response.json() as Promise<AdminBulkDeleteResponse>;
    },
    onSuccess: (_data, logIds) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "logs"] });
      for (const logId of logIds) {
        queryClient.removeQueries({ queryKey: ["logGroup", logId] });
      }
    },
  });
}

export function useAdminBulkReparseLogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (logIds: string[]) => {
      const response = await fetch("/api/v1/admin/logs/reparse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_ids: logIds }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to bulk reparse logs" }));
        throw new Error(error.message || "Failed to bulk reparse logs");
      }
      return response.json() as Promise<AdminBulkSelectedReparseResponse>;
    },
    onSuccess: (_data, logIds) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "logs"] });
      for (const logId of logIds) {
        queryClient.invalidateQueries({ queryKey: ["logGroup", logId] });
      }
    },
  });
}

export function useAdminOutdatedInstances(instanceName?: string, parserVersion?: string) {
  return useQuery({
    queryKey: ["admin", "outdated-instances", instanceName ?? "", parserVersion ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (instanceName) params.set("instance_name", instanceName);
      if (parserVersion) params.set("parser_version", parserVersion);
      const url = "/api/v1/admin/outdated-instances" + (params.toString() ? `?${params}` : "");
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch outdated instances");
      return response.json() as Promise<AdminOutdatedInstancesResponse>;
    },
  });
}
export function useSiteConfig() {
  return useQuery({
    queryKey: ["site-config"],
    queryFn: async () => {
      const response = await fetch("/api/v1/site-config");
      if (!response.ok) throw new Error("Failed to fetch site config");
      return response.json() as Promise<SiteConfig>;
    },
  });
}

// useDatasets lists the available game-data datasets (id, name, slug, version).
// Used by the talent-tree dataset selector.
export function useDatasets() {
  return useQuery({
    queryKey: ["datasets"],
    queryFn: async () => {
      const response = await fetch("/api/v1/datasets");
      if (!response.ok) throw new Error("Failed to fetch datasets");
      return response.json() as Promise<Dataset[]>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// useFlavors returns all known flavor tags from the server.
export function useFlavors() {
  return useQuery({
    queryKey: ["flavors"],
    queryFn: async () => {
      const response = await fetch("/api/v1/flavors");
      if (!response.ok) throw new Error("Failed to fetch flavors");
      return response.json() as Promise<string[]>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** The well-known default dataset; it is the bottom of every resolution chain
 * and cannot be deleted. Mirrors servicedataset.DefaultDatasetID. */
export interface DatasetImportSummary {
  spells_count: number;
  creatures_count: number;
  items_count: number;
  item_display_count: number;
  enchantments_count: number;
  random_properties_count: number;
  item_sets_count: number;
  // Spell metadata counts:
  cast_times_count: number;
  durations_count: number;
  ranges_count: number;
  icons_count: number;
  categories_count: number;
  radii_count: number;
  focus_objects_count: number;
  extra_attacks_count: number;
  duration_modifiers_count: number;
  periodic_spells_count: number;
  cooldowns_count: number;
  desc_variables_count: number;
  affected_aura_durations_count: number;
  consumables_count: number;
  has_talents: boolean;
}

export function useDatasetImportSummary(datasetId: string | undefined) {
  return useQuery({
    queryKey: ["datasets", datasetId, "import-summary"],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/admin/datasets/${datasetId}/import-summary`,
      );
      if (!response.ok) throw new Error("Failed to fetch import summary");
      return response.json() as Promise<DatasetImportSummary>;
    },
    enabled: !!datasetId,
    staleTime: 30 * 1000,
  });
}

export const DEFAULT_DATASET_ID = "00000000-0000-0000-0000-000000000001";

// useUpsertDataset creates (no id) or updates (with id) a dataset via the admin
// route. Invalidates the datasets list on success.
export function useUpsertDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (req: UpsertDatasetRequest) => {
      const isUpdate = !!req.id;
      const url = isUpdate
        ? `/api/v1/admin/datasets/${req.id}`
        : "/api/v1/admin/datasets/";
      const response = await fetch(url, {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to save dataset (${response.status})`);
      }
      return response.json() as Promise<Dataset>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}

// useDeleteDataset removes a dataset (the default dataset is rejected server-side).
export function useDeleteDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/admin/datasets/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to delete dataset (${response.status})`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}

export function useUpdateSiteConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: UpdateSiteConfigRequest) => {
      const response = await fetch("/api/v1/admin/site-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error("Failed to update site config");
      return response.json() as Promise<SiteConfig>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-config"] });
    },
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

export function useSetUserRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, roles }: { userId: string; roles: string[] }) => {
      const response = await fetch(`/api/v1/admin/users/${userId}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to set roles" }));
        throw new Error(error.message || "Failed to set roles");
      }
      return response.json() as Promise<User>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useSetUserRetention() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, rawLogRetentionHours }: { userId: string; rawLogRetentionHours: number }) => {
      const response = await fetch(`/api/v1/admin/users/${userId}/retention`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_log_retention_hours: rawLogRetentionHours }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to set retention" }));
        throw new Error(error.message || "Failed to set retention");
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
  datasetId?: string,
  options?: Omit<UseQueryOptions<WoWSpell>, "queryKey" | "queryFn">,
) {
  const ds = datasetId ? `?dataset_id=${datasetId}` : "";
  return useQuery({
    queryKey: ["wowdb", "spell", spellId, datasetId ?? "default"],
    queryFn: async () => {
      const response = await fetch(`/api/v1/wowdb/spell/${spellId}${ds}`);
      if (!response.ok) throw new Error("Spell not found");
      return response.json() as Promise<WoWSpell>;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: false, // Don't retry on 404
    ...options,
  });
}

export function useSpellsByName(
  name: string,
  datasetId?: string,
  options?: Omit<UseQueryOptions<WoWSpell[]>, "queryKey" | "queryFn">,
) {
  const ds = datasetId ? `?dataset_id=${datasetId}` : "";
  return useQuery({
    queryKey: ["wowdb", "spell-by-name", name, datasetId ?? "default"],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/wowdb/spell-by-name/${encodeURIComponent(name)}${ds}`,
      );
      if (!response.ok) throw new Error("Spell not found");
      return response.json() as Promise<WoWSpell[]>;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
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

export function useArmoryPlayer(realmName?: string, playerIdentifier?: string) {
  return useQuery({
    queryKey: ["armory", realmName, playerIdentifier],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/armory/${encodeURIComponent(realmName!)}/${encodeURIComponent(playerIdentifier!)}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch player: ${response.status}`);
      }
      return response.json() as Promise<ArmoryPlayer>;
    },
    enabled: !!realmName && !!playerIdentifier,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useArmoryGearHistory(realmName?: string, playerIdentifier?: string) {
  return useQuery({
    queryKey: ["armory-gear-history", realmName, playerIdentifier],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/armory/${encodeURIComponent(realmName!)}/${encodeURIComponent(playerIdentifier!)}/gear-history`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch gear history: ${response.status}`);
      }
      return response.json() as Promise<ArmoryGearHistoryResponse>;
    },
    enabled: !!realmName && !!playerIdentifier,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useArmoryLoot(
  realmName?: string,
  playerIdentifier?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["armory-loot", realmName, playerIdentifier],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/armory/${encodeURIComponent(realmName!)}/${encodeURIComponent(playerIdentifier!)}/loot?limit=200`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch loot: ${response.status}`);
      }
      return response.json() as Promise<ArmoryLootResponse>;
    },
    enabled: enabled && !!realmName && !!playerIdentifier,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useGuildSearch(params: { search: string; offset?: number }) {
  return useQuery({
    queryKey: ["guild-search", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.search) searchParams.set("search", params.search);
      if (params.offset) searchParams.set("offset", String(params.offset));
      const response = await fetch(`/api/v1/guilds/?${searchParams}`);
      if (!response.ok) {
        throw buildAPIError("Guild search failed", await response.json());
      }
      return response.json() as Promise<ListGuildsResponse>;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
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
    retry: false,
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
    retry: false,
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
    retry: false,
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

export function useAddGuildMember(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/v1/guilds/${guildId}/members/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to add guild member", error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guild-roster", guildId] });
    },
  });
}

export function useUpdateGuildMemberRole(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await fetch(`/api/v1/guilds/${guildId}/members/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to update member role", error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guild-roster", guildId] });
    },
  });
}

export function useRemoveGuildMember(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/v1/guilds/${guildId}/members/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw buildAPIError("Failed to remove member", error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guild-roster", guildId] });
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

      // Delete tabs that were removed in the editor. The server is the
      // source of truth for what exists; anything persisted but no longer
      // in the list gets deleted.
      const existingResp = await fetch(`/api/v1/guilds/${guildId}/page`, { credentials: "include" });
      if (existingResp.ok) {
        const existing = (await existingResp.json()) as GuildPageConfig;
        const keptIds = new Set(tabs.map((t) => t.id));
        const removed = (existing.tabs ?? []).filter(
          (t) => t.id !== NIL_UUID && isValidUUID(t.id) && !keptIds.has(t.id),
        );
        await Promise.all(
          removed.map(async (t) => {
            const deleteResp = await fetch(`/api/v1/guilds/${guildId}/page/tabs/${t.id}`, {
              method: "DELETE",
              credentials: "include",
            });
            if (!deleteResp.ok) {
              const error = await deleteResp.json().catch(() => null);
              throw buildAPIError("Failed to delete tab", error);
            }
          }),
        );
      }

      // Save each tab and retain the persisted IDs in the editor's order.
      const tabIds = await Promise.all(
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
            body: JSON.stringify({
              label: tab.label,
              visibility: tab.visibility ?? "all",
              panels: cleanPanels,
            }),
            credentials: "include",
          });
          if (!updateResp.ok) {
            const error = await updateResp.json().catch(() => null);
            throw buildAPIError("Failed to update tab", error);
          }

          return tabId;
        })
      );

      const reorderResp = await fetch(`/api/v1/guilds/${guildId}/page/tabs/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab_ids: tabIds }),
        credentials: "include",
      });
      if (!reorderResp.ok) {
        const error = await reorderResp.json().catch(() => null);
        throw buildAPIError("Failed to reorder tabs", error);
      }
      return tabIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guild-page", guildId] });
    },
  });
}

// ─── Regression Testing ───────────────────────────────────────────────

export function useRegressionFixtures() {
  return useQuery({
    queryKey: ["regression", "fixtures"],
    queryFn: async () => {
      const response = await fetch("/api/v1/regression/fixtures");
      if (!response.ok) throw new Error("Failed to fetch fixtures");
      return response.json() as Promise<RegressionFixtureGenerated[]>;
    },
  });
}

export function useRegressionSnapshots(fixtureId: string) {
  return useQuery({
    queryKey: ["regression", "snapshots", fixtureId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/regression/fixtures/${fixtureId}/snapshots`);
      if (!response.ok) throw new Error("Failed to fetch snapshots");
      return response.json() as Promise<RegressionSnapshotSummaryGenerated[]>;
    },
    enabled: !!fixtureId,
  });
}

export function useRegressionSnapshot(snapshotId: string) {
  return useQuery({
    queryKey: ["regression", "snapshot", snapshotId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/regression/snapshots/${snapshotId}`);
      if (!response.ok) throw new Error("Failed to fetch snapshot");
      return response.json() as Promise<RegressionSnapshotFullGenerated>;
    },
    enabled: !!snapshotId,
  });
}

export function useCreateRegressionFixture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (req: CreateRegressionFixtureRequestGenerated) => {
      const response = await fetch("/api/v1/regression/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!response.ok) throw new Error("Failed to create fixture");
      return response.json() as Promise<RegressionFixtureGenerated>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regression", "fixtures"] }),
  });
}

export function useDeleteRegressionFixture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fixtureId: string) => {
      const response = await fetch(`/api/v1/regression/fixtures/${fixtureId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete fixture");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regression", "fixtures"] }),
  });
}

export function useUpdateRegressionFixtureNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ fixtureId, note }: { fixtureId: string; note: string }) => {
      const response = await fetch(`/api/v1/regression/fixtures/${fixtureId}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!response.ok) throw new Error("Failed to update note");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regression", "fixtures"] }),
  });
}

export function useTakeSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fixtureId: string) => {
      const response = await fetch(`/api/v1/regression/fixtures/${fixtureId}/snapshot`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Failed to take snapshot");
      }
      return response.json() as Promise<RegressionSnapshotSummaryGenerated>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regression"] }),
  });
}

export function useSnapshotAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/v1/regression/snapshot-all", {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Failed to snapshot all");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regression"] }),
  });
}

export function useRegressionJobStatus() {
  return useQuery({
    queryKey: ["regression", "jobs"],
    queryFn: async () => {
      const response = await fetch("/api/v1/regression/jobs");
      if (!response.ok) throw new Error("Failed to fetch job status");
      return response.json() as Promise<{ pending_jobs: number }>;
    },
    refetchInterval: 5000,
  });
}

export function useDeleteRegressionSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const response = await fetch(`/api/v1/regression/snapshots/${snapshotId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete snapshot");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regression"] }),
  });
}

export function useRequeueVersion() {
  return useMutation({
    mutationFn: async (req: { version: string }) => {
      const response = await fetch("/api/v1/regression/requeue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!response.ok) throw new Error("Failed to requeue");
      return response.json() as Promise<RequeueVersionResponseGenerated>;
    },
  });
}

// -- AzerothCore Server Management --

export function useAzerothcoreServers(options?: Omit<UseQueryOptions<WoWServer[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["azerothcore", "servers"],
    queryFn: async () => {
      const response = await fetch("/api/v1/azerothcore/servers");
      if (!response.ok) throw new Error("Failed to fetch servers");
      return response.json() as Promise<WoWServer[]>;
    },
    retry: false,
    ...options,
  });
}

export function useCreateAzerothcoreServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (req: CreateWoWServerRequest) => {
      const response = await fetch("/api/v1/azerothcore/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to create server");
      }
      return response.json() as Promise<WoWServer>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["azerothcore", "servers"] });
    },
  });
}

export function useDeleteAzerothcoreServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (serverId: string) => {
      const response = await fetch(`/api/v1/azerothcore/servers/${serverId}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to delete server");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["azerothcore", "servers"] });
    },
  });
}

export function useAzerothcoreRealms(serverId: string, options?: Omit<UseQueryOptions<WoWServerRealm[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["azerothcore", "realms", serverId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/azerothcore/servers/${serverId}/realms`);
      if (!response.ok) throw new Error("Failed to fetch realms");
      return response.json() as Promise<WoWServerRealm[]>;
    },
    enabled: !!serverId,
    retry: false,
    ...options,
  });
}

export function useCreateAzerothcoreRealm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ serverId, ...req }: CreateWoWServerRealmRequest & { serverId: string }) => {
      const response = await fetch(`/api/v1/azerothcore/servers/${serverId}/realms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to create realm");
      }
      return response.json() as Promise<WoWServerRealm>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["azerothcore", "realms"] });
    },
  });
}

export function useDeleteAzerothcoreRealm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (realmId: string) => {
      const response = await fetch(`/api/v1/azerothcore/realms/${realmId}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to delete realm");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["azerothcore", "realms"] });
    },
  });
}

export function useAzerothcoreUploadKeys(realmId: string, options?: Omit<UseQueryOptions<UploadKey[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["azerothcore", "keys", realmId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/azerothcore/realms/${realmId}/keys`);
      if (!response.ok) throw new Error("Failed to fetch upload keys");
      return response.json() as Promise<UploadKey[]>;
    },
    enabled: !!realmId,
    retry: false,
    ...options,
  });
}

export function useCreateAzerothcoreUploadKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ realmId, ...req }: CreateUploadKeyRequest & { realmId: string }) => {
      const response = await fetch(`/api/v1/azerothcore/realms/${realmId}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to create upload key");
      }
      return response.json() as Promise<UploadKey>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["azerothcore", "keys"] });
    },
  });
}

export function useDeleteAzerothcoreUploadKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) => {
      const response = await fetch(`/api/v1/azerothcore/keys/${keyId}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to delete upload key");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["azerothcore", "keys"] });
    },
  });
}



// -- Retention Policy Management --
// -- Tenant Management --

export function useAdminTenants(
  options?: Omit<UseQueryOptions<Tenant[]>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["admin", "tenants"],
    queryFn: async () => {
      const response = await fetch("/api/v1/admin/tenants");
      if (!response.ok) throw new Error("Failed to fetch tenants");
      return response.json() as Promise<Tenant[]>;
    },
    retry: false,
    ...options,
  });
}

export function useUpsertTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (req: UpsertTenantRequest) => {
      const isCreate = !req.id;
      const method = isCreate ? "POST" : "PUT";
      const url = isCreate
        ? "/api/v1/admin/tenants"
        : `/api/v1/admin/tenants/${req.id}`;
      // Omit id from the body — on create it's server-generated,
      // on update it comes from the URL path.
      const { id: _, ...body } = req;
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to save tenant");
      }
      return response.json() as Promise<Tenant>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
  });
}

export function useDeleteTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tenantId: string) => {
      const response = await fetch(`/api/v1/admin/tenants/${tenantId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to delete tenant");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
  });
}

export function useSetServerTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serverId,
      tenantId,
    }: {
      serverId: string;
      tenantId: string | null;
    }) => {
      const response = await fetch(
        `/api/v1/admin/servers/${serverId}/tenant`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_id: tenantId }),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to set server tenant");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["azerothcore", "servers"] });
    },
  });
}

export function useSetServerDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serverId,
      datasetId,
    }: {
      serverId: string;
      datasetId: string | null;
    }) => {
      const response = await fetch(
        `/api/v1/admin/servers/${serverId}/dataset`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataset_id: datasetId }),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to set server dataset");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["azerothcore", "servers"] });
    },
  });
}

export function useSetTenantDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tenantId,
      datasetId,
    }: {
      tenantId: string;
      datasetId: string | null;
    }) => {
      const response = await fetch(
        `/api/v1/admin/tenants/${tenantId}/dataset`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataset_id: datasetId }),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to set tenant dataset");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
  });
}



export function useRetentionPolicies(options?: Omit<UseQueryOptions<RetentionPolicy[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["admin", "retention", "policies"],
    queryFn: async () => {
      const response = await fetch("/api/v1/admin/retention/policies");
      if (!response.ok) throw new Error("Failed to fetch retention policies");
      return response.json() as Promise<RetentionPolicy[]>;
    },
    retry: false,
    ...options,
  });
}

export function useUpsertRetentionPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (req: { server_id?: string; realm_id?: string; enabled: boolean }) => {
      const response = await fetch("/api/v1/admin/retention/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to upsert retention policy");
      }
      return response.json() as Promise<RetentionPolicy>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "retention", "policies"] });
    },
  });
}

export function useDeleteRetentionPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (policyId: string) => {
      const response = await fetch(`/api/v1/admin/retention/policies/${policyId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to delete retention policy");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "retention", "policies"] });
    },
  });
}

export function useUpsertRetentionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      policyId,
      ...req
    }: {
      policyId: string;
      priority: number;
      action: string;
      conditions: unknown;
      description: string;
    }) => {
      const response = await fetch(`/api/v1/admin/retention/policies/${policyId}/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to upsert retention rule");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "retention", "policies"] });
    },
  });
}

export function useDeleteRetentionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const response = await fetch(`/api/v1/admin/retention/rules/${ruleId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to delete retention rule");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "retention", "policies"] });
    },
  });
}

export function useRetentionPreview() {
  return useMutation({
    mutationFn: async (req: RetentionPreviewRequest) => {
      const response = await fetch("/api/v1/admin/retention/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to preview retention");
      }
      return response.json() as Promise<RetentionPreviewResponse>;
    },
  });
}

export function useRetentionRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dryRun: boolean) => {
      const response = await fetch("/api/v1/admin/retention/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to trigger retention run");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "retention", "policies"] });
    },
  });
}

export function useRealms() {
  return useQuery({
    queryKey: ["realms"],
    queryFn: async () => {
      const response = await fetch("/api/v1/realms");
      if (!response.ok)
        throw buildAPIError(
          "Failed to fetch realms",
          await response.json()
        );
      return response.json() as Promise<WoWServerRealm[]>;
    },
  });
}

export function useCensus(options?: { days?: number; realmIds?: string[] }) {
  const params = new URLSearchParams();
  if (options?.days) params.set("days", String(options.days));
  options?.realmIds?.forEach((id) => params.append("realm_id", id));

  return useQuery({
    queryKey: ["census", options?.days ?? 90, options?.realmIds ?? []],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await fetch(`/api/v1/census?${params}`);
      if (!response.ok)
        throw buildAPIError(
          "Failed to fetch census data",
          await response.json()
        );
      return response.json() as Promise<CensusEntry[]>;
    },
  });
}


// --- Server Applications ---

export function useMyServerApplications() {
  return useQuery({
    queryKey: ["server-application", "mine"],
    retry: false,
    queryFn: async () => {
      const response = await fetch("/api/v1/server-application", {
        credentials: "include",
      });
      if (response.status === 404) return [];
      if (!response.ok) return [];
      return response.json() as Promise<ServerApplication[]>;
    },
  });
}

export function useServerApplication(id: string | undefined) {
  return useQuery({
    queryKey: ["server-application", id],
    enabled: !!id,
    queryFn: async () => {
      const response = await fetch(`/api/v1/server-application/${id}`, {
        credentials: "include",
      });
      if (!response.ok)
        throw buildAPIError("Failed to fetch application", await response.json());
      return response.json() as Promise<ServerApplication>;
    },
  });
}

export function useCreateServerApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateServerApplicationRequest) => {
      const response = await fetch("/api/v1/server-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });
      if (!response.ok)
        throw buildAPIError("Failed to create application", await response.json());
      return response.json() as Promise<ServerApplication>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-application"] });
      queryClient.invalidateQueries({ queryKey: ["azerothcore"] });
    },
  });
}

export function useAdminServerApplications() {
  return useQuery({
    queryKey: ["server-applications", "admin"],
    queryFn: async () => {
      const response = await fetch("/api/v1/server-application/all", {
        credentials: "include",
      });
      if (!response.ok)
        throw buildAPIError("Failed to fetch applications", await response.json());
      return response.json() as Promise<ServerApplication[]>;
    },
  });
}

export function useCreateModificationRequest(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateModificationRequestPayload) => {
      const response = await fetch(
        `/api/v1/server-application/${appId}/requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          credentials: "include",
        }
      );
      if (!response.ok)
        throw buildAPIError("Failed to create request", await response.json());
      return response.json() as Promise<ServerApplication>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-application"] });
      queryClient.invalidateQueries({ queryKey: ["azerothcore"] });
    },
  });
}

export function useUpdateModificationRequest(appId: string, reqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: unknown) => {
      const response = await fetch(
        `/api/v1/server-application/${appId}/requests/${reqId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload }),
          credentials: "include",
        }
      );
      if (!response.ok)
        throw buildAPIError("Failed to update request", await response.json());
      return response.json() as Promise<ServerApplication>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-application"] });
      queryClient.invalidateQueries({ queryKey: ["azerothcore"] });
    },
  });
}

export function useDeleteModificationRequest(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reqId: string) => {
      const response = await fetch(
        `/api/v1/server-application/${appId}/requests/${reqId}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!response.ok)
        throw buildAPIError("Failed to delete request", await response.json());
      return response.json() as Promise<ServerApplication>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-application"] });
      queryClient.invalidateQueries({ queryKey: ["azerothcore"] });
    },
  });
}

export function useApproveModificationRequest(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reqId: string) => {
      const response = await fetch(
        `/api/v1/server-application/${appId}/requests/${reqId}/approve`,
        { method: "POST", credentials: "include" }
      );
      if (!response.ok)
        throw buildAPIError("Failed to approve request", await response.json());
      return response.json() as Promise<ServerApplication>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-application"] });
      queryClient.invalidateQueries({ queryKey: ["azerothcore"] });
    },
  });
}

export function useRejectModificationRequest(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { reqId: string; adminNote?: string }) => {
      const response = await fetch(
        `/api/v1/server-application/${appId}/requests/${args.reqId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_note: args.adminNote }),
          credentials: "include",
        }
      );
      if (!response.ok)
        throw buildAPIError("Failed to reject request", await response.json());
      return response.json() as Promise<ServerApplication>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-application"] });
      queryClient.invalidateQueries({ queryKey: ["azerothcore"] });
    },
  });
}

export function useApplicationAdmins(appId: string | undefined) {
  return useQuery({
    queryKey: ["server-application", appId, "admins"],
    enabled: !!appId,
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/server-application/${appId}/admins`,
        { credentials: "include" }
      );
      if (!response.ok)
        throw buildAPIError("Failed to fetch admins", await response.json());
      return response.json() as Promise<ApplicationAdminEntry[]>;
    },
  });
}

export function useAddApplicationAdmin(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(
        `/api/v1/server-application/${appId}/admins`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
          credentials: "include",
        }
      );
      if (!response.ok)
        throw buildAPIError("Failed to add admin", await response.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-application", appId, "admins"] });
    },
  });
}

export function useRemoveApplicationAdmin(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(
        `/api/v1/server-application/${appId}/admins/${userId}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!response.ok)
        throw buildAPIError("Failed to remove admin", await response.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-application", appId, "admins"] });
    },
  });
}

export function useSyncServers(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/v1/server-application/${appId}/sync-servers`,
        { method: "POST", credentials: "include" }
      );
      if (!response.ok)
        throw buildAPIError("Failed to sync servers", await response.json());
      return response.json() as Promise<ServerApplication>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-application"] });
      queryClient.invalidateQueries({ queryKey: ["azerothcore"] });
    },
  });
}

// ─── Saved talent builds ──────────────────────────────────────────

export function useMyTalentBuilds(enabled = true) {
  return useQuery({
    queryKey: ["my-talent-builds"],
    queryFn: async () => {
      const response = await fetch("/api/v1/me/talent-builds", {
        credentials: "include",
      });
      if (!response.ok)
        throw buildAPIError(
          "Failed to load talent builds",
          await response.json().catch(() => null)
        );
      return response.json() as Promise<ListUserTalentBuildsResponse>;
    },
    enabled,
    retry: false,
  });
}

export function useCreateTalentBuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateUserTalentBuildRequest) => {
      const response = await fetch("/api/v1/me/talent-builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });
      if (!response.ok)
        throw buildAPIError(
          "Failed to save talent build",
          await response.json().catch(() => null)
        );
      return response.json() as Promise<UserTalentBuild>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-talent-builds"] });
    },
  });
}

export function useUpdateTalentBuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      buildID,
      request,
    }: {
      buildID: string;
      request: UpdateUserTalentBuildRequest;
    }) => {
      const response = await fetch(`/api/v1/me/talent-builds/${buildID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });
      if (!response.ok)
        throw buildAPIError(
          "Failed to update talent build",
          await response.json().catch(() => null)
        );
      return response.json() as Promise<UserTalentBuild>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-talent-builds"] });
    },
  });
}

export function useDeleteTalentBuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (buildID: string) => {
      const response = await fetch(`/api/v1/me/talent-builds/${buildID}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok)
        throw buildAPIError(
          "Failed to delete talent build",
          await response.json().catch(() => null)
        );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-talent-builds"] });
    },
  });
}

export function useConsumableDisambiguations(datasetId: string | undefined) {
  return useQuery({
    queryKey: ["consumable-disambiguations", datasetId, "runtime"],
    queryFn: async () => {
      const response = await fetch(`/api/v1/wowdb/consumable-disambiguations?dataset_id=${datasetId}`);
      if (!response.ok) throw new Error("Failed to fetch consumable disambiguations");
      return response.json() as Promise<import("./typesGenerated").ConsumableDisambiguation[]>;
    },
    enabled: !!datasetId,
  });
}

export function useConsumableEffectPolicies(datasetId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["consumable-disambiguations", datasetId, "admin"],
    queryFn: async () => {
      const response = await fetch(`/api/v1/game-data/datasets/${datasetId}/consumable-disambiguations`);
      if (!response.ok) throw new Error("Failed to fetch consumable effect policies");
      return response.json() as Promise<import("./typesGenerated").ConsumableEffectPolicy[]>;
    },
    enabled: enabled && !!datasetId,
  });
}

export function useSetConsumableDisambiguation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ datasetId, effectKind, spellId, itemId }: { datasetId: string; effectKind: import("./typesGenerated").ConsumableEffectKind; spellId: number; itemId: number }) => {
      const response = await fetch(`/api/v1/game-data/datasets/${datasetId}/consumable-disambiguations/${effectKind}/${spellId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: itemId }),
      });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? `Failed to save mapping (${response.status})`); }
      return response.json() as Promise<import("./typesGenerated").ConsumableEffectPolicy>;
    },
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ["consumable-disambiguations", variables.datasetId] }),
  });
}

export function useIgnoreConsumableEffect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ datasetId, effectKind, spellId }: { datasetId: string; effectKind: import("./typesGenerated").ConsumableEffectKind; spellId: number }) => {
      const response = await fetch(`/api/v1/game-data/datasets/${datasetId}/consumable-disambiguations/${effectKind}/${spellId}/ignore`, { method: "PUT" });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? `Failed to ignore effect (${response.status})`); }
      return response.json() as Promise<import("./typesGenerated").ConsumableEffectPolicy>;
    },
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ["consumable-disambiguations", variables.datasetId] }),
  });
}

export function useDeleteConsumableDisambiguation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ datasetId, effectKind, spellId }: { datasetId: string; effectKind: import("./typesGenerated").ConsumableEffectKind; spellId: number }) => {
      const response = await fetch(`/api/v1/game-data/datasets/${datasetId}/consumable-disambiguations/${effectKind}/${spellId}`, { method: "DELETE" });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? `Failed to reset mapping (${response.status})`); }
    },
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ["consumable-disambiguations", variables.datasetId] }),
  });
}
