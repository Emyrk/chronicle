import { useMemo, useState } from "react";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Link, useSearchParams } from "react-router-dom";
import { LogIn, Loader2, Upload as UploadIcon, HardDrive, HelpCircle } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAuthorizationCheck, useLogGroups, useSession, useSiteConfig, type WoWLogGroup } from "@/api/queries";
import { LogsCalendar } from "./components/LogsCalendar";
import { CalendarDayContent } from "./components/CalendarDayContent";
import { UploadsTable, type SortField, type SortDirection } from "./components/UploadsTable";
import {
  groupLogsByDate,
  getUniqueInstanceNames,
  dateKey,
} from "./utils/calendarUtils";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function StorageUsageCard({ consumed, max }: { consumed: number; max: number }) {
  const percentage = max > 0 ? Math.min((consumed / max) * 100, 100) : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 95;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <HardDrive className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Storage Usage</span>
            <span className="text-sm text-muted-foreground">
              {formatBytes(consumed)} / {formatBytes(max)}
            </span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                isAtLimit
                  ? "bg-destructive"
                  : isNearLimit
                    ? "bg-yellow-500"
                    : "bg-primary"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className={`text-xs ${isNearLimit ? "text-foreground" : "text-muted-foreground"}`}>
              {isAtLimit
                ? "You've reached your storage limit. Delete stored log files from your logs to free up space."
                : isNearLimit
                  ? "You're approaching your storage limit. Consider deleting stored log files to free up space."
                  : "To help control server costs, you can delete stored log files after they've been parsed. Your parsed data will be preserved."}
            </p>
            <Button asChild size="sm" variant={isAtLimit ? "destructive" : "outline"} className="shrink-0">
              <Link to="/account/storage">Manage Storage</Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export interface LogsListViewProps {
  isAuthenticated: boolean;
  authLoading: boolean;
  logs: WoWLogGroup[] | undefined;
  logsLoading: boolean;
  logsError: Error | null;
  maxStorageBytes: number;
  consumedStorageBytes: number;
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
}

export function LogsListView({
  isAuthenticated,
  authLoading,
  logs,
  logsLoading,
  logsError,
  maxStorageBytes,
  consumedStorageBytes,
  currentMonth,
  onMonthChange,
}: LogsListViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const instanceFilter = searchParams.get("instance");
  const [showUploadDates, setShowUploadDates] = useLocalStorage("logs-show-uploads", false);
  const { data: siteConfig } = useSiteConfig();
  const authzChecks = useMemo(() => ({
    adminLogs: "chronicle:chronicle#admin_logs",
  }), []);
  const { data: authz } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated,
  });
  const hasAdminLogs = authz?.adminLogs ?? false;
  const showUpload = !siteConfig?.client_uploads_disabled || hasAdminLogs;
  
  // Table sort state
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  
  const uniqueInstances = useMemo(() => {
    return getUniqueInstanceNames(logs);
  }, [logs]);
  
  // Group instances by date for calendar
  // Instances always appear on raid date, uploads on upload date
  const calendarData = useMemo(() => {
    return groupLogsByDate(logs, instanceFilter);
  }, [logs, instanceFilter]);
  
  const setInstanceFilter = (name: string | null) => {
    if (name) {
      setSearchParams({ instance: name });
    } else {
      setSearchParams({});
    }
  };
  
  const handleSortChange = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };
  
  // Render content for each calendar day
  const renderDayContent = (date: Date) => {
    const key = dateKey(date);
    const dayData = calendarData[key];
    
    if (!dayData) return null;
    
    return (
      <CalendarDayContent dayData={dayData} showUploads={showUploadDates} />
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Your Logs</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            View and manage your uploaded raid logs.
          </p>
        </div>
        {showUpload && (
          <Link to="/upload" className="self-start sm:self-auto">
            <Button>
              <UploadIcon className="h-4 w-4 mr-2" />
              Upload New
            </Button>
          </Link>
        )}
      </div>

      {/* Auth Check */}
      {!authLoading && !isAuthenticated ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <h2 className="font-semibold text-lg">Authentication Required</h2>
              <p className="text-muted-foreground mt-1">
                You must be logged in to view your logs.
              </p>
            </div>
            <Link to="/login?from=/logs">
              <Button>
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            </Link>
          </div>
        </Card>
      ) : logsLoading && !logs ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading your logs...</p>
          </div>
        </Card>
      ) : logsError && !logs ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <h2 className="font-semibold text-lg text-destructive">Error Loading Logs</h2>
              <p className="text-muted-foreground mt-1">
                {logsError.message}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Storage usage */}
          {maxStorageBytes > 0 && (
            <StorageUsageCard consumed={consumedStorageBytes} max={maxStorageBytes} />
          )}

          {/* Calendar section */}
          <Card className="p-4">
            <LogsCalendar
              month={currentMonth}
              onMonthChange={onMonthChange}
              dayContent={renderDayContent}
              headerRight={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  {/* Show uploads toggle */}
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showUploadDates}
                      onChange={(e) => setShowUploadDates(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-muted-foreground">Show uploads</span>
                  </label>
                  
                  {/* Instance filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Instance:</span>
                    <div className="relative flex-1 sm:flex-none">
                      <select
                        className="w-full text-sm bg-secondary border border-border rounded px-3 py-1.5 pr-8 cursor-pointer appearance-none"
                        value={instanceFilter ?? ""}
                        onChange={(e) => setInstanceFilter(e.target.value || null)}
                      >
                        <option value="">All instances</option>
                        {uniqueInstances.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <HelpCircle className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>
              }
            />
          </Card>

          {/* Log Uploads table */}
          <UploadsTable
            logs={logs ?? []}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
          />
        </>
      )}
    </div>
  );
}

export function LogsList() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Compute the visible calendar date range (full weeks covering the month)
  const calendarStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });

  const { data: logs, isLoading: logsLoading, error: logsError } = useLogGroups({
    enabled: isAuthenticated,
    start: calendarStart.toISOString(),
    end: calendarEnd.toISOString(),
  });
  const { data: session } = useSession({
    enabled: isAuthenticated,
  });

  return (
    <LogsListView
      isAuthenticated={isAuthenticated}
      authLoading={authLoading}
      logs={logs}
      logsLoading={logsLoading}
      logsError={logsError}
      maxStorageBytes={session?.max_storage_bytes ?? 0}
      consumedStorageBytes={session?.consumed_storage_bytes ?? 0}
      currentMonth={currentMonth}
      onMonthChange={setCurrentMonth}
    />
  );
}
