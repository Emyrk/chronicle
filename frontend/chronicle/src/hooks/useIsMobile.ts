import { useCallback, useSyncExternalStore } from "react";

/**
 * Hook to detect if the viewport is mobile-sized.
 * Defaults to Tailwind's `lg` breakpoint, but pages with denser responsive
 * layouts can opt into a narrower threshold.
 */
export function useIsMobile(maxWidth = 1023): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const subscribe = useCallback((onStoreChange: () => void) => {
    const mediaQuery = window.matchMedia(query);
    mediaQuery.addEventListener("change", onStoreChange);
    return () => mediaQuery.removeEventListener("change", onStoreChange);
  }, [query]);
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
