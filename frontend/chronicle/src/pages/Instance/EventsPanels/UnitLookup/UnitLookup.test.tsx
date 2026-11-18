import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PanelRenderProps } from "../types";
import { createUnitLookupPanel } from "./UnitLookup";
import type { UnitLookupResult } from "./unitLookup.processor";

describe("Unit Lookup categories", () => {
  it("preserves static category when temporal classification overrides a unit", () => {
    const props = {
      context: {
        instance: {
          units: {
            boss: { name: "Boss", entry: 123, category: "boss" },
            legacy: { name: "Legacy", entry: 124 },
          },
          players: {},
        },
      },
      result: {
        classifications: new Map([["boss", {
          guid: "boss", name: "Boss", entry: 123, owner: null,
          controller: null, controllerSpellId: 0, unitType: 2, affiliation: 2,
        }]]),
        version: 1,
      },
    } as unknown as PanelRenderProps<UnitLookupResult>;
    const markup = renderToStaticMarkup(createUnitLookupPanel().render(props));
    expect(markup).toContain(">Category</th>");
    expect(markup).toContain(">boss</td>");
    expect(markup).toContain(">unknown</td>");
    expect(markup).toContain(">Hostile</td>");
  });
});
