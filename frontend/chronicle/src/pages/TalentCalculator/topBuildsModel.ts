import type { RankingsInstanceSummary } from "@/api/typesGenerated";

/** Distinct raid names for the top-build instance selector. */
export function topBuildRaidNames(instances: readonly RankingsInstanceSummary[]): string[] {
  return [...new Set(instances.filter((instance) => instance.category === "raid").map((instance) => instance.instance_name))];
}
