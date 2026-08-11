import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AbilityTable, type AbilityData } from "./AbilityBreakout";

const ability: AbilityData = {
  name: "Healing Touch",
  value: 1_000,
  overheal: 250,
  Total: 1_000,
  Count: 1,
  Hits: 1,
  Crits: 0,
  Misses: 0,
};

function renderTable(valueBeforeStacked: boolean): string {
  return renderToStaticMarkup(
    <AbilityTable
      abilities={[ability]}
      totalValue={ability.value}
      valueLabel="Effective"
      showHits={false}
      showOverheal
      valueBeforeStacked={valueBeforeStacked}
    />,
  );
}

function expectColumnOrder(markup: string, primaryFirst: boolean): void {
  const sections = [
    { name: "thead", primary: "Effective", stacked: "Overheal" },
    { name: "tbody", primary: "1,000", stacked: "250" },
    { name: "tfoot", primary: "1,000", stacked: "250" },
  ];

  for (const { name, primary, stacked } of sections) {
    const section = markup.match(new RegExp(`<${name}[\\s\\S]*?</${name}>`))?.[0] ?? "";
    const first = primaryFirst ? primary : stacked;
    const second = primaryFirst ? stacked : primary;
    expect(section.indexOf(first)).toBeGreaterThan(-1);
    expect(section.indexOf(first)).toBeLessThan(section.indexOf(second));
  }
}

describe("AbilityTable stacked column order", () => {
  it("places the primary value before the stacked value when requested", () => {
    expectColumnOrder(renderTable(true), true);
  });

  it("keeps the original stacked-first order by default", () => {
    expectColumnOrder(renderTable(false), false);
  });
});
