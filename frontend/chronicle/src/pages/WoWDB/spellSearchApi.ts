import { useQuery } from "@tanstack/react-query";
import type {
  SpellSearchCursor,
  SpellSearchLimitResponse,
  SpellSearchResponse,
} from "@/api/typesGenerated";
import { readBudget, SearchError, type SearchBudget } from "@/pages/InstanceSearch/searchApi";
import type { SpellSearchDraft } from "./spellSearchModel";

export type { SpellSearchCursor, SpellSearchLimitResponse, SpellSearchResult } from "@/api/typesGenerated";

const BASE = "/api/v1/wowdb/spells/search";

export interface SpellSearchPageResult {
  page: SpellSearchResponse;
  cost: number | null;
  runtimeCost: number | null;
  budget: SearchBudget | null;
}

function numberHeader(value: string | null): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function runSpellSearch(query: SpellSearchDraft, cursor?: SpellSearchCursor): Promise<SpellSearchPageResult> {
  const response = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...query, limit: 25, ...(cursor ? { cursor } : {}) }),
  });
  const cost = numberHeader(response.headers.get("Chronicle-Search-Cost"));
  const runtimeCost = numberHeader(response.headers.get("Chronicle-Search-Runtime-Cost"));
  const budget = readBudget(response.headers);
  if (!response.ok) throw await spellSearchError(response, cost, runtimeCost, budget);
  return { page: await response.json() as SpellSearchResponse, cost, runtimeCost, budget };
}

async function spellSearchError(response: Response, cost: number | null, runtimeCost: number | null, budget: SearchBudget | null): Promise<SearchError> {
  let body: { message?: string; detail?: string; call_to_action?: string; link?: string; link_text?: string } = {};
  try {
    body = await response.json();
  } catch {
    // Keep the status text fallback for non-JSON proxy errors.
  }
  return new SearchError(
    body.message ?? (response.statusText || "Spell search failed."),
    response.status,
    body.detail,
    body.call_to_action,
    body.link,
    body.link_text,
    cost,
    runtimeCost,
    budget,
    numberHeader(response.headers.get("Retry-After")),
  );
}

export const SPELL_SEARCH_LIMIT_REFETCH_MS = 5_000;

export function spellSearchLimitRefetchInterval(data: SpellSearchLimitResponse | undefined): number | false {
  return data && data.remaining < data.limit ? SPELL_SEARCH_LIMIT_REFETCH_MS : false;
}

async function fetchLimit(): Promise<SpellSearchLimitResponse> {
  const response = await fetch(`${BASE}/limit`);
  if (!response.ok) throw new Error("Failed to load spell search budget");
  return response.json() as Promise<SpellSearchLimitResponse>;
}

export function useSpellSearchLimit(enabled: boolean) {
  return useQuery({
    queryKey: ["spell-search", "limit"],
    queryFn: fetchLimit,
    enabled,
    refetchInterval: (query) => spellSearchLimitRefetchInterval(query.state.data),
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: SPELL_SEARCH_LIMIT_REFETCH_MS,
  });
}
