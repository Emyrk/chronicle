import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

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
  const pagePath = location.pathname + location.search;
  const previousPagePath = useRef(pagePath);

  useEffect(() => {
    if (previousPagePath.current === pagePath) {
      return;
    }
    previousPagePath.current = pagePath;

    window.gtag?.("event", "page_view", { page_path: pagePath });
  }, [pagePath]);
}
