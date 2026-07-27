import type { SpeedrunRequirement } from "@/api/typesGenerated";

function ordinal(value: number): string {
  if (value === 1) return "first";
  if (value === 2) return "second";
  if (value === 3) return "third";

  const remainder100 = value % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${value}th`;

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function formatSpeedrunRequirementBefore(
  requirement: SpeedrunRequirement,
): string | null {
  const clauses: string[] = [];
  const before = requirement.before;
  if (!before) return null;

  const totalKills = before.total_kills ?? 0;
  const bossKills = before.boss_kills ?? 0;
  if (totalKills > 0) {
    clauses.push(`within first ${totalKills} kills`);
  }
  if (bossKills > 0) {
    clauses.push(`before ${ordinal(bossKills)} boss kill`);
  }

  return clauses.length > 0 ? clauses.join(" and ") : null;
}
