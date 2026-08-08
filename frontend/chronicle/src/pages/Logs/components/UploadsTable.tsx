import { Link } from "react-router-dom";
import { ArrowUpDown, Eye, Castle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WoWLogGroup } from "@/api/queries";
import type { WoWSimpleParsedInstance } from "@/api/typesGenerated";
import { parseParsedOutput, format } from "../utils/calendarUtils";
import { formatStorageBytes } from "@/utils/storage";

interface FileSizes {
  stored: number;
  original: number;
  hasCompression: boolean;
}

function getFileSizes(files: WoWLogGroup["files"]): FileSizes {
  if (!files) return { stored: 0, original: 0, hasCompression: false };
  
  const original = files.reduce((acc, f) => acc + f.size_bytes, 0);
  const stored = files.reduce(
    (acc, f) => acc + (f.compressed_size_bytes ?? f.size_bytes),
    0
  );
  const hasCompression = files.some(f => f.compressed_size_bytes != null);
  
  return { stored, original, hasCompression };
}

function parseTimestamp(timestamp: unknown): Date | null {
  if (!timestamp) return null;
  const ts = timestamp as { Time?: string; Valid?: boolean } | string;
  const dateStr = typeof ts === "string" ? ts : ts.Valid && ts.Time ? ts.Time : null;
  if (!dateStr) return null;
  return new Date(dateStr);
}

function getInstanceDate(inst: WoWSimpleParsedInstance): string | null {
  const firstEncounter = inst.encounters?.[0];
  if (!firstEncounter?.start_time) return null;
  const date = new Date(firstEncounter.start_time);
  return format(date, "MMM d");
}

export type SortField = "date" | "size";
export type SortDirection = "asc" | "desc";

interface UploadsTableProps {
  logs: WoWLogGroup[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField) => void;
}

export function UploadsTable({
  logs,
  sortField,
  sortDirection,
  onSortChange,
}: UploadsTableProps) {
  // Sort logs
  const sortedLogs = [...logs].sort((a, b) => {
    let comparison = 0;
    if (sortField === "date") {
      const dateA = parseTimestamp(a.created_at)?.getTime() ?? 0;
      const dateB = parseTimestamp(b.created_at)?.getTime() ?? 0;
      comparison = dateB - dateA; // Default newest first
    } else {
      const sizeA = a.files?.reduce((acc, f) => acc + f.size_bytes, 0) ?? 0;
      const sizeB = b.files?.reduce((acc, f) => acc + f.size_bytes, 0) ?? 0;
      comparison = sizeB - sizeA; // Default largest first
    }
    return sortDirection === "asc" ? -comparison : comparison;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Log Uploads</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => onSortChange("date")}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            Sort by {sortField === "date" ? "date" : "size"}
          </Button>
        </div>
      </div>

      {/* Mobile card view */}
      <div className="sm:hidden space-y-3">
        {sortedLogs.map((log) => {
          const parsed = parseParsedOutput(log.processing_output);
          const instances = (parsed?.instances ?? []) as WoWSimpleParsedInstance[];
          const uploadDate = parseTimestamp(log.created_at);
          const sizes = getFileSizes(log.files);
          const filesDeleted = log.files?.some((f) => f.storage_deleted_at) ?? false;
          const realmName = instances[0]?.realm_name ?? "—";

          return (
            <div key={log.id} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {uploadDate ? format(uploadDate, "MMM d, yyyy") : "Unknown"}
                </span>
                <span className="text-xs text-muted-foreground">{realmName}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {instances.slice(0, 3).map((inst) => {
                  const instanceDate = getInstanceDate(inst);
                  const instanceUrl = inst.slug
                    ? `/instances/${inst.slug}`
                    : `/instances/${inst.id}`;
                  return (
                    <Link
                      key={inst.id}
                      to={instanceUrl}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/15 hover:bg-green-500/25 text-green-400 rounded text-xs transition-colors"
                    >
                      <Castle className="h-3 w-3" />
                      <span>{inst.name}</span>
                      {instanceDate && (
                        <span className="text-muted-foreground">({instanceDate})</span>
                      )}
                    </Link>
                  );
                })}
                {instances.length > 3 && (
                  <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">
                    +{instances.length - 3} more
                  </span>
                )}
                {instances.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">
                    {parsed?.complete ? "No instances" : "Processing..."}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                <span>
                  {filesDeleted ? (
                    <span className="italic">removed</span>
                  ) : sizes.hasCompression ? (
                    <span title={`${formatStorageBytes(sizes.original)} uncompressed`}>
                      {formatStorageBytes(sizes.stored)}
                    </span>
                  ) : (
                    formatStorageBytes(sizes.original)
                  )}
                </span>
                <Link
                  to={`/logs/${log.id}`}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </Link>
              </div>
            </div>
          );
        })}
        {sortedLogs.length === 0 && (
          <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
            No logs found
          </div>
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 text-sm">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Upload Date
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Server
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Instances
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                Size
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedLogs.map((log) => {
              const parsed = parseParsedOutput(log.processing_output);
              const instances = (parsed?.instances ?? []) as WoWSimpleParsedInstance[];
              const uploadDate = parseTimestamp(log.created_at);
              const sizes = getFileSizes(log.files);
              const filesDeleted = log.files?.some((f) => f.storage_deleted_at) ?? false;
              
              // Get realm from first instance
              const realmName = instances[0]?.realm_name ?? "—";

              return (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-sm">
                    {uploadDate ? format(uploadDate, "MMM d, yyyy") : "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {realmName}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {instances.slice(0, 4).map((inst) => {
                        const instanceDate = getInstanceDate(inst);
                        const instanceUrl = inst.slug
                          ? `/instances/${inst.slug}`
                          : `/instances/${inst.id}`;
                        return (
                          <Link
                            key={inst.id}
                            to={instanceUrl}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/15 hover:bg-green-500/25 text-green-400 rounded text-xs transition-colors"
                          >
                            <Castle className="h-3 w-3" />
                            <span>{inst.name}</span>
                            {instanceDate && (
                              <span className="text-muted-foreground">
                                ({instanceDate})
                              </span>
                            )}
                          </Link>
                        );
                      })}
                      {instances.length > 4 && (
                        <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">
                          +{instances.length - 4} more
                        </span>
                      )}
                      {instances.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">
                          {parsed?.complete ? "No instances" : "Processing..."}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                    {filesDeleted ? (
                      <span className="italic text-xs">removed</span>
                    ) : sizes.hasCompression ? (
                      <span title={`${formatStorageBytes(sizes.original)} uncompressed`}>
                        {formatStorageBytes(sizes.stored)}
                      </span>
                    ) : (
                      formatStorageBytes(sizes.original)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/logs/${log.id}`}
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
            {sortedLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
