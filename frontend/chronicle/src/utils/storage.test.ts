import { describe, expect, it } from "vitest";
import { bytesToMegabytes, formatStorageBytes, megabytesToBytes } from "./storage";

describe("formatStorageBytes", () => {
  it("formats storage quotas using decimal megabytes", () => {
    expect(formatStorageBytes(150_000_000)).toBe("150 MB");
    expect(formatStorageBytes(75_000_000)).toBe("75 MB");
  });

  it("uses decimal SI boundaries", () => {
    expect(formatStorageBytes(999)).toBe("999 B");
    expect(formatStorageBytes(1_000)).toBe("1 KB");
    expect(formatStorageBytes(999_999)).toBe("1000 KB");
    expect(formatStorageBytes(1_000_000)).toBe("1 MB");
  });

  it("keeps useful precision for non-round values", () => {
    expect(formatStorageBytes(1_234_567)).toBe("1.23 MB");
  });
});

describe("decimal megabyte conversions", () => {
  it("converts bytes to megabytes without binary rounding", () => {
    expect(bytesToMegabytes(75_000_000)).toBe(75);
    expect(bytesToMegabytes(1_500_000)).toBe(1.5);
  });

  it("converts megabytes to bytes", () => {
    expect(megabytesToBytes(75)).toBe(75_000_000);
    expect(megabytesToBytes(1.5)).toBe(1_500_000);
  });
});
