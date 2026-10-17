import type { InstanceUnit } from "@/api/typesGenerated";

type WireInstanceUnit = Omit<InstanceUnit, "owner"> & {
  owner?: InstanceUnit["owner"] | string;
};

export type ResolvedInstanceUnit = Omit<InstanceUnit, "name" | "owner"> & {
  name: string;
  owner?: string;
};

export function resolveInstanceUnits(
  units: Record<string, WireInstanceUnit> | null | undefined,
  namesByEntry: Record<number, string> | null | undefined,
  summonsByOwner: Record<string, readonly string[]> | null | undefined,
): Record<string, ResolvedInstanceUnit> {
  const ownerBySummon = new Map<string, string>();
  for (const [owner, summonGuids] of Object.entries(summonsByOwner ?? {})) {
    for (const summonGuid of summonGuids) {
      ownerBySummon.set(summonGuid, owner);
    }
  }

  return Object.fromEntries(
    Object.entries(units ?? {}).map(([guid, unit]) => {
      const { name: inlineName, owner: inlineOwner, ...metadata } = unit;
      const owner = inlineOwner?.toString() ?? ownerBySummon.get(guid);
      return [guid, {
        ...metadata,
        name: inlineName ?? namesByEntry?.[unit.entry] ?? guid,
        ...(owner ? { owner } : {}),
      }];
    }),
  );
}
