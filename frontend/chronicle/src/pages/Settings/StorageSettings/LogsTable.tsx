import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useAuthorizationCheck, type WoWLogGroup } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/Checkbox/Checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/Table/Table";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { deriveLogStatus, getParsedInstances, getRawFileCounts } from "@/lib/logStatus";
import { activeQuotaBytes, allTimeBytes } from "./logMetrics";
import { LogRow } from "./LogRow";
import type { LogRowViewModel, PendingAction, SortDirection, SortField } from "./types";

const PAGE_SIZE = 25;

const inputClassName =
  "h-9 w-64 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground";

interface SortableHeadProps {
  field: SortField;
  activeField: SortField;
  direction: SortDirection;
  onClick: (field: SortField) => void;
  className?: string;
  children: ReactNode;
}

function SortableHead({ field, activeField, direction, onClick, className, children }: SortableHeadProps) {
  const isActive = field === activeField;
  const Icon = isActive ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead
      className={cn("cursor-pointer select-none", isActive && "text-foreground", className)}
      onClick={() => onClick(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <Icon className={cn("size-3.5", !isActive && "text-muted-foreground/50")} />
      </span>
    </TableHead>
  );
}

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

const MAX_VISIBLE_INSTANCE_NAMES = 2;

function buildInstancesLabel(names: string[]): string {
  if (names.length === 0) return "Unparsed upload";
  if (names.length <= MAX_VISIBLE_INSTANCE_NAMES) return names.join(", ");
  const hidden = names.length - MAX_VISIBLE_INSTANCE_NAMES;
  return `${names.slice(0, MAX_VISIBLE_INSTANCE_NAMES).join(", ")} + ${hidden} more`;
}

function buildBaseRow(group: WoWLogGroup): Omit<LogRowViewModel, "isSelected" | "isExpanded" | "canDeleteFiles" | "canDelete"> {
  const status = deriveLogStatus(group);
  const instances = getParsedInstances(group);
  const instanceNames = instances.map((i) => i.name);
  const { activeCount, deletedCount } = getRawFileCounts(group);
  const { originalBytes, quotaBytesAll } = allTimeBytes(group);
  const storedBytes = activeQuotaBytes(group);
  const compressionPct = originalBytes > 0 ? Math.round((1 - quotaBytesAll / originalBytes) * 100) : null;
  const encounterCount = instances.reduce((sum, inst) => sum + (inst.encounters?.length ?? 0), 0);

  return {
    group,
    id: group.id,
    instancesLabel: buildInstancesLabel(instanceNames),
    instancesFullLabel: instanceNames.length > 0 ? instanceNames.join(", ") : "Unparsed upload",
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
  const [sortField, setSortField] = useState<SortField>("raw");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const baseRows = useMemo(() => logs.map(buildBaseRow), [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseRows;
    return baseRows.filter(
      (row) => row.instancesFullLabel.toLowerCase().includes(q) || row.server.toLowerCase().includes(q),
    );
  }, [baseRows, search]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp: number;
      switch (sortField) {
        case "date":
          cmp = new Date(a.group.created_at).getTime() - new Date(b.group.created_at).getTime();
          break;
        case "raw":
          cmp = a.storedBytes - b.storedBytes;
          break;
        case "parsed":
          cmp = a.parsedBytes - b.parsedBytes;
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortField, sortDirection]);

  function handleSortClick(field: SortField) {
    if (field === sortField) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setPage(1);
  }

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

        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Log</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <SortableHead
                field="date"
                activeField={sortField}
                direction={sortDirection}
                onClick={handleSortClick}
                className="w-28"
              >
                Date
              </SortableHead>
              <SortableHead
                field="raw"
                activeField={sortField}
                direction={sortDirection}
                onClick={handleSortClick}
                className="w-28"
              >
                Raw stored
              </SortableHead>
              <SortableHead
                field="parsed"
                activeField={sortField}
                direction={sortDirection}
                onClick={handleSortClick}
                className="w-24"
              >
                Parsed
              </SortableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
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
