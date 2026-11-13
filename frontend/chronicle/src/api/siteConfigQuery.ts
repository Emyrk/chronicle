import { useQuery } from "@tanstack/react-query";
import type { SiteConfig } from "./typesGenerated";

export function rootUploadsDisabledForSite(config: SiteConfig | undefined): boolean {
  return !!(config?.root_uploads_disabled && !config.tenant && !config.client_uploads_disabled);
}

export function uploadsDisabledForSite(config: SiteConfig | undefined): boolean {
  return !!(config?.client_uploads_disabled || (config?.root_uploads_disabled && !config.tenant));
}

// Lives outside queries.ts so the app shell (NitroPayRuntime) can read site config
// without pulling every query hook into the entry chunk. queries.ts re-exports it.
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
