import { describe, expect, it } from "vitest";
import { formatBytes, formatSource } from "./format";

describe("storage formatting", () => {
  it("uses decimal units with consistent spacing", () => {
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1_000)).toBe("1 KB");
    expect(formatBytes(100_000_000)).toBe("100 MB");
    expect(formatBytes(2_100_000_000)).toBe("2.1 GB");
  });

  it("labels Discord membership grants", () => {
    expect(formatSource("discord-member")).toBe("Discord Member Bonus");
  });
});
