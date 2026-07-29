import type { InferredRole, PlayerRoleData } from "../Roles/roles.processor";

const ROLE_ORDER: Record<InferredRole, number> = {
  tank: 0,
  healer: 1,
  dps: 2,
};

export function sortStatusSnapshotsByRole<T extends { unit: { unitId: string; name: string } }>(
  snapshots: T[],
  roles: Map<string, PlayerRoleData>,
): T[] {
  return [...snapshots].sort((a, b) => {
    const aRole = roles.get(a.unit.unitId)?.role ?? "dps";
    const bRole = roles.get(b.unit.unitId)?.role ?? "dps";
    return ROLE_ORDER[aRole] - ROLE_ORDER[bRole]
      || a.unit.name.localeCompare(b.unit.name);
  });
}
