import { describe, expect, it } from "vitest";
import { reparseLogURL } from "./reparseLog";

const origin = "https://chronicle.example";

describe("reparse engine selection", () => {
  it.each([false, true])("keeps explicit engine choice separate from verbose=%s", (withDebug) => {
    for (const parserEngine of ["legacy", "parsernext"] as const) {
      const url = new URL(reparseLogURL({ logId: "log", withDebug, parserEngine }, origin));
      expect(url.pathname).toBe("/api/v1/raidlogs/logs/log/reparse");
      expect(url.searchParams.get("parser_engine")).toBe(parserEngine);
      expect(url.searchParams.has("verbose")).toBe(withDebug);
      expect(url.searchParams.has("identity_mode")).toBe(false);
    }
  });

  it("does not auto-select parsernext for verbose or normal default requests", () => {
    for (const withDebug of [false, true]) {
      expect(new URL(reparseLogURL({ logId: "log", withDebug }, origin)).searchParams.has("parser_engine")).toBe(false);
    }
  });

  it("preserves profile and format/flavor overrides", () => {
    const params = new URL(reparseLogURL({ logId: "log", parserEngine: "legacy", profile: true, format: "3.3.5a", flavor: "wrath" }, origin)).searchParams;
    expect(Object.fromEntries(params)).toEqual({ parser_engine: "legacy", profile: "true", format: "3.3.5a", flavor: "wrath" });
  });
});
