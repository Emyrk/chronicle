import { describe, expect, it } from "vitest";
import { uploadV2URL } from "./uploadV2";

const options = { format: "3.3.5a-cc-addon", unlistedLog: false };
const params = (url: string) => new URL(url, "https://example.test").searchParams;

describe("upload-v2 parser engine requests", () => {
  it("keeps normal and default admin uploads on the legacy server default", () => {
    expect(params(uploadV2URL(options)).has("parser_engine")).toBe(false);
    expect(params(uploadV2URL({ ...options, hasAdminLogs: true })).has("parser_engine")).toBe(false);
    expect(params(uploadV2URL({ ...options, hasAdminLogs: true, parserEngine: "legacy" })).has("parser_engine")).toBe(false);
  });

  it("sends an explicit experimental engine only with effective admin permission", () => {
    expect(params(uploadV2URL({ ...options, hasAdminLogs: true, parserEngine: "parsernext" })).get("parser_engine")).toBe("parsernext");
    expect(params(uploadV2URL({ ...options, hasAdminLogs: false, parserEngine: "parsernext" })).has("parser_engine")).toBe(false);
    expect(params(uploadV2URL({ ...options, parserEngine: "parsernext" })).has("parser_engine")).toBe(false);
  });

  it("preserves format, flavor, and visibility alongside engine selection", () => {
    const url = uploadV2URL({ ...options, unlistedLog: true, flavorOverride: "wrath", hasAdminLogs: true, parserEngine: "parsernext" });
    expect(url.split("?")[0]).toBe("/api/v1/raidlogs/logs/upload-v2");
    expect(Object.fromEntries(params(url))).toEqual({ unlisted: "true", format: options.format, flavor: "wrath", parser_engine: "parsernext" });
  });

  it("does not retain experimental selection for a new default attempt", () => {
    uploadV2URL({ ...options, hasAdminLogs: true, parserEngine: "parsernext" });
    expect(params(uploadV2URL({ ...options, hasAdminLogs: true })).has("parser_engine")).toBe(false);
  });
});
