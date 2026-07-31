import { describe, expect, it } from "vitest";
import { formatInstancePopulation, parseInstanceURL } from "./populationSelectionState";

describe("parseInstanceURL", () => {
  it("extracts an instance identifier from absolute and relative Chronicle paths", () => {
    expect(parseInstanceURL("https://example.test/instances/raid-123?view=overview")).toBe("raid-123");
    expect(parseInstanceURL("/instances/slug-value")).toBe("slug-value");
  });

  it("rejects the population comparison route and unrelated URLs", () => {
    expect(parseInstanceURL("/instances/compare")).toBeNull();
    expect(parseInstanceURL("/rankings?instance=Molten+Core")).toBeNull();
  });
});

describe("formatInstancePopulation", () => {
  it("labels unresolved selected raids without fetching the full instance", () => {
    expect(formatInstancePopulation("raid-123")).toBe("Raid raid-123");
  });
});
