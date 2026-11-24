import { queryOptions } from "@tanstack/react-query"
import type { SearchSuggestionsResponse } from "@/api/typesGenerated"
import { scheduleSuggestion, validSuggestionQuery } from "./suggestionScheduler"

export function suggestionQuery(q: string, open: boolean, schedule = scheduleSuggestion) {
  const enabled = open && validSuggestionQuery(q)
  return queryOptions({
    queryKey: ["searchSuggestions", q, open],
    enabled,
    queryFn: async ({ signal }): Promise<SearchSuggestionsResponse> => {
      await schedule(signal)
      signal.throwIfAborted()
      const response = await fetch(`/api/v1/search/suggestions?${new URLSearchParams({ q })}`, { signal })
      if (!response.ok) throw new Error(response.status === 429
        ? "Search is busy. Pause briefly and try again."
        : "Character and guild suggestions are unavailable.")
      return response.json()
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 15_000,
    gcTime: 30_000,
  })
}
