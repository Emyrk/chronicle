import { useRef } from "react";
import { useSyncModeContextOptional } from "@/pages/Instance/SyncModeContext";

/**
 * Hook to cache a value once it becomes valid.
 * Cache is invalidated when dependencies change.
 * 
 * When sync mode is enabled, caching is bypassed to allow live updates.
 * 
 * @param value - The current value to potentially cache
 * @param isValid - Function to determine if the value should be cached
 * @param deps - Optional dependencies that invalidate the cache when changed
 * @returns Object with cachedValue (stable reference) and hasCache flag
 * 
 * @example
 * ```tsx
 * // Cache result once it has data, invalidate when sourceType changes
 * const { cachedValue, hasCache } = useCachedValue(
 *   result,
 *   (r) => r.data.size > 0,
 *   [sourceType]
 * );
 * 
 * // Use cachedValue - won't change after first valid value (until deps change)
 * const computed = useMemo(() => process(cachedValue), [cachedValue]);
 * ```
 */
export function useCachedValue<T>(
  value: T,
  isValid: (value: T) => boolean,
  deps: unknown[] = []
): { cachedValue: T; hasCache: boolean } {
  const syncMode = useSyncModeContextOptional();
  const isSyncEnabled = syncMode?.enabled ?? false;
  const cacheRef = useRef<{ value: T; deps: unknown[] } | null>(null);
  // Track the stale value when deps/mode change - we shouldn't cache this
  const staleValueRef = useRef<T | null>(null);
  // Track sync mode to detect transitions (updated synchronously during render)
  const wasSyncEnabledRef = useRef(isSyncEnabled);
  
  // This hook intentionally reads/writes refs during render for memoization.
  // This is a valid pattern for caching: https://react.dev/reference/react/useRef#caveats
  /* eslint-disable react-hooks/refs */
  
  // Detect sync mode transitions
  const justEnteredSyncMode = isSyncEnabled && !wasSyncEnabledRef.current;
  const justLeftSyncMode = !isSyncEnabled && wasSyncEnabledRef.current;
  wasSyncEnabledRef.current = isSyncEnabled;
  
  // When entering sync mode, clear the cache
  if (justEnteredSyncMode) {
    cacheRef.current = null;
    staleValueRef.current = null;
  }
  
  // When leaving sync mode, mark current value as stale (it's sync mode data)
  // This prevents caching the old sync result while waiting for worker
  if (justLeftSyncMode) {
    staleValueRef.current = value;
    cacheRef.current = null;
  }
  
  // In sync mode, bypass caching entirely to show live data
  if (isSyncEnabled) {
    return { cachedValue: value, hasCache: isValid(value) };
  }
  
  // Check if deps match the cached deps
  const cached = cacheRef.current;
  const depsMatch = cached !== null &&
    deps.length === cached.deps.length &&
    deps.every((dep, i) => dep === cached.deps[i]);
  
  // Invalidate cache if deps changed
  if (!depsMatch && cacheRef.current !== null) {
    // Mark the current value as stale - it's from the old deps
    staleValueRef.current = value;
    cacheRef.current = null;
  }
  
  // Try to cache if we don't have one and value is valid
  // But NOT if value is the same stale value from before deps/mode changed
  if (cacheRef.current === null && isValid(value) && value !== staleValueRef.current) {
    cacheRef.current = { value, deps };
    staleValueRef.current = null;
  }
  
  // Return cached value if available, otherwise current value
  if (cacheRef.current !== null) {
    return { cachedValue: cacheRef.current.value, hasCache: true };
  }
  
  /* eslint-enable react-hooks/refs */
  
  return { cachedValue: value, hasCache: false };
}
