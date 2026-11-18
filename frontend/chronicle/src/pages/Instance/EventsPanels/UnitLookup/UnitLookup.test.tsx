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
            boss: { name: "Boss", entry: 123, category: "ordinary" },
            guardian: { name: "Guardian", entry: 125, category: "guardian" },
            scripted: { name: "Scripted object", entry: 126, category: "scripted_object" },
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
    expect(markup).toContain(">ordinary</td>");
    expect(markup).toContain(">guardian</td>");
    expect(markup).toContain(">scripted object</td>");
    expect(markup).toContain(">unknown</td>");
    expect(markup).toContain(">Hostile</td>");
  });
});
