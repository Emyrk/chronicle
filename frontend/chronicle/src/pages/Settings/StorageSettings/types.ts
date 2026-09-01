import type { WoWLogGroup } from "@/api/queries";
import type { LogStatusInfo } from "@/lib/logStatus";

/** One row's worth of derived, display-ready data for the logs table. */
export interface LogRowViewModel {
  group: WoWLogGroup;
  id: string;
  instancesLabel: string;
  server: string;
  uploadDateLabel: string;
  status: LogStatusInfo;
  /** Active-file quota bytes — what currently counts against the raw storage limit. */
  storedBytes: number;
  storedLabel: string;
  parsedBytes: number;
  parsedLabel: string;
  /** Original (uncompressed) bytes across every file the group has ever had, active or deleted. */
  originalLabel: string;
  compressionLabel: string;
  activeFileCount: number;
  deletedFileCount: number;
  encounterCount: number;
  note: string | null;
  isSelected: boolean;
  isExpanded: boolean;
  rawDeleteDisabled: boolean;
  parsedDeleteDisabled: boolean;
  canDeleteFiles: boolean;
  canDelete: boolean;
}

export type PendingAction =
  | { kind: "delete-raw"; groups: WoWLogGroup[]; excludedCount: number; onSuccess?: () => void }
  | { kind: "delete-parsed"; groups: WoWLogGroup[] }
  | { kind: "delete-entire"; groups: WoWLogGroup[] }
  | null;

export type StatusFilter = "all" | LogStatusInfo["status"];
export type SortBy = "raw_desc" | "parsed_desc" | "newest" | "oldest";
