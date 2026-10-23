import { useEffect, useState } from "react";
import {
  reloadAfterRouteLoadFailure,
  ROUTE_LOAD_RECOVERY_DELAY_MS,
  ROUTE_LOAD_STALLED_DELAY_MS,
} from "@/lib/routeLoadRecovery";

export function RouteLoadingFallback() {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const stalledTimeout = window.setTimeout(
      () => setStalled(true),
      ROUTE_LOAD_STALLED_DELAY_MS,
    );
    const recoveryTimeout = window.setTimeout(
      reloadAfterRouteLoadFailure,
      ROUTE_LOAD_RECOVERY_DELAY_MS,
    );

    return () => {
      window.clearTimeout(stalledTimeout);
      window.clearTimeout(recoveryTimeout);
    };
  }, []);

  return (
    <div
      className="flex min-h-[calc(100vh-8rem)] items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent"
            aria-hidden="true"
          />
          <span>Loading page...</span>
        </div>
        {stalled && (
          <div className="flex flex-col items-center gap-2">
            <span>Loading failed, refresh the page.</span>
            <button
              type="button"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
