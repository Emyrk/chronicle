import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import QuickStats from "./QuickStats";
import { classEntity, entityKey, specEntity } from "./entity";

const common = {
  raid: null,
  picked: null,
  onPick: vi.fn(),
  rangeDays: 180,
};

describe("class and spec quick stats", () => {
  it("renders a comparison box for class snapshots", () => {
    const entities = [
      classEntity("MAGE", "Mage", [
        { label: "Specs", value: "3" },
        { label: "Runs", value: "1,240" },
      ]),
      classEntity("ROGUE", "Rogue", [
        { label: "Specs", value: "2" },
        { label: "Runs", value: "980" },
      ]),
    ];
    const html = renderToStaticMarkup(
      <QuickStats {...common} kind="class" entities={entities} hidden={new Set()} />,
    );

    expect(html).toContain("Comparing 2 classes");
    expect(html).toContain("Mage statistics");
    expect(html).toContain("Rogue statistics");
    expect(html).toContain("1,240");
    expect(html).toContain("Snapshot from where each was added");
  });

  it("renders spec snapshots and respects hidden pins", () => {
    const fire = specEntity("MAGE", "Mage", "Fire", undefined, [
      { label: "Typical", value: "1,234/s" },
      { label: "Runs", value: "42" },
    ]);
    const frost = specEntity("MAGE", "Mage", "Frost", undefined, [{ label: "Typical", value: "987/s" }]);
    const html = renderToStaticMarkup(
      <QuickStats {...common} kind="spec" entities={[fire, frost]} hidden={new Set([entityKey(frost)])} />,
    );

    expect(html).toContain("Comparing 1 spec");
    expect(html).toContain("Fire Mage statistics");
    expect(html).toContain("1,234/s");
    expect(html).not.toContain("Frost Mage statistics");
  });
});
