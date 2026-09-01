import type { WoWLogFile, WoWLogGroup } from "@/api/queries";

function quotaBytes(file: WoWLogFile): number {
  return file.compressed_size_bytes ?? file.size_bytes;
}

/** Active-file quota bytes — what currently counts against the raw storage limit. */
export function activeQuotaBytes(group: WoWLogGroup): number {
  return (group.files ?? []).filter((f) => !f.storage_deleted_at).reduce((sum, f) => sum + quotaBytes(f), 0);
}

/** Quota/original bytes across every file the group has ever had, for the compression-savings stat. */
export function allTimeBytes(group: WoWLogGroup): { originalBytes: number; quotaBytesAll: number } {
  const files = group.files ?? [];
  return {
    originalBytes: files.reduce((sum, f) => sum + f.size_bytes, 0),
    quotaBytesAll: files.reduce((sum, f) => sum + quotaBytes(f), 0),
  };
}
