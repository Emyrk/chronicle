import { describe, expect, it } from "vitest";
import { instanceNavigationWarning } from "./instanceNavigationGuard";

describe("instanceNavigationWarning", () => {
  it("warns whenever layout edit mode is open, even before the draft changes", () => {
    expect(instanceNavigationWarning({
      layoutEditing: true,
      hasUnsavedLayoutEdits: false,
      liveSessionStatus: "idle",
    })).toBe("Leave this page? Your layout edit will be lost.");
  });

  it("warns after edited layout changes are applied in memory", () => {
    expect(instanceNavigationWarning({
      layoutEditing: false,
      hasUnsavedLayoutEdits: true,
      liveSessionStatus: "idle",
    })).toBe("Leave this page? Your layout edit will be lost.");
  });

  it.each(["connecting", "live"] as const)("warns for a %s live session", (liveSessionStatus) => {
    expect(instanceNavigationWarning({
      layoutEditing: false,
      hasUnsavedLayoutEdits: false,
      liveSessionStatus,
    })).toBe("Leave this page and the live session?");
  });

  it("describes both risks when editing during a live session", () => {
    expect(instanceNavigationWarning({
      layoutEditing: true,
      hasUnsavedLayoutEdits: true,
      liveSessionStatus: "live",
    })).toBe("Leave this page? Your layout edit will be lost, and you will leave the live session.");
  });

  it.each(["idle", "needs_password", "ended", "error"] as const)("does not warn for inactive state %s", (liveSessionStatus) => {
    expect(instanceNavigationWarning({
      layoutEditing: false,
      hasUnsavedLayoutEdits: false,
      liveSessionStatus,
    })).toBeNull();
  });
});
