import { describe, expect, it } from "vitest";
import { filterOptions, toOptions } from "./comboOptions";

const zones = toOptions([
  "Molten Core",
  { value: "Blackwing Lair", hint: "8 bosses" },
  { value: "Naxxramas", label: "Naxxramas (40)" },
]);
const values = (os: { value: string }[]) => os.map((o) => o.value);

describe("filterOptions", () => {
  it("shows everything for empty text", () => {
    expect(values(filterOptions(zones, ""))).toEqual(["Molten Core", "Blackwing Lair", "Naxxramas"]);
  });
  it("matches label, value and hint case-insensitively", () => {
    expect(values(filterOptions(zones, "MOLT"))).toEqual(["Molten Core"]);
    expect(values(filterOptions(zones, "(40)"))).toEqual(["Naxxramas"]);
    expect(values(filterOptions(zones, "8 boss"))).toEqual(["Blackwing Lair"]);
  });
  it("shows the whole list when the text names an option, so it can be changed", () => {
    expect(values(filterOptions(zones, "molten core"))).toHaveLength(3);
  });
  it("leaves out excluded values", () => {
    expect(values(filterOptions(zones, "", ["molten core"]))).toEqual(["Blackwing Lair", "Naxxramas"]);
  });
});
