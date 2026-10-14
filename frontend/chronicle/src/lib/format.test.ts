import { describe, expect, it } from "vitest";
import { formatBytes, formatSource } from "./format";

describe("storage formatting", () => {
  it("uses decimal units for storage quotas", () => {
    expect(formatBytes(100_000_000)).toBe("100 MB");
    expect(formatBytes(150_000_000)).toBe("150 MB");
  });

  it("labels Discord membership grants", () => {
    expect(formatSource("discord-member")).toBe("Discord Member Bonus");
  });
});
