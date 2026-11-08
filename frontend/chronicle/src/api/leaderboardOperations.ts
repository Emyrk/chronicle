import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CreateLeaderboardOperationRequest,
  LeaderboardOperation,
  LeaderboardOperationList,
} from "./typesGenerated";
export type {
  LeaderboardOperation,
  LeaderboardMaintenance,
  LeaderboardMaintenanceResponse,
} from "./typesGenerated";
export type CreateLeaderboardOperation = CreateLeaderboardOperationRequest;

export const operationKey = (tenantID: string) =>
  ["admin", "leaderboard-operations", tenantID] as const;
export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
export function utcTomorrow(now = new Date()): string {
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return utcToday(tomorrow);
}
export function operationActive(operation: LeaderboardOperation): boolean {
  return operation.state !== "completed";
}
/** Most recently started operation first. */
export function sortedOperations(
  operations: readonly LeaderboardOperation[],
): LeaderboardOperation[] {
  return [...operations].sort((a, b) =>
    b.started_at.localeCompare(a.started_at),
  );
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
export function fetchLeaderboardOperations(tenantID: string) {
  return operationJSON<LeaderboardOperationList>(
    `/api/v1/admin/leaderboard-operations?tenant_id=${encodeURIComponent(tenantID)}`,
  );
}
export function useLeaderboardOperations(tenantID: string) {
  return useQuery({
    queryKey: operationKey(tenantID),
    queryFn: () => fetchLeaderboardOperations(tenantID),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.operations.some(operationActive) ? 15_000 : false,
  });
}
export async function fetchLeaderboardOperationDetail(
  tenantID: string,
  operationID: string,
) {
  const operation = await operationJSON<LeaderboardOperation>(
    `/api/v1/admin/leaderboard-operations/${encodeURIComponent(operationID)}`,
  );
  if (operation.tenant_id !== tenantID)
    throw new Error("Operation belongs to a different tenant");
  return operation;
}
export function useLeaderboardOperationDetail(
  tenantID: string,
  operationID?: string,
) {
  return useQuery({
    queryKey: [...operationKey(tenantID), "detail", operationID],
    enabled: !!operationID,
    queryFn: () => fetchLeaderboardOperationDetail(tenantID, operationID!),
    retry: false,
    refetchInterval: (query) =>
      !query.state.data || operationActive(query.state.data) ? 15_000 : false,
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

const RESULT_PHASES = new Set([
  "player_boss_benchmarks",
  "player_boss_subjects",
  "guild_boss_benchmarks",
  "guild_boss_subjects",
  "guild_clear_benchmarks",
  "guild_clear_subjects",
  "player_renown_counts",
  "guild_renown_counts",
]);
export function operationPhaseDescription(
  operation: LeaderboardOperation,
): string {
  if (operation.phase === "runs")
    return operation.scope === "run"
      ? "Explicit single-run discovery; missing completion dates are allowed."
      : "Canonical run discovery by completion date (inclusive UTC start, exclusive UTC end).";
  if (operation.phase === "evidence")
    return "All-time evidence reconciliation; not limited by the run completion date.";
  if (RESULT_PHASES.has(operation.phase))
    return `All-time result reconciliation: ${operation.phase.replaceAll("_", " ")}.`;
  return `Phase: ${operation.phase || "not reported"}`;
}
