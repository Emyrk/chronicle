import { useQuery } from "@tanstack/react-query";
import type {
  InstanceSearchCursor,
  InstanceSearchExplainResponse,
  InstanceSearchFieldsResponse,
  InstanceSearchLimitResponse,
  InstanceSearchQuery,
  InstanceSearchResponse,
} from "@/api/typesGenerated";

const BASE = "/api/v1/raidlogs/search";

/** The caller's rate-limit bucket, read from RateLimit-* headers. */
export interface SearchBudget {
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export interface SearchPageResult {
  page: InstanceSearchResponse;
  /** Tokens this search cost (Chronicle-Search-Cost). */
  cost: number | null;
  budget: SearchBudget | null;
}

/** A failed search, with the server's user-facing message. */
export class SearchError extends Error {
  readonly status: number;
  readonly detail?: string;
  readonly callToAction?: string;
  readonly cost: number | null;
  readonly budget: SearchBudget | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    status: number,
    detail?: string,
    callToAction?: string,
    cost: number | null = null,
    budget: SearchBudget | null = null,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.callToAction = callToAction;
    this.cost = cost;
    this.budget = budget;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** The server wants the user to log in for this query. */
  get loginRequired(): boolean {
    return this.status === 403;
  }
}

function num(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function readBudget(headers: Headers): SearchBudget | null {
  const limit = num(headers.get("RateLimit-Limit"));
  const remaining = num(headers.get("RateLimit-Remaining"));
  if (limit == null || remaining == null) return null;
  return { limit, remaining, resetSeconds: num(headers.get("RateLimit-Reset")) ?? 0 };
}

export async function runSearch(query: InstanceSearchQuery, cursor?: InstanceSearchCursor): Promise<SearchPageResult> {
  const response = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cursor ? { ...query, cursor } : query),
  });
  const cost = num(response.headers.get("Chronicle-Search-Cost"));
  const budget = readBudget(response.headers);
  if (!response.ok) throw await searchError(response, cost, budget, "Search failed.");
  return { page: (await response.json()) as InstanceSearchResponse, cost, budget };
}

async function searchError(response: Response, cost: number | null, budget: SearchBudget | null, fallback: string): Promise<SearchError> {
  let body: { message?: string; detail?: string; call_to_action?: string } = {};
  try {
    body = await response.json();
  } catch {
    // Non-JSON error body; fall back to the status text.
  }
  return new SearchError(
    body.message ?? (response.statusText || fallback),
    response.status,
    body.detail,
    body.call_to_action,
    cost,
    budget,
    num(response.headers.get("Retry-After")),
  );
}

export interface ExplainResult {
  explanation: InstanceSearchExplainResponse;
  cost: number | null;
  budget: SearchBudget | null;
}

/** Why one run matches a search: per-condition evidence (POST /search/explain). */
export async function explainRun(query: InstanceSearchQuery, instanceId: string): Promise<ExplainResult> {
  const response = await fetch(`${BASE}/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: { where: query.where }, instance_id: instanceId }),
  });
  const cost = num(response.headers.get("Chronicle-Search-Cost"));
  const budget = readBudget(response.headers);
  if (!response.ok) throw await searchError(response, cost, budget, "Explain failed.");
  return { explanation: (await response.json()) as InstanceSearchExplainResponse, cost, budget };
}

async function fetchJSON<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json() as Promise<T>;
}

/** The searchable fields and limits, served from the Go registry. */
export function useSearchFields() {
  return useQuery({
    queryKey: ["instance-search", "fields"],
    queryFn: () => fetchJSON<InstanceSearchFieldsResponse>(`${BASE}/fields`),
    staleTime: Infinity,
  });
}

/** The caller's search budget, without spending from it. */
export function useSearchLimit() {
  return useQuery({
    queryKey: ["instance-search", "limit"],
    queryFn: () => fetchJSON<InstanceSearchLimitResponse>(`${BASE}/limit`),
    staleTime: 10_000,
  });
}
