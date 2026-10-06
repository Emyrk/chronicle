import { describe, expect, it } from "vitest";
import { createCustomPanelRef, normalizeRepository, parseCustomPanelRef } from "./pluginTypes";
import { decodeCustomPanelToken, encodeCustomPanelToken } from "@/hooks/useUrlState";

describe("custom panel references", () => {
  it("normalizes GitHub repository inputs", () => {
    expect(normalizeRepository("https://github.com/Owner/Repo.git")).toBe("owner/repo");
    expect(normalizeRepository("not a repo")).toBeNull();
  });

  it("round trips through the reserved URL token", () => {
    const ref = createCustomPanelRef("Owner/Repo", "raid-cooldowns");
    expect(parseCustomPanelRef(ref)).toEqual({ source: "github", repository: "owner/repo", panelId: "raid-cooldowns" });
    expect(decodeCustomPanelToken(encodeCustomPanelToken(ref))).toBe(ref);
  });

  it("preserves malformed custom tokens as invalid references", () => {
    expect(decodeCustomPanelToken("xzz")).toBe("custom:invalid:zz");
  });
});
