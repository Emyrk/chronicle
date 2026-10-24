import { describe, expect, it } from "vitest";
import { shouldCreateInstanceThread } from "./instanceThread";

describe("shouldCreateInstanceThread", () => {
  it("opens an instance thread once when the chat is ready", () => {
    expect(shouldCreateInstanceThread({
      open: true,
      allowed: true,
      ready: true,
      hasData: false,
      pending: false,
      error: false,
    })).toBe(true);
  });

  it("does not retry after the thread request fails", () => {
    expect(shouldCreateInstanceThread({
      open: true,
      allowed: true,
      ready: true,
      hasData: false,
      pending: false,
      error: true,
    })).toBe(false);
  });
});
