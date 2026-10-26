import { useQuery } from "@tanstack/react-query";
import type { LandingFeaturedResponse } from "./typesGenerated";

// useLandingFeatured loads the /start hero's featured run (null when none is set).
// Lives outside queries.ts so /start doesn't load every query hook before its first
// paint. queries.ts re-exports it.
export function useLandingFeatured() {
  return useQuery({
    queryKey: ["landing-featured"],
    queryFn: async () => {
      const response = await fetch("/api/v1/landing/featured");
      if (!response.ok) throw new Error("Failed to fetch featured run");
      return response.json() as Promise<LandingFeaturedResponse>;
    },
    staleTime: 60 * 1000,
  });
}
