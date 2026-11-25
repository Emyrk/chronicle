import { StatisticsTab } from "@/pages/Leaderboards/Hub/StatisticsTab";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EncounterVariantChips, EncounterVariantMark, EncounterVariantTooltipContent } from "./EncounterVariant";
import { activeEncounterVariants, encounterVariantLabel, encounterVariantOptions, encounterVariantsEnabled, highestEncounterVariant, isEncounterVariant, isHardEncounterVariant, supportsEncounterVariant, withHighestEncounterVariants } from "./encounterVariant";

describe("encounter variant presentation", () => {
  it("only exposes proven Ulduar support", () => {
    expect(supportsEncounterVariant("Ulduar", "Hodir")).toBe(true);
    expect(supportsEncounterVariant("Ulduar", "XT-002 Deconstructor")).toBe(true);
    expect(supportsEncounterVariant("Ulduar", "Ignis the Furnace Master")).toBe(false);
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
  const selected = ["Ignis the Furnace Master", "Hodir"];
  const variants = withHighestEncounterVariants("Ulduar", selected, { Hodir: "normal" });
  expect(variants).toEqual({ Hodir: "hard" });
  expect(selected).toEqual(["Ignis the Furnace Master", "Hodir"]);
  expect(withHighestEncounterVariants("Ulduar", selected, variants, true)).toEqual({});
  expect(withHighestEncounterVariants("Ulduar", ["Ignis the Furnace Master"], { Hodir: "normal" })).toEqual({ Hodir: "normal" });
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
    expect(activeEncounterVariants("Ulduar", ["Hodir", "Ignis the Furnace Master"], retained)).toEqual(retained);
  }
  expect(activeEncounterVariants("Ulduar", ["Ignis the Furnace Master"], retained)).toBeUndefined();
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
 const selected = ["Hodir", "XT-002 Deconstructor", "Ignis the Furnace Master"];
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

vi.mock("@/components/ui/SpellIdTooltip/SpellIdTooltip", () => ({
  SpellIdTooltip: ({ spellId, name, size }: { spellId: number; name: string; size: number }) => <img src={`spell:${spellId}`} alt={name} width={size} />,
}));

it("renders only present auras through the shared spell icon component", () => {
  const html = renderToStaticMarkup(<EncounterVariantTooltipContent data={{ type: "yogg-light", auras: [62702, 62670, 62702] }} />);
  expect(html).toContain('src="spell:62702"');
  expect(html).toContain('alt="Fury of the Storm"');
  expect(html).toContain('src="spell:62670"');
  expect(html).toContain('width="24"');
  expect(html.match(/<img /g)).toHaveLength(2);
  expect(html).not.toContain("spell:62650");
  expect(html).not.toContain("spell:62671");
});

it("supports empty rich tooltips and preserves fallback for unknown formats", () => {
  expect(renderToStaticMarkup(<EncounterVariantTooltipContent data={{ type: "yogg-light", auras: [] }} />)).toContain("No keepers assisting.");
  for (const data of [{ type: "future-format", auras: [62702] }, { type: "yogg-light", auras: [999] }]) {
    const html = renderToStaticMarkup(<EncounterVariantMark variant="lights_1" tooltip="Thorim: Fury of the Storm" tooltipData={data} />);
    expect(html).toContain('title="Encounter variant: 1 Light');
    expect(html).toContain("Thorim: Fury of the Storm");
  }
  const rich = renderToStaticMarkup(<EncounterVariantMark variant="lights_1" tooltip="Thorim: Fury of the Storm" tooltipData={{ type: "yogg-light", auras: [62702] }} />);
  expect(rich).toContain('tabindex="0"');
  expect(rich).toContain('aria-label="Encounter variant: 1 Light');
});


it("exposes all three Assembly of Iron tiers with distinct labels and badges", () => {
  expect(supportsEncounterVariant("Ulduar", "Assembly of Iron")).toBe(true);
  expect(supportsEncounterVariant("Other", "Assembly of Iron")).toBe(false);
  expect(encounterVariantOptions("Assembly of Iron")).toEqual(["normal", "medium", "hard"]);
  for (const [variant, label, badge, chip] of [
    ["normal", "Normal", "N", "N"],
    ["medium", "Medium mode", "MM", "Medium"],
    ["hard", "Hard mode", "HM", "Hard"],
  ] as const) {
    expect(isEncounterVariant(variant)).toBe(true);
    expect(encounterVariantLabel(variant)).toBe(label);
    const html = renderToStaticMarkup(<EncounterVariantChips boss="Assembly of Iron" active={variant} onSelect={() => {}} />);
    expect(html.match(/<button /g)).toHaveLength(4);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain(`aria-pressed="true" aria-label="Assembly of Iron ${label}"`);
    expect(html).toContain(`>${chip}</button>`);
    const mark = renderToStaticMarkup(<EncounterVariantMark variant={variant} />);
    expect(mark).toContain(`>${badge}<`);
    expect(mark).toContain(`Encounter variant: ${label}`);
    expect(mark).toContain(variant === "normal" ? "bg-slate-500/15" : "bg-amber-500/15");
  }
});

it("keeps council tiers independent and the Hard mode shortcut above Medium mode", () => {
  const variants = { "Assembly of Iron": "medium" as const, Hodir: "normal" as const };
  expect(activeEncounterVariants("Ulduar", ["Assembly of Iron", "Hodir"], variants)).toEqual(variants);
  expect(activeEncounterVariants("Ulduar", ["Assembly of Iron"], variants)).toEqual({ "Assembly of Iron": "medium" });
  expect(activeEncounterVariants("Ulduar", ["Hodir"], { Hodir: "medium" })).toBeUndefined();
  expect(encounterVariantOptions("Hodir")).toEqual(["normal", "hard"]);
  expect(highestEncounterVariant("Ulduar", "Assembly of Iron")).toBe("hard");
  expect(isHardEncounterVariant("medium")).toBe(false);
  expect(withHighestEncounterVariants("Ulduar", ["Assembly of Iron"], variants)).toEqual({ "Assembly of Iron": "hard", Hodir: "normal" });
  expect(withHighestEncounterVariants("Ulduar", ["Hodir"], variants)).toEqual({ "Assembly of Iron": "medium", Hodir: "hard" });
  expect(withHighestEncounterVariants("Ulduar", ["Assembly of Iron"], variants, true)).toEqual({ Hodir: "normal" });
  expect(variants).toEqual({ "Assembly of Iron": "medium", Hodir: "normal" });
});

it("exposes five Leviathan tower cohorts with only four towers hard", () => {
  const options = encounterVariantOptions("Flame Leviathan");
  expect(options).toEqual(["towers_0", "towers_1", "towers_2", "towers_3", "towers_4"]);
  expect(supportsEncounterVariant("Ulduar", "Flame Leviathan")).toBe(true);
  expect(highestEncounterVariant("Ulduar", "Flame Leviathan")).toBe("towers_4");
  expect(withHighestEncounterVariants("Ulduar", ["Flame Leviathan"], { Hodir: "normal" })).toEqual({ Hodir: "normal", "Flame Leviathan": "towers_4" });
  for (const [count, variant] of options.entries()) {
    expect(isEncounterVariant(variant)).toBe(true);
    expect(encounterVariantLabel(variant)).toBe(`${count} Tower`);
    expect(isHardEncounterVariant(variant)).toBe(count === 4);
    const badge = renderToStaticMarkup(<EncounterVariantMark variant={variant} />);
    expect(badge).toContain(`${count} Tower`);
    expect(badge.includes("text-amber")).toBe(count === 4);
    const chips = renderToStaticMarkup(<EncounterVariantChips boss="Flame Leviathan" active={variant} onSelect={() => {}} />);
    expect(chips.match(/aria-pressed="true"/g)).toHaveLength(1);
  }
  expect(activeEncounterVariants("Ulduar", ["Flame Leviathan"], { "Flame Leviathan": "hard" })).toBeUndefined();
});
it("supports Mimiron normal and hard cohorts with the binary shortcut and styling", () => {
  expect(supportsEncounterVariant("Ulduar", "Mimiron")).toBe(true);
  expect(supportsEncounterVariant("Other", "Mimiron")).toBe(false);
  expect(encounterVariantOptions("Mimiron")).toEqual(["normal", "hard"]);
  expect(highestEncounterVariant("Ulduar", "Mimiron")).toBe("hard");
  expect(withHighestEncounterVariants("Ulduar", ["Mimiron"], { Hodir: "normal" })).toEqual({ Hodir: "normal", Mimiron: "hard" });
  expect(activeEncounterVariants("Ulduar", ["Mimiron"], { Mimiron: "medium" })).toBeUndefined();
  for (const variant of ["normal", "hard"] as const) {
    expect(activeEncounterVariants("Ulduar", ["Mimiron"], { Mimiron: variant })).toEqual({ Mimiron: variant });
    const chips = renderToStaticMarkup(<EncounterVariantChips boss="Mimiron" active={variant} onSelect={() => {}} />);
    expect(chips.match(/<button /g)).toHaveLength(3);
    expect(chips.match(/aria-pressed="true"/g)).toHaveLength(1);
    const badge = renderToStaticMarkup(<EncounterVariantMark variant={variant} />);
    expect(badge).toContain(variant === "normal" ? "bg-slate-500/15" : "bg-amber-500/15");
  }
});

it("supports Thorim normal and hard independently of other bosses", () => {
  expect(supportsEncounterVariant("Ulduar", "Thorim")).toBe(true);
  expect(supportsEncounterVariant("Other", "Thorim")).toBe(false);
  expect(encounterVariantOptions("Thorim")).toEqual(["normal", "hard"]);
  const variants = { Thorim: "normal" as const, Hodir: "normal" as const };
  expect(withHighestEncounterVariants("Ulduar", ["Thorim"], variants)).toEqual({ Thorim: "hard", Hodir: "normal" });
  expect(activeEncounterVariants("Ulduar", ["Thorim"], variants)).toEqual({ Thorim: "normal" });
  expect(activeEncounterVariants("Ulduar", ["Thorim"], { Thorim: "medium" })).toBeUndefined();
  for (const active of ["normal", "hard"] as const) {
    const html = renderToStaticMarkup(<EncounterVariantChips boss="Thorim" active={active} onSelect={() => {}} />);
    expect(html).toContain(`aria-pressed="true" aria-label="Thorim ${active === "hard" ? "Hard mode" : "Normal"}"`);
  }
});

it("exposes four exact Freya tree cohorts with only three trees hard", () => {
  const options = encounterVariantOptions("Freya");
  expect(options).toEqual(["trees_0", "trees_1", "trees_2", "trees_3"]);
  expect(supportsEncounterVariant("Ulduar", "Freya")).toBe(true);
  expect(supportsEncounterVariant("Other", "Freya")).toBe(false);
  expect(highestEncounterVariant("Ulduar", "Freya")).toBe("trees_3");
  expect(withHighestEncounterVariants("Ulduar", ["Freya"], { Hodir: "normal" })).toEqual({ Hodir: "normal", Freya: "trees_3" });
  for (const [count, variant] of options.entries()) {
    expect(isEncounterVariant(variant)).toBe(true);
    expect(encounterVariantLabel(variant)).toBe(`${count} Tree`);
    expect(isHardEncounterVariant(variant)).toBe(count === 3);
    expect(activeEncounterVariants("Ulduar", ["Freya", "Hodir"], { Freya: variant, Hodir: "hard" })).toEqual({ Freya: variant, Hodir: "hard" });
    const badge = renderToStaticMarkup(<EncounterVariantMark variant={variant} />);
    expect(badge).toContain(`${count} Tree`);
    expect(badge.includes("bg-amber-500/15")).toBe(count === 3);
    expect(badge.includes("bg-slate-500/15")).toBe(count !== 3);
    const chips = renderToStaticMarkup(<EncounterVariantChips boss="Freya" active={variant} onSelect={() => {}} />);
    expect(chips.match(/<button /g)).toHaveLength(5);
    expect(chips.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(chips.match(/bg-amber-500\/15/g)).toHaveLength(1);
    expect(chips.match(/bg-slate-500\/15/g)).toHaveLength(3);
  }
  for (const variant of ["normal", "hard", "towers_3", "lights_3"] as const) {
    expect(activeEncounterVariants("Ulduar", ["Freya"], { Freya: variant })).toBeUndefined();
  }
  expect(activeEncounterVariants("Ulduar", ["Hodir"], { Hodir: "trees_3" })).toBeUndefined();
  expect(isEncounterVariant("trees_4")).toBe(false);
  expect(isEncounterVariant("trees_-1")).toBe(false);
});
