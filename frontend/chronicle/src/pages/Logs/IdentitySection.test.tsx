import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IdentitySection } from "./IdentitySection";

describe("identity category report", () => {
  it("shows unknown units, samples, categories and spell diagnostics", () => {
    const html = renderToStaticMarkup(<IdentitySection identity={{
      instances: [{ name: "Raid", zone: "Zone", units: [
        { category: "unknown", entry_id: 42, name: "", unique_count: 4, samples: ["0xF13000002A000001"] },
        { category: "guardian", entry_id: 43, name: "Helper", unique_count: 1, samples: [] },
      ] }],
      zone_spells: { Zone: [{ spell_id: 123, count: 2 }] },
      unit_spells: { 43: ["Fireball"] },
    }} />);
    for (const text of ["4 unknown", "Category filter", "scripted_object", "totem", "guardian", "0xF13000002A000001", "Instance 1", "Spell 123", "Fireball"]) expect(html).toContain(text);
    expect(html).not.toContain("Generated Go Code");
  });
  it("renders legacy reports without claiming their units are unknown or showing unsafe code", () => {
    const legacy = { zoned_units: { Old: [{ entry_id: 1, name: "Old creature", unique_count: 2 }] }, go_code: "LoadAdds(unsafe)" };
    const html = renderToStaticMarkup(<IdentitySection identity={legacy} />);
    expect(html).toContain("unclassified, not necessarily unknown");
    expect(html).toContain("Old creature");
    expect(html).not.toContain("LoadAdds");
  });
});
