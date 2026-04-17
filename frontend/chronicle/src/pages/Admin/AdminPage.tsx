import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { LeaderboardVersionRequirements } from "@/api/typesGenerated";
import { 
  useAdminUsers, 
  useAdminLogs, 
  useAdminInstanceNames,
  useResyncUserRoles,
  useUpsertUserGrant,
  useAuthorizationCheck,
  type User,
  type AdminLog,
  type AdminLogsSortField,
} from "@/api/queries";
import { useAuth } from "@/hooks/useAuth";
import { RefreshCw, Users, FileText, Shield, ShieldCheck, TestTube, Loader2, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, HardDrive, Check, Pencil, ArrowUpDown, ArrowUp, ArrowDown, X, Filter, Trophy } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function bytesToMB(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

function mbToBytes(mb: number): number {
  return mb * 1024 * 1024;
}

interface StorageBarProps {
  consumed: number;
  max: number;
  onEditLimit?: (newMaxBytes: number) => void;
  isSaving?: boolean;
}

function StorageBar({ consumed, max, onEditLimit, isSaving }: StorageBarProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(bytesToMB(max).toString());
  const percentage = max > 0 ? Math.min((consumed / max) * 100, 100) : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  const handleSave = () => {
    const mbValue = parseInt(inputValue, 10);
    if (!isNaN(mbValue) && mbValue >= 0 && onEditLimit) {
      onEditLimit(mbToBytes(mbValue));
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditing(false);
      setInputValue(bytesToMB(max).toString());
    }
  };
  
  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <HardDrive className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1">
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
        <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-0.5">
          <span>{formatBytes(consumed)}</span>
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSave}
                className="w-16 px-1 py-0.5 text-[10px] bg-secondary rounded border-0 text-right"
                autoFocus
                min={0}
              />
              <span>MB</span>
              {isSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <button onClick={handleSave} className="hover:text-foreground">
                  <Check className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            <button 
              onClick={() => {
                setInputValue(bytesToMB(max).toString());
                setEditing(true);
              }}
              className="flex items-center gap-1 hover:text-foreground"
              title="Click to edit limit"
            >
              <span>{formatBytes(max)}</span>
              {onEditLimit && <Pencil className="h-2.5 w-2.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const badges: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    technical_admin: {
      icon: <ShieldCheck className="h-3 w-3" />,
      label: "Tech Admin",
      className: "bg-purple-500/15 text-purple-400",
    },
    admin: {
      icon: <Shield className="h-3 w-3" />,
      label: "Admin",
      className: "bg-blue-500/15 text-blue-400",
    },
    alpha_tester: {
      icon: <TestTube className="h-3 w-3" />,
      label: "Alpha",
      className: "bg-green-500/15 text-green-400",
    },
  };

  const badge = badges[role] ?? {
    icon: null,
    label: role,
    className: "bg-secondary text-muted-foreground",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${badge.className}`}>
      {badge.icon}
      {badge.label}
    </span>
  );
}

interface UserRowProps {
  user: User;
  onResync: () => void;
  isSyncing: boolean;
  onEditLimit: (newMaxBytes: number) => void;
  isSavingLimit: boolean;
}

function UserRow({ user, onResync, isSyncing, onEditLimit, isSavingLimit }: UserRowProps) {
  return (
    <div className="group py-3 px-4 hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{user.username}</span>
            <span className="text-xs text-muted-foreground truncate">{user.email}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {!user.roles || user.roles.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">No roles</span>
            ) : (
              user.roles.map((role) => <RoleBadge key={role} role={role} />)
            )}
          </div>
        </div>
        <StorageBar 
          consumed={user.consumed_storage_bytes} 
          max={user.max_storage_bytes}
          onEditLimit={onEditLimit}
          isSaving={isSavingLimit}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(user.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onResync}
          disabled={isSyncing}
          className="h-8"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
          Resync
        </Button>
      </div>
    </div>
  );
}

function UsersSection({ users }: { users: readonly User[] }) {
  const resyncMutation = useResyncUserRoles();
  const upsertGrantMutation = useUpsertUserGrant();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [savingLimitId, setSavingLimitId] = useState<string | null>(null);

  const handleResync = async (userId: string) => {
    setSyncingId(userId);
    try {
      await resyncMutation.mutateAsync(userId);
    } finally {
      setSyncingId(null);
    }
  };

  // Edit the "base" grant to change storage limit (simple approach)
  const handleEditLimit = async (userId: string, newMaxBytes: number) => {
    setSavingLimitId(userId);
    try {
      await upsertGrantMutation.mutateAsync({ 
        userId, 
        source: "base", 
        storageBytes: newMaxBytes,
        description: "Base storage allocation",
      });
    } finally {
      setSavingLimitId(null);
    }
  };

  return (
    <Card className="overflow-hidden divide-y divide-border/50">
      {users.map((user) => (
        <UserRow
          key={user.id}
          user={user}
          onResync={() => handleResync(user.id)}
          isSyncing={syncingId === user.id}
          onEditLimit={(newMaxBytes) => handleEditLimit(user.id, newMaxBytes)}
          isSavingLimit={savingLimitId === user.id}
        />
      ))}
    </Card>
  );
}

function LogRow({ log }: { log: AdminLog }) {
  return (
    <Link
      to={`/logs/${log.id}`}
      className="group flex items-center gap-3 py-3 px-4 hover:bg-accent/50 transition-colors"
    >
      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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
      {/* Instance names */}
      {log.instance_names && log.instance_names.length > 0 && (
        <span className="text-xs text-muted-foreground truncate max-w-32" title={log.instance_names.join(", ")}>
          {log.instance_names.join(", ")}
        </span>
      )}
      {/* Size */}
      <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
        {formatBytes(log.size_bytes)}
      </span>
      {/* Date */}
      <span className="text-xs text-muted-foreground w-24 text-right">
        {new Date(log.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
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

function LogsSection({ users }: { users: readonly User[] }) {
  const [sortBy, setSortBy] = useState<AdminLogsSortField>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterInstanceName, setFilterInstanceName] = useState<string>("");
  const pageSize = 50;

  // Fetch instance names for filter dropdown
  const { data: instanceNames } = useAdminInstanceNames();

  const { data, isLoading, error } = useAdminLogs({
    limit: pageSize,
    offset: page * pageSize,
    sortBy,
    sortOrder,
    userId: filterUserId || undefined,
    instanceName: filterInstanceName || undefined,
  });

  const toggleSort = (field: AdminLogsSortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(0); // Reset to first page on sort change
  };

  const handleFilterChange = (type: "user" | "instance", value: string) => {
    if (type === "user") {
      setFilterUserId(value);
    } else {
      setFilterInstanceName(value);
    }
    setPage(0); // Reset to first page on filter change
  };

  const clearFilters = () => {
    setFilterUserId("");
    setFilterInstanceName("");
    setPage(0);
  };

  const hasActiveFilters = filterUserId || filterInstanceName;
  const totalPages = data ? Math.ceil(data.total_count / pageSize) : 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
        </div>
        
        {/* User filter */}
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

        {/* Instance filter */}
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

        {/* Clear filters button */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1">
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        {/* Result count */}
        {data && (
          <span className="text-xs text-muted-foreground ml-auto">
            {data.total_count} {data.total_count === 1 ? "log" : "logs"}
          </span>
        )}
      </div>

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
              <LogRow key={log.id} log={log} />
            ))}
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <PaginationControls
              currentPage={page + 1}
              totalPages={totalPages}
              hasMore={data.has_more}
              onPageChange={(p) => setPage(p - 1)}
              isLoading={isLoading}
            />
          )}
        </>
      )}
    </div>
  );
}

export function AdminPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Check admin permission via SpiceDB
  const authzChecks = useMemo(() => ({
    admin: "chronicle:chronicle#admin_users",
  }), []);
  const { data: authz, isLoading: authzLoading } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated,
  });
  const isAdmin = authz?.admin ?? false;
  
  const { data: usersData, isLoading: usersLoading, error: usersError } = useAdminUsers();
  
  const [activeTab, setActiveTab] = useState<"users" | "logs" | "leaderboard">("users");

  const sessionLoading = authLoading || authzLoading;

  if (sessionLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <Shield className="h-12 w-12 text-muted-foreground" />
            <div>
              <h2 className="font-semibold text-lg">Access Denied</h2>
              <p className="text-muted-foreground mt-1">
                You don't have permission to view this page.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Administration</h1>
        <p className="text-muted-foreground mt-1">
          Manage users and view all logs on the platform.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <Button
          variant={activeTab === "users" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("users")}
          className="gap-2"
        >
          <Users className="h-4 w-4" />
          Users
          {usersData && (
            <span className="ml-1 py-0.5 px-2 rounded-full text-xs bg-accent">
              {usersData.users.length}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === "logs" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("logs")}
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          All Logs
        </Button>
        <Button
          variant={activeTab === "leaderboard" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("leaderboard")}
          className="gap-2"
        >
          <Trophy className="h-4 w-4" />
          Leaderboard
        </Button>
        <div className="border-l h-6 mx-1" />
        <Link to="/admin/users">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Users className="h-4 w-4" />
            Manage Users
          </Button>
        </Link>
        <Link to="/admin/storage">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <HardDrive className="h-4 w-4" />
            Storage Grants
          </Button>
        </Link>
        <Link to="/admin/regression">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <TestTube className="h-4 w-4" />
            Regression Testing
          </Button>
        </Link>
      </div>

      {/* Content */}
      {activeTab === "users" && (
        <>
          {usersLoading ? (
            <Card className="p-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading users...</p>
              </div>
            </Card>
          ) : usersError ? (
            <Card className="p-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <div>
                  <h2 className="font-semibold text-lg text-destructive">Error Loading Users</h2>
                  <p className="text-muted-foreground mt-1">{usersError.message}</p>
                </div>
              </div>
            </Card>
          ) : usersData && usersData.users.length > 0 ? (
            <UsersSection users={usersData.users} />
          ) : (
            <Card className="p-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <Users className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="font-semibold text-lg">No Users Found</h2>
                  <p className="text-muted-foreground mt-1">There are no users in the system.</p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {activeTab === "logs" && <LogsSection users={usersData?.users ?? []} />}
      {activeTab === "leaderboard" && <LeaderboardSection />}
    </div>
  );
}

function LeaderboardSection() {
  const { data: requirements, isLoading, refetch } = useQuery({
    queryKey: ["admin", "leaderboard", "version-requirements"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/leaderboard/version-requirements");
      if (!res.ok) throw new Error("Failed to fetch version requirements");
      return res.json() as Promise<LeaderboardVersionRequirements[]>;
    },
    retry: false,
  });

  const { data: instanceNames } = useAdminInstanceNames();

  const [instanceName, setInstanceName] = useState("");
  const [minParser, setMinParser] = useState("");
  const [minAddon, setMinAddon] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingAll, setSettingAll] = useState(false);

  const upsertOne = async (name: string) => {
    const res = await fetch("/api/v1/admin/leaderboard/version-requirements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instance_name: name,
        min_parser_version: minParser,
        min_addon_version: minAddon,
      }),
    });
    if (!res.ok) throw new Error(`Failed to save for ${name}`);
  };

  const handleSave = async () => {
    if (!instanceName) return;
    setSaving(true);
    try {
      await upsertOne(instanceName);
      setInstanceName("");
      setMinParser("");
      setMinAddon("");
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleSetAll = async () => {
    if (!instanceNames?.length || (!minParser && !minAddon)) return;
    setSettingAll(true);
    try {
      // Build a lookup of existing requirements by instance name
      const existing = new Map<string, LeaderboardVersionRequirements>();
      if (requirements) {
        for (const req of requirements) {
          existing.set(req.instance_name, req);
        }
      }
      await Promise.all(instanceNames.map((name) => {
        const prev = existing.get(name);
        const res = fetch("/api/v1/admin/leaderboard/version-requirements", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instance_name: name,
            min_parser_version: minParser || prev?.min_parser_version || "",
            min_addon_version: minAddon || prev?.min_addon_version || "",
          }),
        });
        return res;
      }));
      setMinParser("");
      setMinAddon("");
      refetch();
    } finally {
      setSettingAll(false);
    }
  };

  const handleEdit = (req: LeaderboardVersionRequirements) => {
    setInstanceName(req.instance_name);
    setMinParser(req.min_parser_version);
    setMinAddon(req.min_addon_version);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Leaderboard Version Requirements</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Set minimum parser and addon versions for leaderboard entries. Runs below these versions are filtered out.
        </p>
        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Instance Name</label>
            <input
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-zinc-700 bg-zinc-900"
              placeholder="Molten Core"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Min Parser Version</label>
            <input
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-zinc-700 bg-zinc-900"
              placeholder="v0.0.425"
              value={minParser}
              onChange={(e) => setMinParser(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Min Addon Version</label>
            <input
              className="w-full mt-1 px-2 py-1.5 text-sm rounded border border-zinc-700 bg-zinc-900"
              placeholder="0.25"
              value={minAddon}
              onChange={(e) => setMinAddon(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || !instanceName}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleSetAll} disabled={settingAll || (!minParser && !minAddon)}>
            {settingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set All"}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : requirements && requirements.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-muted-foreground text-left">
                <th className="py-2 pr-4">Instance</th>
                <th className="py-2 pr-4">Min Parser</th>
                <th className="py-2 pr-4">Min Addon</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {requirements.map((req) => (
                <tr key={req.instance_name} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4">{req.instance_name}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{req.min_parser_version || "—"}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{req.min_addon_version || "—"}</td>
                  <td className="py-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(req)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No version requirements configured. All qualified runs will appear on leaderboards.
          </p>
        )}
      </Card>
    </div>
  );
}
