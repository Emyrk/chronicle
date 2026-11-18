import type { IdentityInstance } from "@/api/typesGenerated";

// Sort copies: report data is shared with the category table and other consumers.
export function formatUnknownUnits(instance: IdentityInstance, instanceNumber: number): string {
  const units = instance.units.filter(unit => unit.category === "unknown")
    .sort((a, b) => a.entry_id - b.entry_id || compare(a.name, b.name));
  if (units.length === 0) return "";
  return [
    "Chronicle unknown unit identities",
    `Instance ${instanceNumber}: ${instance.name || "Unnamed"}`,
    `Zone: ${instance.zone || "Unknown"}`,
    "Counts are distinct GUIDs within this instance, not event counts. Samples may be incomplete.",
    ...units.map(unit => [
      `Category: ${unit.category} | Name: ${unit.name || "Unnamed"} | Entry: ${unit.entry_id} | Distinct GUIDs: ${unit.unique_count}`,
      `Sample GUIDs: ${[...unit.samples].sort(compare).join(", ") || "None available"}`,
    ].join("\n")),
  ].join("\n");
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function copyUnknownUnits(text: string, clipboard?: Pick<Clipboard, "writeText">): Promise<string> {
  try {
    await (clipboard ?? navigator.clipboard).writeText(text);
    return "Unknowns copied!";
  } catch {
    return "Copy failed. Select and copy the unknown unit details manually.";
  }
}
