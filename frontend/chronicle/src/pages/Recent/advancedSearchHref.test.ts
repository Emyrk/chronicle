import { describe, expect, it } from "vitest";
import { decodeQuery, treeToForm } from "@/pages/InstanceSearch/queryModel";
import { advancedSearchHref } from "./advancedSearchHref";

const formOf = (href: string) => treeToForm(decodeQuery(new URL(href, "https://x").searchParams.get("q")));

describe("advancedSearchHref", () => {
  it("opens an empty search with no filters", () => {
    expect(advancedSearchHref([], undefined)).toBe("/search");
  });
  it("carries one zone (exact) and the realm into the form", () => {
    const form = formOf(advancedSearchHref(["Molten Core"], "Nordanaar"));
    expect(form).toMatchObject({ zone: "Molten Core", zoneMatch: "exact", realm: "Nordanaar" });
  });
  it("leaves several zones out, since the form holds one", () => {
    expect(advancedSearchHref(["Molten Core", "Onyxia's Lair"], undefined)).toBe("/search");
    expect(formOf(advancedSearchHref(["Molten Core", "Onyxia's Lair"], "Nordanaar"))).toMatchObject({ zone: "", realm: "Nordanaar" });
  });
});
