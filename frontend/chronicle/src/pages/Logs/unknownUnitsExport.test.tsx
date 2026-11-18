import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { IdentityInstance } from "@/api/typesGenerated";
import { CopyUnknownsButton } from "./CopyUnknownsButton";
import { copyUnknownUnits, formatUnknownUnits } from "./unknownUnitsExport";

const instance: IdentityInstance = {
  name: "Zul'Gurub", zone: "Stranglethorn Vale", units: [
    { category: "unknown", name: "Mystery", entry_id: 42, unique_count: 6, samples: ["z", "a"] },
    { category: "object", name: "Known portal", entry_id: 176296, unique_count: 1, samples: ["known"] },
    { category: "unknown", name: "", entry_id: 0, unique_count: 2, samples: ["malformed"] },
  ],
};

it("formats only unknowns with instance context, stable entry/sample order and no mutation", () => {
  const before = structuredClone(instance);
  const text = formatUnknownUnits(instance, 2);
  expect(text).toBe([
    "Chronicle unknown unit identities",
    "Instance 2: Zul'Gurub",
    "Zone: Stranglethorn Vale",
    "Counts are distinct GUIDs within this instance, not event counts. Samples may be incomplete.",
    "Category: unknown | Name: Unnamed | Entry: 0 | Distinct GUIDs: 2",
    "Sample GUIDs: malformed",
    "Category: unknown | Name: Mystery | Entry: 42 | Distinct GUIDs: 6",
    "Sample GUIDs: a, z",
  ].join("\n"));
  expect(instance).toEqual(before);
  expect(formatUnknownUnits({ ...instance, units: [...instance.units].reverse() }, 2)).toBe(text);
});

it("handles absent samples without guessing identities", () => {
  expect(formatUnknownUnits({ ...instance, units: [{ ...instance.units[0], samples: [] }] }, 1)).toContain("Sample GUIDs: None available");
});

it("copies the exact human readable payload and reports success", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const text = formatUnknownUnits(instance, 2);
  expect(await copyUnknownUnits(text, { writeText })).toBe("Unknowns copied!");
  expect(writeText).toHaveBeenCalledExactlyOnceWith(text);
});

it("reports denied or unavailable clipboard without an unhandled rejection", async () => {
  expect(await copyUnknownUnits("text", { writeText: vi.fn().mockRejectedValue(new Error("denied")) })).toContain("Copy failed");
  vi.stubGlobal("navigator", {});
  try {
    expect(await copyUnknownUnits("text")).toContain("Copy failed");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("renders a contextual button and accessible status only when unknowns exist", () => {
  const html = renderToStaticMarkup(<CopyUnknownsButton instance={instance} instanceNumber={2} />);
  expect(html).toContain("Copy unknowns for instance 2:");
  expect(html).toContain('role="status"');
  for (const units of [[], [instance.units[1]]]) {
    expect(formatUnknownUnits({ ...instance, units }, 1)).toBe("");
    expect(renderToStaticMarkup(<CopyUnknownsButton instance={{ ...instance, units }} instanceNumber={1} />)).toBe("");
  }
});
