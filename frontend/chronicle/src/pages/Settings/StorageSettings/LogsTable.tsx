import { useMemo, useState } from "react";
import { useAuthorizationCheck, type WoWLogGroup } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/Checkbox/Checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/Table/Table";
import { formatBytes } from "@/lib/format";
import { deriveLogStatus, getParsedInstances, getRawFileCounts } from "@/lib/logStatus";
import { activeQuotaBytes, allTimeBytes } from "./logMetrics";
import { LogRow } from "./LogRow";
import type { LogRowViewModel, PendingAction, SortBy, StatusFilter } from "./types";

const PAGE_SIZE = 10;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "parsed_complete", label: "Parsed" },
  { value: "parsed_with_warnings", label: "Parsed · warnings" },
  { value: "processing", label: "Processing" },
  { value: "parse_failed", label: "Parse failed" },
  { value: "raw_deleted", label: "Raw deleted" },
  { value: "partially_deleted", label: "Partially deleted" },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "raw_desc", label: "Sort: Largest raw first" },
  { value: "parsed_desc", label: "Sort: Largest parsed first" },
  { value: "newest", label: "Sort: Newest upload" },
  { value: "oldest", label: "Sort: Oldest upload" },
];

const selectClassName = "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground";
const inputClassName =
  "h-9 w-64 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground";

function buildNote(status: LogRowViewModel["status"], activeFileCount: number, deletedFileCount: number): string | null {
  switch (status.status) {
    case "partially_deleted":
      return `${deletedFileCount} of ${activeFileCount + deletedFileCount} raw files already deleted.`;
    case "raw_deleted":
      return "Raw files deleted — parsed reports remain available.";
    case "parse_failed":
      return "Parsing failed for this log. Raw files may be the only way to recover it — deleting them is not recommended until investigated.";
    case "parsed_with_warnings":
      return "Parsed with warnings. Review the report before deleting raw files.";
    default:
      return null;
  }
}

function buildBaseRow(group: WoWLogGroup): Omit<LogRowViewModel, "isSelected" | "isExpanded" | "canDeleteFiles" | "canDelete"> {
  const status = deriveLogStatus(group);
  const instances = getParsedInstances(group);
  const { activeCount, deletedCount } = getRawFileCounts(group);
  const { originalBytes, quotaBytesAll } = allTimeBytes(group);
  const storedBytes = activeQuotaBytes(group);
  const compressionPct = originalBytes > 0 ? Math.round((1 - quotaBytesAll / originalBytes) * 100) : null;
  const encounterCount = instances.reduce((sum, inst) => sum + (inst.encounters?.length ?? 0), 0);

  return {
    group,
    id: group.id,
    instancesLabel: instances.length > 0 ? instances.map((i) => i.name).join(", ") : "Unparsed upload",
    server: instances[0]?.server_name ?? instances[0]?.realm_name ?? "—",
    uploadDateLabel: new Date(group.created_at).toLocaleDateString(),
    status,
    storedBytes,
    storedLabel: formatBytes(storedBytes),
    parsedBytes: group.parsed_bytes,
    parsedLabel: group.parsed_bytes > 0 ? formatBytes(group.parsed_bytes) : "—",
    originalLabel: originalBytes > 0 ? formatBytes(originalBytes) : "—",
    compressionLabel: compressionPct !== null ? `${compressionPct}%` : "—",
    activeFileCount: activeCount,
    deletedFileCount: deletedCount,
    encounterCount,
    note: buildNote(status, activeCount, deletedCount),
    rawDeleteDisabled: !(storedBytes > 0 && status.status !== "processing"),
    parsedDeleteDisabled: !(group.parsed_bytes > 0),
  };
}

interface LogsTableProps {
  logs: WoWLogGroup[];
  onRequestDelete: (action: PendingAction) => void;
}

export function LogsTable({ logs, onRequestDelete }: LogsTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("raw_desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const baseRows = useMemo(() => logs.map(buildBaseRow), [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseRows.filter((row) => {
      if (statusFilter !== "all" && row.status.status !== statusFilter) return false;
      if (!q) return true;
      return row.instancesLabel.toLowerCase().includes(q) || row.server.toLowerCase().includes(q);
    });
  }, [baseRows, search, statusFilter]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      switch (sortBy) {
        case "raw_desc":
          return b.storedBytes - a.storedBytes;
        case "parsed_desc":
          return b.parsedBytes - a.parsedBytes;
        case "newest":
          return new Date(b.group.created_at).getTime() - new Date(a.group.created_at).getTime();
        case "oldest":
          return new Date(a.group.created_at).getTime() - new Date(b.group.created_at).getTime();
      }
    });
    return rows;
  }, [filtered, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paged = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  const authzChecks = useMemo(() => {
    const checks: Record<string, string> = {};
    for (const row of paged) {
      checks[`${row.id}:deleteFiles`] = `raid_log:${row.id}#delete_files`;
      checks[`${row.id}:delete`] = `raid_log:${row.id}#delete`;
    }
    return checks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged.map((row) => row.id).join(",")]);
  const { data: authz } = useAuthorizationCheck(authzChecks, { enabled: paged.length > 0 });

  const rows: LogRowViewModel[] = paged.map((row) => ({
    ...row,
    isSelected: selected.has(row.id),
    isExpanded: expandedId === row.id,
    canDeleteFiles: authz?.[`${row.id}:deleteFiles`] ?? false,
    canDelete: authz?.[`${row.id}:delete`] ?? false,
  }));

  const filteredIds = filtered.map((row) => row.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someFilteredSelected = !allFilteredSelected && filteredIds.some((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const id of filteredIds) next.delete(id);
      } else {
        for (const id of filteredIds) next.add(id);
      }
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const selectedGroups = logs.filter((g) => selected.has(g.id));
  const selectedRawBytes = selectedGroups.reduce((sum, g) => sum + activeQuotaBytes(g), 0);

  function requestBulkDeleteRaw() {
    const eligible = selectedGroups.filter((g) => {
      const status = deriveLogStatus(g);
      return activeQuotaBytes(g) > 0 && status.status !== "processing";
    });
    onRequestDelete({
      kind: "delete-raw",
      groups: eligible,
      excludedCount: selectedGroups.length - eligible.length,
      onSuccess: () => setSelected(new Set()),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your logs</CardTitle>
        <CardDescription>Delete raw files after they're parsed to free space. Parsed reports stay available.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by instance or server"
            className={inputClassName}
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setPage(1);
            }}
            className={selectClassName}
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortBy);
              setPage(1);
            }}
            className={`${selectClassName} ml-auto`}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
            <span className="text-sm">
              {selected.size} selected · {formatBytes(selectedRawBytes)} raw storage to free
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button size="sm" variant="destructive" onClick={requestBulkDeleteRaw}>
                Delete raw files
              </Button>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Log</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Raw stored</TableHead>
              <TableHead>Parsed</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                  {logs.length === 0
                    ? "No logs yet. Uploaded combat logs will show up here once Chronicle has processed them."
                    : "No logs match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <LogRow
                  key={row.id}
                  row={row}
                  onToggleSelect={toggleSelect}
                  onToggleExpand={toggleExpand}
                  onRequestDeleteRaw={() => onRequestDelete({ kind: "delete-raw", groups: [row.group], excludedCount: 0 })}
                  onRequestDeleteParsed={() => onRequestDelete({ kind: "delete-parsed", groups: [row.group] })}
                  onRequestDeleteEntire={() => onRequestDelete({ kind: "delete-entire", groups: [row.group] })}
                />
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {sorted.length === 0
              ? "No logs"
              : `${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, sorted.length)} of ${sorted.length}`}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
