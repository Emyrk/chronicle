import { StatisticsTab } from "@/pages/Leaderboards/Hub/StatisticsTab";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EncounterVariantChips, EncounterVariantMark } from "./EncounterVariant";
import { activeEncounterVariants, encounterVariantsEnabled, supportsEncounterVariant, withHighestEncounterVariants } from "./encounterVariant";

describe("encounter variant presentation", () => {
  it("only exposes proven Ulduar support", () => {
    expect(supportsEncounterVariant("Ulduar", "Hodir")).toBe(true);
    expect(supportsEncounterVariant("Ulduar", "XT-002 Deconstructor")).toBe(true);
    expect(supportsEncounterVariant("Ulduar", "Freya")).toBe(false);
    expect(supportsEncounterVariant("Other", "Hodir")).toBe(false);
  });
  it("leaves historical or unknown reports unclassified", () => {
    expect(renderToStaticMarkup(<EncounterVariantMark />)).toBe("");
    expect(renderToStaticMarkup(<EncounterVariantMark variant="unknown" />)).toBe("");
    expect(renderToStaticMarkup(<EncounterVariantMark variant="hard" />)).toContain(">HM<");
    expect(renderToStaticMarkup(<EncounterVariantMark variant="normal" />)).toContain(">N<");
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

it("retains inactive choices across unsupported tabs without enabling filters", () => {
  const retained = { Hodir: "hard" as const };
  for (const tab of ["overview", "speedruns", "parsing", "rulesets"]) {
    expect(encounterVariantsEnabled(tab, "peak")).toBe(false);
    const html = renderToStaticMarkup(<EncounterVariantChips boss="Hodir" active={retained.Hodir} disabledReason="This view uses Combined" onSelect={() => { throw new Error("Disabled"); }} />);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).toContain('title="This view uses Combined"');
    expect(html).toContain('disabled:grayscale');
    expect(html).toContain('Combined only in this view. Your choices are retained.');
  }
  expect(encounterVariantsEnabled("ratings", "overview")).toBe(false);
  for (const tab of ["ratings", "performances", "statistics"]) {
    expect(encounterVariantsEnabled(tab, "peak")).toBe(true);
    expect(activeEncounterVariants("Ulduar", ["Hodir", "Freya"], retained)).toEqual(retained);
  }
  expect(activeEncounterVariants("Ulduar", ["Freya"], retained)).toBeUndefined();
  expect(activeEncounterVariants("Other", ["Hodir"], retained)).toBeUndefined();
  expect(retained).toEqual({ Hodir: "hard" });
});

it("hides exact success rates and attempt counts even if cached data exists", () => {
  const html = renderToStaticMarkup(<StatisticsTab instanceName="Ulduar" bosses={["Hodir"]} optional={new Set()} selection={{ kind: "bosses", bosses: ["Hodir"] }} view="success" onView={() => {}} scope={{}} role="dps" onScope={() => {}} live={{ successUnavailable: "Success rates require variant classification for unsuccessful attempts.", successRates: { status: "ready", data: [] } }} />);
  expect(html).toContain("require variant classification for unsuccessful attempts");
  expect(html).not.toContain("100%");
  expect(html).not.toContain("Attempts");
});

it("keeps XT and Hodir independent through the hard-mode shortcut", () => {
 const selected = ["Hodir", "XT-002 Deconstructor", "Freya"];
 const variants = { Hodir: "normal" as const, "XT-002 Deconstructor": "hard" as const };
 expect(activeEncounterVariants("Ulduar", selected, variants)).toEqual(variants);
 expect(withHighestEncounterVariants("Ulduar", selected, variants)).toEqual({ Hodir: "hard", "XT-002 Deconstructor": "hard" });
 expect(withHighestEncounterVariants("Ulduar", ["XT-002 Deconstructor"], variants, true)).toEqual({ Hodir: "normal" });
});


it("supports Vezax variants independently of other bosses", () => {
  expect(supportsEncounterVariant("Ulduar", "General Vezax")).toBe(true);
  expect(supportsEncounterVariant("Other", "General Vezax")).toBe(false);
  const variants = { Hodir: "normal" as const, "General Vezax": "normal" as const };
  expect(withHighestEncounterVariants("Ulduar", ["General Vezax"], variants)).toEqual({ Hodir: "normal", "General Vezax": "hard" });
  for (const active of ["normal", "hard"] as const) {
    const html = renderToStaticMarkup(<EncounterVariantChips boss="General Vezax" active={active} onSelect={() => {}} />);
    expect(html).toContain(`aria-pressed="true" aria-label="General Vezax ${active === "hard" ? "Hard mode" : "Normal"}"`);
  }
});

it("keeps Yogg light-count cohorts exact and keeper details display-only", () => {
  const variants = ["lights_0", "lights_1", "lights_2", "lights_3", "lights_4"] as const;
  for (const [count, variant] of variants.entries()) {
    const html = renderToStaticMarkup(<EncounterVariantChips boss="Yogg-Saron" active={variant} onSelect={() => {}} />);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain(`aria-label="Yogg-Saron ${count} Light"`);
    expect(html).not.toContain('aria-label="Yogg-Saron Normal"');
    const badge = renderToStaticMarkup(<EncounterVariantMark variant={variant} tooltip="Thorim: Fury of the Storm" />);
    expect(badge).toContain(`>${count} Light<`);
    expect(badge).toContain("Thorim: Fury of the Storm");
  }
  expect(withHighestEncounterVariants("Ulduar", ["Yogg-Saron", "Hodir"], { "Yogg-Saron": "lights_1" })).toEqual({ "Yogg-Saron": "lights_0", Hodir: "hard" });
  expect(activeEncounterVariants("Ulduar", ["Yogg-Saron"], { "Yogg-Saron": "hard" })).toBeUndefined();
  expect(activeEncounterVariants("Ulduar", ["Hodir"], { Hodir: "lights_0" })).toBeUndefined();
  const disabled = renderToStaticMarkup(<EncounterVariantChips boss="Yogg-Saron" active="lights_1" disabledReason="Combined only" onSelect={() => {}} />);
  expect(disabled.match(/disabled=""/g)).toHaveLength(6);
});
