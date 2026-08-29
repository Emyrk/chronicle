import type { InstanceRankingRecord } from "@/api/typesGenerated";

export function filterRankingRecords(
  records: InstanceRankingRecord[],
  query: string,
): InstanceRankingRecord[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return records;

  return records.filter((record) =>
    [
      record.player_name,
      record.player_class,
      record.player_spec,
      record.player_role,
      record.encounter_name,
      record.player_guid,
    ].some((value) => value.toLowerCase().includes(normalized)),
  );
}
