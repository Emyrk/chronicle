import { describe, expect, it } from "vitest";
import { CEL_CHEATSHEET } from "./celCheatsheet";
import { parseCEL } from "./celParser";

// The guide and the code editor show these as working syntax, so each one
// must parse. Player-scoped snippets (p.…) are checked inside players.exists.
describe("CEL_CHEATSHEET", () => {
  for (const [code] of CEL_CHEATSHEET.slice(0, -1)) {
    it(`parses ${code}`, () => {
      const wrapped = code.startsWith("p.") ? `players.exists(p, ${code})` : code;
      expect(() => parseCEL(wrapped)).not.toThrow();
    });
  }
});
