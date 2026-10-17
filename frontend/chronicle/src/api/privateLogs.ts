import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

export type PrivateLogAccessStatus = "none" | "owner" | "pending" | "approved" | "denied" | "revoked";

export interface PrivateLogAccessContext {
  is_owner?: boolean;
  can_manage?: boolean;
  access_status?: PrivateLogAccessStatus;
  request_status?: PrivateLogAccessStatus;
}

export interface PrivateLogShare {
  code: string;
  url: string;
}

export interface PrivateLogShareMetadata {
  log_group_id: string;
  owner_name?: string;
  private: boolean;
  access_status?: PrivateLogAccessStatus;
}

export interface PrivateLogAccessRequest {
  id: string;
  log_group_id: string;
  requester_id: string;
  requester_name?: string;
  status: PrivateLogAccessStatus;
  created_at: string;
  updated_at: string;
  decided_by?: string;
  decided_at?: string;
}

export class PrivateLogAPIError extends Error {
  readonly status: number;
  readonly link?: string;
  readonly code?: string;
  readonly accessStatus?: PrivateLogAccessStatus;

  constructor(
    message: string,
    status: number,
    link?: string,
    code?: string,
    accessStatus?: PrivateLogAccessStatus,
  ) {
    super(message);
    this.name = "PrivateLogAPIError";
    this.status = status;
    this.link = link;
    this.code = code;
    this.accessStatus = accessStatus;
  }
}

export async function readAPIError(response: Response, fallback: string): Promise<PrivateLogAPIError> {
  const body = await response.json().catch(() => null) as {
    message?: string;
    link?: string;
    share_url?: string;
    code?: string;
    access_status?: PrivateLogAccessStatus;
    request_status?: PrivateLogAccessStatus;
  } | null;
  return new PrivateLogAPIError(
    body?.message ?? fallback,
    response.status,
    body?.link ?? body?.share_url,
    body?.code,
    body?.access_status ?? body?.request_status,
  );
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null) as { message?: string } | null;
  return new Error(body?.message ?? fallback);
}

export function useUpdateLogPrivacy(logId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (privateLog: boolean) => {
      const response = await fetch(`/api/v1/raidlogs/logs/${encodeURIComponent(logId)}/privacy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ private: privateLog }),
      });
      if (!response.ok) throw await readError(response, `Failed to make log ${privateLog ? "private" : "public"}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logGroup", logId] });
      queryClient.invalidateQueries({ queryKey: ["logGroups"] });
      queryClient.invalidateQueries({ queryKey: ["instance"] });
    },
  });
}

export function useCreatePrivateLogShare() {
  return useMutation({
    mutationFn: async (logId: string) => {
      const response = await fetch(`/api/v1/raidlogs/logs/${encodeURIComponent(logId)}/private-share-links`, {
        method: "POST",
      });
      if (!response.ok) throw await readError(response, "Failed to create private share link");
      return response.json() as Promise<PrivateLogShare>;
    },
  });
}

export function usePrivateLogShare(
  code: string,
  options?: Omit<UseQueryOptions<PrivateLogShareMetadata>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["privateLogShare", code],
    queryFn: async () => {
      const response = await fetch(`/api/v1/private-log-shares/${encodeURIComponent(code)}`);
      if (!response.ok) throw await readError(response, "This private log share is unavailable");
      return response.json() as Promise<PrivateLogShareMetadata>;
    },
    retry: false,
    ...options,
  });
}

export function useRequestPrivateLogAccess(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/private-log-shares/${encodeURIComponent(code)}/request`, {
        method: "POST",
      });
      if (!response.ok) throw await readError(response, "Failed to request access");
      return response.json().catch(() => ({})) as Promise<unknown>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["privateLogShare", code] }),
  });
}

export function usePrivateLogAccessRequests(
  logId: string,
  options?: Omit<UseQueryOptions<PrivateLogAccessRequest[]>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["privateLogAccessRequests", logId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/logs/${encodeURIComponent(logId)}/access-requests`);
      if (!response.ok) throw await readError(response, "Failed to load access requests");
      return response.json() as Promise<PrivateLogAccessRequest[]>;
    },
    retry: false,
    ...options,
  });
}

export function useUpdatePrivateLogAccessRequest(logId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, action }: { requestId: string; action: "approve" | "deny" | "revoke" }) => {
      const response = await fetch(
        `/api/v1/raidlogs/logs/${encodeURIComponent(logId)}/access-requests/${encodeURIComponent(requestId)}/${action}`,
        { method: "POST" },
      );
      if (!response.ok) throw await readError(response, `Failed to ${action} access request`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["privateLogAccessRequests", logId] }),
  });
}
