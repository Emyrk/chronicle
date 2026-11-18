import { expect, it, vi } from "vitest";
import { copyPossibleHostilesCode } from "./possibleHostilesExport";

it("copies the exact generated scaffold and reports success", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const code = "func RaidHostiles() map[uint32]Identity {\n}\n";
  expect(await copyPossibleHostilesCode(code, { writeText })).toBe("Copied!");
  expect(writeText).toHaveBeenCalledExactlyOnceWith(code);
});

it("handles clipboard failure", async () => {
  const writeText = vi.fn().mockRejectedValue(new Error("denied"));
  expect(await copyPossibleHostilesCode("code", { writeText })).toContain("Copy failed");
});
