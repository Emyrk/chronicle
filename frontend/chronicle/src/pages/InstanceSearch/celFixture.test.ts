import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";
import { formatCEL } from "./queryModel";

// The Go parser (internal/instancesearch/celparse_test.go) parses every
// `text` here and checks it gets `where` back, so the server reads the same
// dialect formatCEL writes. Regenerate after changing formatCEL or the
// examples:
//
//   pnpm vitest run --project unit src/pages/InstanceSearch/celFixture.test.ts -u
describe("searchExamplesCEL.json", () => {
  it("matches formatCEL for every example", async () => {
    const fixture = EXAMPLES.map((ex) => ({ id: ex.id, text: formatCEL(ex.where), where: ex.where }));
    await expect(JSON.stringify(fixture, null, 2) + "\n").toMatchFileSnapshot("./generated/searchExamplesCEL.json");
  });
});
