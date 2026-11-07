import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Local contract until the backend SDK generation is integrated. Keep this
// isolated; do not modify generated declarations to anticipate backend changes.
export interface LeaderboardOperation {
  id: string;
  tenant_id: string;
  requested_by: string;
  purpose: "bootstrap" | "repair";
  scope: "tenant" | "run";
  run_id?: string | null;
  before_date: string;
  cutoff: string;
  date_basis: "run_end_time";
  missing_dates: number;
  state: "discovering" | "draining" | "paused" | "completed";
  phase: string;
  discovered: number;
  discovery_complete: boolean;
  started_at: string;
  completed_at?: string | null;
  last_progress_at: string;
  retry_count: number;
  last_error: string;
}
export interface CreateLeaderboardOperation {
  tenant_id: string;
  purpose: "bootstrap" | "repair";
  scope: "tenant" | "run";
  before_date?: string;
  run_id?: string;
}
export interface LeaderboardMaintenance {
  kind: "partial_coverage" | "repair_in_progress";
  state: "discovering" | "draining" | "paused" | "completed";
  message: string;
  before_date: string;
  cutoff: string;
  date_basis: "run_end_time";
  missing_dates: number;
}
export const operationKey = (tenantID: string) =>
  ["admin", "leaderboard-operations", tenantID] as const;
export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
export function operationActive(operation: LeaderboardOperation): boolean {
  return operation.state !== "completed";
}
export async function operationJSON<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.message ||
        `Leaderboard operation request failed (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}
export function useLeaderboardOperations(tenantID: string) {
  return useQuery({
    queryKey: operationKey(tenantID),
    queryFn: () =>
      operationJSON<{ operations: LeaderboardOperation[] }>(
        `/api/v1/admin/leaderboard-operations?tenant_id=${encodeURIComponent(tenantID)}`,
      ),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.operations.some(operationActive) ? 15_000 : false,
  });
}
export async function performLeaderboardOperationAction(
  action:
    | CreateLeaderboardOperation
    | { id: string; action: "pause" | "resume" },
) {
  const update = "action" in action;
  return operationJSON<LeaderboardOperation>(
    update
      ? `/api/v1/admin/leaderboard-operations/${encodeURIComponent(action.id)}/${action.action}`
      : "/api/v1/admin/leaderboard-operations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: update ? undefined : JSON.stringify(action),
    },
  );
}
export function useLeaderboardOperationAction(tenantID: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: performLeaderboardOperationAction,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: operationKey(tenantID) }),
  });
}
