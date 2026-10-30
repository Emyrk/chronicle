import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccountPurgeToken, saveAccountPurgeToken } from "./accountPurgeToken";

describe("account purge status capability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the token in session storage, scoped to its purge ID", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    } });
    saveAccountPurgeToken("purge-1", "secret");
    expect(getAccountPurgeToken("purge-1")).toBe("secret");
    expect(getAccountPurgeToken("purge-2")).toBeNull();
    expect(values.get("account-purge-token:purge-1")).toBe("secret");
  });
});
