import { useSiteConfig } from "@/api/siteConfigQuery";
import { useHydrated } from "@/hooks/useHydrated";
import { seoProductName } from "@/lib/seo";
import { createContext, useContext } from "react";
import { useLocation } from "react-router-dom";

/** Only public, stable homepage inputs. Live configuration and auth still load normally. */
export interface HomeBootstrap {
  productName: string;
  foreverLanding: boolean;
  uploadsDisabled: boolean;
  rootUploadsDisabled: boolean;
}
export const HomeBootstrapContext = createContext<HomeBootstrap | null>(null);
export function useHomeBootstrap() {
  const bootstrap = useContext(HomeBootstrapContext);
  return useLocation().pathname === "/" ? bootstrap : null;
}

/** Bootstrap owns only the hydration render; fetched configuration owns subsequent renders. */
export function useHomeConfig(): HomeBootstrap | null {
  const bootstrap = useHomeBootstrap();
  const hydrated = useHydrated();
  const { data } = useSiteConfig();
  if (data && (hydrated || !bootstrap)) {
    return {
      productName: seoProductName(data.dataset_flavor),
      foreverLanding: !!data.dataset_flavor?.includes("wow-forever") && !!data.forever_landing_enabled,
      uploadsDisabled: !!data.client_uploads_disabled,
      rootUploadsDisabled: !!data.root_uploads_disabled && !data.tenant,
    };
  }
  return bootstrap;
}
