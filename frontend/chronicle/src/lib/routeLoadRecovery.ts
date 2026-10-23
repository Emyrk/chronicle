export const ROUTE_LOAD_STALLED_DELAY_MS = 20_000;
export const ROUTE_LOAD_RECOVERY_DELAY_MS = 40_000;
export const ROUTE_LOAD_RECOVERY_COOLDOWN_MS = 60_000;

const ROUTE_LOAD_RECOVERY_KEY = "chronicle:route-load-recovery";

type RecoveryStorage = Pick<Storage, "getItem" | "setItem">;
type RecoveryLocation = Pick<Location, "pathname" | "search" | "hash">;

interface RecoveryAttempt {
  route: string;
  timestamp: number;
}

export function routeLoadRecoveryID(location: RecoveryLocation): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function claimRouteLoadRecovery(
  storage: RecoveryStorage,
  route: string,
  now = Date.now(),
): boolean {
  try {
    const previousValue = storage.getItem(ROUTE_LOAD_RECOVERY_KEY);
    if (previousValue) {
      const previous = JSON.parse(previousValue) as RecoveryAttempt;
      if (
        previous.route === route &&
        Number.isFinite(previous.timestamp) &&
        now - previous.timestamp < ROUTE_LOAD_RECOVERY_COOLDOWN_MS
      ) {
        return false;
      }
    }

    storage.setItem(
      ROUTE_LOAD_RECOVERY_KEY,
      JSON.stringify({ route, timestamp: now } satisfies RecoveryAttempt),
    );
    return true;
  } catch {
    return false;
  }
}

export function reloadAfterRouteLoadFailure(): boolean {
  let storage: Storage;
  try {
    storage = window.sessionStorage;
  } catch {
    return false;
  }

  const route = routeLoadRecoveryID(window.location);
  if (!claimRouteLoadRecovery(storage, route)) {
    return false;
  }

  window.location.reload();
  return true;
}
