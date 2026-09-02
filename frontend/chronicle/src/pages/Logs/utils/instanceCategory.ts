import type { SupportedInstance } from "@/api/typesGenerated";

export type InstanceCategory = "raid" | "dungeon" | "unknown";

export function getInstanceCategory(
  name: string,
  supportedInstances: readonly SupportedInstance[] | undefined,
): InstanceCategory {
  const normalizedName = name.toLowerCase();
  const instance = supportedInstances?.find(
    (candidate) =>
      candidate.name.toLowerCase() === normalizedName ||
      candidate.derived_names?.some(
        (derivedName) => derivedName.toLowerCase() === normalizedName,
      ),
  );
  return instance?.category === "raid" || instance?.category === "dungeon"
    ? instance.category
    : "unknown";
}
