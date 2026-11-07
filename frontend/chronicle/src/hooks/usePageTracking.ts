import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { stripAIKeyFromSearch } from "@/features/aiKey/aiLinks";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Tracks page views in Google Analytics when the route changes.
 * Uses the gtag.js script loaded in index.html.
 */
export function usePageTracking() {
  const location = useLocation();
  // index.html strips ai_key on load; this also keeps it out of in-app navigations.
  const pagePath = location.pathname + stripAIKeyFromSearch(location.search);
  const previousPagePath = useRef(pagePath);

  useEffect(() => {
    if (previousPagePath.current === pagePath) {
      return;
    }
    previousPagePath.current = pagePath;

    window.gtag?.("event", "page_view", { page_path: pagePath });
  }, [pagePath]);
}
