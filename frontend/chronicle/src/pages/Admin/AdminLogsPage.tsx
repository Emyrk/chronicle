import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useAdminBulkDeleteLogs,
  useAdminBulkReparseLogs,
  useAdminUsers,
  useAdminLogs,
  useAdminInstanceNames,
  type AdminLog,
  type AdminLogsSortField,
} from "@/api/queries";
import { FileText, Loader2, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown, X, Filter, RefreshCw, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/Checkbox/Checkbox";
import { toast } from "sonner";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface LogRowProps {
  log: AdminLog;
  selected: boolean;
  onToggleSelected: (logId: string, checked: boolean) => void;
}

function LogRow({ log, selected, onToggleSelected }: LogRowProps) {
  return (
    <div className="flex items-center gap-3 py-3 px-4 hover:bg-accent/50 transition-colors">
      <Checkbox
        checked={selected}
        onCheckedChange={(checked) => onToggleSelected(log.id, checked === true)}
        aria-label={`Select log ${log.id}`}
      />
      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <Link to={`/logs/${log.id}`} className="group flex min-w-0 flex-1 items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono">{log.id.slice(0, 8)}...</span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${
              log.state === "processed"
                ? "bg-green-500/15 text-green-400"
                : "bg-yellow-500/15 text-yellow-400"
            }`}>
              {log.state}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            by {log.owner_name || "Unknown"}
          </span>
        </div>
        {log.instance_names && log.instance_names.length > 0 && (
          <span className="text-xs text-muted-foreground truncate max-w-32" title={log.instance_names.join(", ")}>
            {log.instance_names.join(", ")}
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
          {formatBytes(log.size_bytes)}
        </span>
        <span className="text-xs text-muted-foreground w-24 text-right">
          {new Date(log.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </div>
  );
}

interface SortButtonProps {
  field: AdminLogsSortField;
  current: AdminLogsSortField;
  order: "asc" | "desc";
  onToggle: (field: AdminLogsSortField) => void;
  children: React.ReactNode;
}

function SortButton({ field, current, order, onToggle, children }: SortButtonProps) {
  const isActive = current === field;
  return (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      size="sm"
      onClick={() => onToggle(field)}
      className="gap-1.5"
    >
      {children}
      {isActive ? (
        order === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
      )}
    </Button>
  );
}

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

function PaginationControls({ currentPage, totalPages, hasMore, onPageChange, isLoading }: PaginationControlsProps) {
  const canGoPrev = currentPage > 1;
  const canGoNext = hasMore || currentPage < totalPages;

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">
        Page {currentPage} of {totalPages || 1}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={!canGoPrev || isLoading}
          className="h-8 w-8 p-0"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrev || isLoading}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext || isLoading}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={!canGoNext || isLoading}
          className="h-8 w-8 p-0"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function AdminLogsPage() {
  const { data: usersData } = useAdminUsers();
  const users = usersData?.users ?? [];
  const bulkDeleteLogs = useAdminBulkDeleteLogs();
  const bulkReparseLogs = useAdminBulkReparseLogs();

  const [sortBy, setSortBy] = useState<AdminLogsSortField>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterInstanceName, setFilterInstanceName] = useState<string>("");
  const [filterWithoutInstance, setFilterWithoutInstance] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const pageSize = 50;

  const { data: instanceNames } = useAdminInstanceNames();

  const { data, isLoading, error } = useAdminLogs({
    limit: pageSize,
    offset: page * pageSize,
    sortBy,
    sortOrder,
    userId: filterUserId || undefined,
    instanceName: filterInstanceName || undefined,
    withoutInstance: filterWithoutInstance,
  });

  const toggleSort = (field: AdminLogsSortField) => {
    setSelectedLogIds(new Set());
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(0);
  };

  const handleFilterChange = (type: "user" | "instance", value: string) => {
    setSelectedLogIds(new Set());
    if (type === "user") {
      setFilterUserId(value);
    } else {
      setFilterInstanceName(value);
      if (value) {
        setFilterWithoutInstance(false);
      }
    }
    setPage(0);
  };

  const toggleWithoutInstance = () => {
    setSelectedLogIds(new Set());
    setFilterWithoutInstance((current) => !current);
    setFilterInstanceName("");
    setPage(0);
  };

  const clearFilters = () => {
    setSelectedLogIds(new Set());
    setFilterUserId("");
    setFilterInstanceName("");
    setFilterWithoutInstance(false);
    setPage(0);
  };

  const hasActiveFilters = filterUserId || filterInstanceName || filterWithoutInstance;
  const totalPages = data ? Math.ceil(data.total_count / pageSize) : 0;
  const visibleLogIds = data?.logs.map((log) => log.id) ?? [];
  const selectedVisibleCount = visibleLogIds.filter((logId) => selectedLogIds.has(logId)).length;
  const allVisibleSelected = visibleLogIds.length > 0 && selectedVisibleCount === visibleLogIds.length;
  const anyVisibleSelected = selectedVisibleCount > 0;
  const bulkActionPending = bulkDeleteLogs.isPending || bulkReparseLogs.isPending;

  const handleToggleSelected = (logId: string, checked: boolean) => {
    setSelectedLogIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(logId);
      } else {
        next.delete(logId);
      }
      return next;
    });
  };

  const handleToggleAllVisible = (checked: boolean) => {
    setSelectedLogIds((prev) => {
      const next = new Set(prev);
      for (const logId of visibleLogIds) {
        if (checked) {
          next.add(logId);
        } else {
          next.delete(logId);
        }
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedLogIds(new Set());
  };

  const handleBulkReparse = () => {
    const logIds = Array.from(selectedLogIds);
    if (logIds.length === 0) {
      return;
    }

    bulkReparseLogs.mutate(logIds, {
      onSuccess: (result) => {
        clearSelection();
        if (result.failed.length > 0) {
          toast.warning("Bulk reparse partially queued", {
            description: `${result.enqueued} of ${result.requested} selected logs were enqueued. ${result.failed.length} failed.`,
          });
          return;
        }

        toast.success("Bulk reparse started", {
          description: `${result.enqueued} selected logs were enqueued for reparse.`,
        });
      },
      onError: (err) => {
        toast.error("Failed to bulk reparse", {
          description: err.message,
        });
      },
    });
  };

  const handleBulkDelete = () => {
    const logIds = Array.from(selectedLogIds);
    if (logIds.length === 0) {
      return;
    }

    if (!confirm(`Delete ${logIds.length} selected logs? This cannot be undone.`)) {
      return;
    }

    bulkDeleteLogs.mutate(logIds, {
      onSuccess: (result) => {
        clearSelection();
        if (result.failed.length > 0) {
          toast.warning("Bulk delete partially completed", {
            description: `${result.deleted} of ${result.requested} selected logs were deleted. ${result.failed.length} failed.`,
          });
          return;
        }

        toast.success("Bulk delete completed", {
          description: `${result.deleted} selected logs were deleted.`,
        });
      },
      onError: (err) => {
        toast.error("Failed to bulk delete logs", {
          description: err.message,
        });
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
        </div>
        
        <select
          value={filterUserId}
          onChange={(e) => handleFilterChange("user", e.target.value)}
          className="h-8 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All users</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.username}
            </option>
          ))}
        </select>

        <select
          value={filterInstanceName}
          onChange={(e) => handleFilterChange("instance", e.target.value)}
          className="h-8 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All instances</option>
          {instanceNames?.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <Button
          variant={filterWithoutInstance ? "secondary" : "outline"}
          size="sm"
          onClick={toggleWithoutInstance}
          aria-pressed={filterWithoutInstance}
          className="h-8"
        >
          Without an instance
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1">
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        {data && (
          <span className="text-xs text-muted-foreground ml-auto">
            {data.total_count} {data.total_count === 1 ? "log" : "logs"}
          </span>
        )}
      </div>

      {!isLoading && !error && data && data.logs.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allVisibleSelected ? true : anyVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => handleToggleAllVisible(checked === true)}
                aria-label="Select all visible logs"
              />
              <span className="text-sm text-muted-foreground">
                {selectedVisibleCount > 0 ? `${selectedVisibleCount} selected on this page` : "Select visible logs"}
              </span>
            </div>

            {selectedLogIds.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkReparse}
                  disabled={bulkActionPending}
                >
                  {bulkReparseLogs.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Reparse Selected
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkActionPending}
                >
                  {bulkDeleteLogs.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete Selected
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection} disabled={bulkActionPending}>
                  Clear Selection
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Sort by:</span>
        <SortButton field="date" current={sortBy} order={sortOrder} onToggle={toggleSort}>
          Date
        </SortButton>
        <SortButton field="user" current={sortBy} order={sortOrder} onToggle={toggleSort}>
          User
        </SortButton>
        <SortButton field="size" current={sortBy} order={sortOrder} onToggle={toggleSort}>
          Size
        </SortButton>
        <SortButton field="instance" current={sortBy} order={sortOrder} onToggle={toggleSort}>
          Instance
        </SortButton>
      </div>

      {/* Loading state */}
      {isLoading && (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading logs...</p>
          </div>
        </Card>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <h2 className="font-semibold text-lg text-destructive">Error Loading Logs</h2>
              <p className="text-muted-foreground mt-1">{error.message}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !error && (!data || data.logs.length === 0) && (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <div>
              <h2 className="font-semibold text-lg">No Logs Found</h2>
              <p className="text-muted-foreground mt-1">
                {hasActiveFilters 
                  ? "No logs match the current filters." 
                  : "There are no logs in the system."}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Logs list */}
      {!isLoading && !error && data && data.logs.length > 0 && (
        <>
          <Card className="overflow-hidden divide-y divide-border/50">
            {data.logs.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                selected={selectedLogIds.has(log.id)}
                onToggleSelected={handleToggleSelected}
              />
            ))}
          </Card>

          {totalPages > 1 && (
            <PaginationControls
              currentPage={page + 1}
              totalPages={totalPages}
              hasMore={data.has_more}
              onPageChange={(p) => {
                clearSelection();
                setPage(p - 1);
              }}
              isLoading={isLoading}
            />
          )}
        </>
      )}
    </div>
  );
}
