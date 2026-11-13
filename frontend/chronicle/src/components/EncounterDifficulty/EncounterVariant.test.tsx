import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EncounterVariantChips, EncounterVariantMark } from "./EncounterVariant";
import { supportsEncounterVariant, withHighestEncounterVariants } from "./encounterVariant";

describe("encounter variant presentation", () => {
  it("only exposes proven Hodir support", () => {
    expect(supportsEncounterVariant("Ulduar", "Hodir")).toBe(true);
    expect(supportsEncounterVariant("Ulduar", "Freya")).toBe(false);
    expect(supportsEncounterVariant("Other", "Hodir")).toBe(false);
  });
  it("leaves historical or unknown reports unclassified", () => {
    expect(renderToStaticMarkup(<EncounterVariantMark />)).toBe("");
    expect(renderToStaticMarkup(<EncounterVariantMark variant="unknown" />)).toBe("");
    expect(renderToStaticMarkup(<EncounterVariantMark variant="hard" />)).toContain(">HM<");
    expect(renderToStaticMarkup(<EncounterVariantMark variant="normal" />)).toContain("Normal");
  });
  it("defaults to Combined and selects only one cohort", () => {
    for (const active of [undefined, "normal", "hard"] as const) {
      const html = renderToStaticMarkup(<EncounterVariantChips boss="Hodir" active={active} onSelect={() => {}} />);
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
      expect(html).toContain("including unclassified history");
      expect(html).toContain('aria-label="Hodir Combined"');
    }
  });
});

it("hard-mode shortcut applies the highest supported tier without collapsing mixed selection", () => {
  const selected = ["Freya", "Hodir"];
  const variants = withHighestEncounterVariants("Ulduar", selected, { Hodir: "normal" });
  expect(variants).toEqual({ Hodir: "hard" });
  expect(selected).toEqual(["Freya", "Hodir"]);
  expect(withHighestEncounterVariants("Ulduar", selected, variants, true)).toEqual({});
  expect(withHighestEncounterVariants("Ulduar", ["Freya"], { Hodir: "normal" })).toEqual({ Hodir: "normal" });
});
