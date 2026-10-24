import { describe, expect, it } from "vitest";
import { isClearCommand, isDebugCommand } from "./useAssistantChat";

describe("isClearCommand", () => {
  it("recognizes the case-insensitive clear command only", () => {
    expect(isClearCommand("/clear")).toBe(true);
    expect(isClearCommand("  /CLEAR  ")).toBe(true);
    expect(isClearCommand("/clear please")).toBe(false);
    expect(isClearCommand("clear")).toBe(false);
  });

  it("recognizes the case-insensitive debug command only", () => {
    expect(isDebugCommand("/debug")).toBe(true);
    expect(isDebugCommand("  /DEBUG  ")).toBe(true);
    expect(isDebugCommand("/debug please")).toBe(false);
    expect(isDebugCommand("debug")).toBe(false);
  });
});
