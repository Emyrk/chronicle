import { describe, expect, it } from "vitest";
import {
  claimRouteLoadRecovery,
  ROUTE_LOAD_RECOVERY_COOLDOWN_MS,
  routeLoadRecoveryID,
} from "./routeLoadRecovery";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("route load recovery", () => {
  it("identifies the complete route", () => {
    expect(
      routeLoadRecoveryID({
        pathname: "/instances/example",
        search: "?panel=damage",
        hash: "#player",
      }),
    ).toBe("/instances/example?panel=damage#player");
  });

  it("claims one reload per route during the cooldown", () => {
    const storage = memoryStorage();
    const now = 1_000;

    expect(claimRouteLoadRecovery(storage, "/instances/example", now)).toBe(true);
    expect(claimRouteLoadRecovery(storage, "/instances/example", now + 1)).toBe(false);
    expect(claimRouteLoadRecovery(storage, "/logs", now + 1)).toBe(true);
  });

  it("allows another reload after the cooldown", () => {
    const storage = memoryStorage();
    const route = "/instances/example";

    expect(claimRouteLoadRecovery(storage, route, 1_000)).toBe(true);
    expect(
      claimRouteLoadRecovery(
        storage,
        route,
        1_000 + ROUTE_LOAD_RECOVERY_COOLDOWN_MS,
      ),
    ).toBe(true);
  });

  it("does not reload when recovery storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => undefined,
    };

    expect(claimRouteLoadRecovery(storage, "/instances/example", 1_000)).toBe(false);
  });
});
