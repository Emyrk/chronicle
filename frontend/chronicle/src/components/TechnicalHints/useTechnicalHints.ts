import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSiteConfig } from "@/api/queries";
import { blogPostMatchesFlavor, findBlogPost } from "@/blog/blogRegistry";
import {
  filterUnexpiredTechnicalHints,
  isTechnicalHintsResponse,
  readCachedTechnicalHints,
  writeCachedTechnicalHints,
} from "./technicalHintsCache";
import { mergeTechnicalHints } from "./staticTechnicalHints";
import type { TechnicalHintsResponse } from "./types";

const TECHNICAL_HINTS_STALE_TIME_MS = 15 * 60 * 1000;

async function fetchTechnicalHints(): Promise<TechnicalHintsResponse> {
  const response = await fetch("/api/v1/technical-hints");
  if (!response.ok) throw new Error("Failed to fetch Chronicle tips");

  const value: unknown = await response.json();
  if (!isTechnicalHintsResponse(value)) {
    throw new Error("Chronicle tips response was invalid");
  }

  const fresh = filterUnexpiredTechnicalHints(mergeTechnicalHints(value));
  writeCachedTechnicalHints(fresh);
  return fresh;
}

export function useTechnicalHints() {
  const cached = useMemo(() => mergeTechnicalHints(readCachedTechnicalHints()), []);
  const { data: siteConfig } = useSiteConfig();
  const query = useQuery({
    queryKey: ["technical-hints"],
    queryFn: fetchTechnicalHints,
    initialData: cached,
    initialDataUpdatedAt: 0,
    staleTime: TECHNICAL_HINTS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });
  const data = useMemo(() => {
    if (!query.data) return undefined;
    const flavor = siteConfig?.dataset_flavor ?? [];
    return {
      ...query.data,
      payloads: query.data.payloads.filter((hint) => {
        if (hint.kind !== "blog" || !hint.blog_id) return true;
        const post = findBlogPost(hint.blog_id);
        return Boolean(post && blogPostMatchesFlavor(post, flavor));
      }),
    };
  }, [query.data, siteConfig?.dataset_flavor]);

  return { ...query, data };
}
