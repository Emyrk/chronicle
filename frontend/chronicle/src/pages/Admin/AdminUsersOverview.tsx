import { useState, useMemo } from "react";
import {
  useAdminUsers,
  useResyncUserRoles,
  useUpsertUserGrant,
  useSetUserRoles,
  useSetUserRetention,
  type User,
} from "@/api/queries";
import {
  RefreshCw,
  Users,
  ShieldCheck,
  Shield,
  Loader2,
  HardDrive,
  Check,
  Pencil,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  Megaphone,
  Database,
  ListTodo,
  Upload,
  Trophy,
  Clock,
} from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { bytesToMegabytes, formatStorageBytes, megabytesToBytes } from "@/utils/storage";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSIGNABLE_ROLES = [
  { value: "technical_admin", label: "Tech Admin", icon: ShieldCheck, className: "bg-purple-500/15 text-purple-400" },
  { value: "admin", label: "Admin", icon: Shield, className: "bg-blue-500/15 text-blue-400" },
  { value: "upload_capable", label: "Upload Capable", icon: Upload, className: "bg-green-500/15 text-green-400" },
  { value: "moderate_logs", label: "Moderate Logs", icon: Eye, className: "bg-cyan-500/15 text-cyan-400" },
  { value: "moderate_guilds", label: "Moderate Guilds", icon: Megaphone, className: "bg-teal-500/15 text-teal-400" },
  { value: "is_admin_users", label: "Admin Users", icon: Users, className: "bg-indigo-500/15 text-indigo-400" },
  { value: "is_admin_queues", label: "Admin Queues", icon: ListTodo, className: "bg-orange-500/15 text-orange-400" },
  { value: "is_admin_game_data", label: "Admin Game Data", icon: Database, className: "bg-pink-500/15 text-pink-400" },
  { value: "is_admin_raid_requirements", label: "Admin Raid Req", icon: Trophy, className: "bg-amber-500/15 text-amber-400" },
] as const;

const ROLE_LOOKUP = new Map<string, (typeof ASSIGNABLE_ROLES)[number]>(ASSIGNABLE_ROLES.map((r) => [r.value, r]));

type SortField = "username" | "storage_used" | "storage_limit" | "storage_pct" | "created_at";
type SortOrder = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storagePct(user: User): number {
  return user.max_storage_bytes > 0
    ? Math.min((user.consumed_storage_bytes / user.max_storage_bytes) * 100, 100)
    : 0;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_LOOKUP.get(role);
  if (!cfg) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-secondary text-muted-foreground">
        {role}
      </span>
    );
  }
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// --- Storage bar -----------------------------------------------------------

interface StorageBarProps {
  consumed: number;
  max: number;
  onEditLimit?: (newMaxBytes: number) => void;
  isSaving?: boolean;
}

function StorageBar({ consumed, max, onEditLimit, isSaving }: StorageBarProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(bytesToMegabytes(max).toString());
  const percentage = max > 0 ? Math.min((consumed / max) * 100, 100) : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  const handleSave = () => {
    const mbValue = parseInt(inputValue, 10);
    if (!isNaN(mbValue) && mbValue >= 0 && onEditLimit) {
      onEditLimit(megabytesToBytes(mbValue));
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    else if (e.key === "Escape") {
      setEditing(false);
      setInputValue(bytesToMegabytes(max).toString());
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <HardDrive className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1">
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              isAtLimit ? "bg-destructive" : isNearLimit ? "bg-yellow-500" : "bg-primary"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-0.5">
          <span>{formatStorageBytes(consumed)}</span>
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
                setInputValue(bytesToMegabytes(max).toString());
                setEditing(true);
              }}
              className="flex items-center gap-1 hover:text-foreground"
              title="Click to edit limit"
            >
              <span>{formatStorageBytes(max)}</span>
              {onEditLimit && <Pencil className="h-2.5 w-2.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Sort header -----------------------------------------------------------

function SortHeader({
  label,
  field,
  current,
  order,
  onToggle,
  className,
}: {
  label: string;
  field: SortField;
  current: SortField;
  order: SortOrder;
  onToggle: (f: SortField) => void;
  className?: string;
}) {
  const isActive = current === field;
  return (
    <button
      onClick={() => onToggle(field)}
      className={`flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ${className ?? ""}`}
    >
      {label}
      {isActive ? (
        order === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

// --- Role editor -----------------------------------------------------------

function RoleEditor({
  user,
  onSave,
  isSaving,
}: {
  user: User;
  onSave: (roles: string[]) => void;
  isSaving: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(user.roles));

  const toggle = (role: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const hasChanges = useMemo(() => {
    const current = new Set(user.roles);
    if (current.size !== selected.size) return true;
    for (const r of selected) {
      if (!current.has(r)) return true;
    }
    return false;
  }, [user.roles, selected]);

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="flex flex-wrap gap-2">
        {ASSIGNABLE_ROLES.map((role) => {
          const checked = selected.has(role.value);
          const Icon = role.icon;
          return (
            <button
              key={role.value}
              onClick={() => toggle(role.value)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                checked
                  ? `${role.className} border-current`
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              <Icon className="h-3 w-3" />
              {role.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Button
          size="sm"
          disabled={!hasChanges || isSaving}
          onClick={() => onSave(Array.from(selected))}
          className="gap-1.5"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save Roles
        </Button>
        {!hasChanges && (
          <span className="text-xs text-muted-foreground">No changes</span>
        )}
      </div>
    </div>
  );
}

// --- Retention editor ------------------------------------------------------

function RetentionEditor({
  user,
  onSave,
  isSaving,
}: {
  user: User;
  onSave: (hours: number) => void;
  isSaving: boolean;
}) {
  const currentHours = user.raw_log_retention_hours;
  const [inputValue, setInputValue] = useState(
    currentHours != null ? currentHours.toString() : ""
  );

  const handleSave = () => {
    const parsed = inputValue.trim() === "" ? 0 : parseInt(inputValue, 10);
    if (isNaN(parsed) || parsed < 0) return;
    onSave(parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    else if (e.key === "Escape") {
      setInputValue(currentHours != null ? currentHours.toString() : "");
    }
  };

  const displayValue =
    currentHours != null
      ? currentHours >= 24
        ? `${Math.round(currentHours / 24)}d`
        : `${currentHours}h`
      : "Forever";

  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          placeholder="∞"
          className="w-16 px-1.5 py-0.5 text-xs bg-secondary rounded border-0 text-right"
          min={0}
        />
        <span className="text-[10px] text-muted-foreground">hrs</span>
        {isSaving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <button onClick={handleSave} className="text-muted-foreground hover:text-foreground">
            <Check className="h-3 w-3" />
          </button>
        )}
        <span className="text-[10px] text-muted-foreground">({displayValue})</span>
      </div>
    </div>
  );
}

// --- Filter bar ------------------------------------------------------------

interface Filters {
  roles: Set<string>;
  noRoles: boolean;
  storageUsedMin: string;
  storageUsedMax: string;
  storageLimitMin: string;
  storageLimitMax: string;
  storagePctMin: string;
  storagePctMax: string;
}

const EMPTY_FILTERS: Filters = {
  roles: new Set(),
  noRoles: false,
  storageUsedMin: "",
  storageUsedMax: "",
  storageLimitMin: "",
  storageLimitMax: "",
  storagePctMin: "",
  storagePctMax: "",
};

function hasActiveFilters(f: Filters): boolean {
  return (
    f.roles.size > 0 ||
    f.noRoles ||
    f.storageUsedMin !== "" ||
    f.storageUsedMax !== "" ||
    f.storageLimitMin !== "" ||
    f.storageLimitMax !== "" ||
    f.storagePctMin !== "" ||
    f.storagePctMax !== ""
  );
}

function FilterPanel({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const toggleRole = (role: string) => {
    const next = new Set(filters.roles);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    onChange({ ...filters, roles: next });
  };

  return (
    <Card className="p-4 space-y-4">
      {/* Role filter */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Roles</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onChange({ ...filters, noRoles: !filters.noRoles })}
            className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors ${
              filters.noRoles
                ? "bg-secondary text-foreground border-foreground/30"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            No roles
          </button>
          {ASSIGNABLE_ROLES.map((role) => {
            const active = filters.roles.has(role.value);
            return (
              <button
                key={role.value}
                onClick={() => toggleRole(role.value)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors ${
                  active
                    ? `${role.className} border-current`
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {role.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Storage range filters */}
      <div className="grid grid-cols-3 gap-4">
        <RangeFilter
          label="Storage Used (MB)"
          min={filters.storageUsedMin}
          max={filters.storageUsedMax}
          onMinChange={(v) => onChange({ ...filters, storageUsedMin: v })}
          onMaxChange={(v) => onChange({ ...filters, storageUsedMax: v })}
        />
        <RangeFilter
          label="Storage Limit (MB)"
          min={filters.storageLimitMin}
          max={filters.storageLimitMax}
          onMinChange={(v) => onChange({ ...filters, storageLimitMin: v })}
          onMaxChange={(v) => onChange({ ...filters, storageLimitMax: v })}
        />
        <RangeFilter
          label="Storage % Used"
          min={filters.storagePctMin}
          max={filters.storagePctMax}
          onMinChange={(v) => onChange({ ...filters, storagePctMin: v })}
          onMaxChange={(v) => onChange({ ...filters, storagePctMax: v })}
          suffix="%"
        />
      </div>
    </Card>
  );
}

function RangeFilter({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
  suffix,
}: {
  label: string;
  min: string;
  max: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          placeholder="Min"
          value={min}
          onChange={(e) => onMinChange(e.target.value)}
          className="w-full px-2 py-1 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          min={0}
        />
        <span className="text-xs text-muted-foreground">–</span>
        <input
          type="number"
          placeholder="Max"
          value={max}
          onChange={(e) => onMaxChange(e.target.value)}
          className="w-full px-2 py-1 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          min={0}
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

// --- Active filter pills ---------------------------------------------------

function FilterPills({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const pills: { label: string; clear: () => void }[] = [];

  if (filters.noRoles) {
    pills.push({ label: "No roles", clear: () => onChange({ ...filters, noRoles: false }) });
  }
  for (const role of filters.roles) {
    const cfg = ROLE_LOOKUP.get(role);
    pills.push({
      label: `Role: ${cfg?.label ?? role}`,
      clear: () => {
        const next = new Set(filters.roles);
        next.delete(role);
        onChange({ ...filters, roles: next });
      },
    });
  }
  if (filters.storageUsedMin || filters.storageUsedMax) {
    pills.push({
      label: `Used: ${filters.storageUsedMin || "0"}–${filters.storageUsedMax || "∞"} MB`,
      clear: () => onChange({ ...filters, storageUsedMin: "", storageUsedMax: "" }),
    });
  }
  if (filters.storageLimitMin || filters.storageLimitMax) {
    pills.push({
      label: `Limit: ${filters.storageLimitMin || "0"}–${filters.storageLimitMax || "∞"} MB`,
      clear: () => onChange({ ...filters, storageLimitMin: "", storageLimitMax: "" }),
    });
  }
  if (filters.storagePctMin || filters.storagePctMax) {
    pills.push({
      label: `%Used: ${filters.storagePctMin || "0"}–${filters.storagePctMax || "100"}%`,
      clear: () => onChange({ ...filters, storagePctMin: "", storagePctMax: "" }),
    });
  }

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((p) => (
        <span
          key={p.label}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent text-accent-foreground"
        >
          {p.label}
          <button onClick={p.clear} className="hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        onClick={() => onChange({ ...EMPTY_FILTERS })}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User row
// ---------------------------------------------------------------------------

interface UserRowProps {
  user: User;
  expanded: boolean;
  onToggleExpand: () => void;
  onResync: () => void;
  isSyncing: boolean;
  onEditLimit: (newMaxBytes: number) => void;
  isSavingLimit: boolean;
  onSaveRoles: (roles: string[]) => void;
  isSavingRoles: boolean;
  onSaveRetention: (hours: number) => void;
  isSavingRetention: boolean;
}

function UserRow({
  user,
  expanded,
  onToggleExpand,
  onResync,
  isSyncing,
  onEditLimit,
  isSavingLimit,
  onSaveRoles,
  isSavingRoles,
  onSaveRetention,
  isSavingRetention,
}: UserRowProps) {
  const pct = storagePct(user);

  return (
    <div className={expanded ? "bg-accent/30" : ""}>
      <div
        className="group py-3 px-4 hover:bg-accent/50 transition-colors cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-4">
          {/* Expand chevron */}
          <button className="text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {/* User info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{user.username}</span>
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {!user.roles || user.roles.length === 0 ? (
                <span className="text-xs text-muted-foreground italic">No roles</span>
              ) : (
                user.roles.map((role) => <RoleBadge key={role} role={role} />)
              )}
            </div>
          </div>

          {/* Storage */}
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
              {pct.toFixed(0)}%
            </span>
            <StorageBar
              consumed={user.consumed_storage_bytes}
              max={user.max_storage_bytes}
              onEditLimit={onEditLimit}
              isSaving={isSavingLimit}
            />
          </div>

          {/* Date */}
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(user.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>

          {/* Resync */}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onResync();
            }}
            disabled={isSyncing}
            className="h-8"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
            Resync
          </Button>
        </div>
      </div>

      {/* Expanded editors */}
      {expanded && (
        <div className="space-y-2">
          <RoleEditor user={user} onSave={onSaveRoles} isSaving={isSavingRoles} />
          <div className="px-4 pb-3 flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Raw Log Retention:</span>
            <RetentionEditor user={user} onSave={onSaveRetention} isSaving={isSavingRetention} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdminUsersOverview() {
  const { data: usersData, isLoading, error } = useAdminUsers();
  const resyncMutation = useResyncUserRoles();
  const upsertGrantMutation = useUpsertUserGrant();
  const setRolesMutation = useSetUserRoles();
  const setRetentionMutation = useSetUserRetention();

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [savingLimitId, setSavingLimitId] = useState<string | null>(null);
  const [savingRolesId, setSavingRolesId] = useState<string | null>(null);
  const [savingRetentionId, setSavingRetentionId] = useState<string | null>(null);

  // --- Filtering + sorting (client-side) ---
  const filteredUsers = useMemo(() => {
    if (!usersData?.users) return [];
    let users = [...usersData.users];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      users = users.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q),
      );
    }

    // Role filter
    if (filters.roles.size > 0) {
      users = users.filter((u) =>
        u.roles.some((r) => filters.roles.has(r)),
      );
    }
    if (filters.noRoles) {
      users = users.filter((u) => !u.roles || u.roles.length === 0);
    }

    // Storage used
    const usedMin = filters.storageUsedMin ? megabytesToBytes(parseFloat(filters.storageUsedMin)) : null;
    const usedMax = filters.storageUsedMax ? megabytesToBytes(parseFloat(filters.storageUsedMax)) : null;
    if (usedMin !== null) users = users.filter((u) => u.consumed_storage_bytes >= usedMin);
    if (usedMax !== null) users = users.filter((u) => u.consumed_storage_bytes <= usedMax);

    // Storage limit
    const limMin = filters.storageLimitMin ? megabytesToBytes(parseFloat(filters.storageLimitMin)) : null;
    const limMax = filters.storageLimitMax ? megabytesToBytes(parseFloat(filters.storageLimitMax)) : null;
    if (limMin !== null) users = users.filter((u) => u.max_storage_bytes >= limMin);
    if (limMax !== null) users = users.filter((u) => u.max_storage_bytes <= limMax);

    // Storage %
    const pctMin = filters.storagePctMin ? parseFloat(filters.storagePctMin) : null;
    const pctMax = filters.storagePctMax ? parseFloat(filters.storagePctMax) : null;
    if (pctMin !== null) users = users.filter((u) => storagePct(u) >= pctMin);
    if (pctMax !== null) users = users.filter((u) => storagePct(u) <= pctMax);

    // Sort
    users.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "username":
          cmp = a.username.localeCompare(b.username);
          break;
        case "storage_used":
          cmp = a.consumed_storage_bytes - b.consumed_storage_bytes;
          break;
        case "storage_limit":
          cmp = a.max_storage_bytes - b.max_storage_bytes;
          break;
        case "storage_pct":
          cmp = storagePct(a) - storagePct(b);
          break;
        case "created_at":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return users;
  }, [usersData?.users, searchQuery, filters, sortField, sortOrder]);

  // --- Handlers ---
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleResync = async (userId: string) => {
    setSyncingId(userId);
    try {
      await resyncMutation.mutateAsync(userId);
      toast.success("Roles resynced from Discord");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resync");
    } finally {
      setSyncingId(null);
    }
  };

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

  const handleSaveRoles = async (userId: string, roles: string[]) => {
    setSavingRolesId(userId);
    try {
      await setRolesMutation.mutateAsync({ userId, roles });
      toast.success("Roles updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update roles");
    } finally {
      setSavingRolesId(null);
    }
  };

  const handleSaveRetention = async (userId: string, hours: number) => {
    setSavingRetentionId(userId);
    try {
      await setRetentionMutation.mutateAsync({ userId, rawLogRetentionHours: hours });
      toast.success(hours > 0 ? `Retention set to ${hours}h` : "Retention set to forever");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update retention");
    } finally {
      setSavingRetentionId(null);
    }
  };

  // --- Loading / error states ---
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 className="font-semibold text-lg text-destructive">Error Loading Users</h2>
          <p className="text-muted-foreground mt-1">{error.message}</p>
        </div>
      </Card>
    );
  }

  const totalCount = usersData?.users.length ?? 0;
  const showingCount = filteredUsers.length;
  const isFiltered = hasActiveFilters(filters) || searchQuery.trim() !== "";

  return (
    <div className="space-y-4">
      {/* Search + filter toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by username, email, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant={filtersOpen ? "secondary" : "outline"}
          size="sm"
          onClick={() => setFiltersOpen((v) => !v)}
          className="gap-1.5"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {hasActiveFilters(filters) && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-primary text-primary-foreground">
              !
            </span>
          )}
        </Button>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {isFiltered ? `${showingCount} of ${totalCount}` : `${totalCount} users`}
        </span>
      </div>

      {/* Filter panel */}
      {filtersOpen && <FilterPanel filters={filters} onChange={setFilters} />}

      {/* Active filter pills */}
      {hasActiveFilters(filters) && <FilterPills filters={filters} onChange={setFilters} />}

      {/* Column headers */}
      <div className="flex items-center gap-4 px-4 py-2 border-b">
        <div className="w-4" /> {/* chevron spacer */}
        <SortHeader label="Username" field="username" current={sortField} order={sortOrder} onToggle={toggleSort} className="flex-1" />
        <SortHeader label="%" field="storage_pct" current={sortField} order={sortOrder} onToggle={toggleSort} className="w-10 justify-end" />
        <SortHeader label="Storage" field="storage_limit" current={sortField} order={sortOrder} onToggle={toggleSort} className="min-w-[180px]" />
        <SortHeader label="Joined" field="created_at" current={sortField} order={sortOrder} onToggle={toggleSort} className="w-24" />
        <div className="w-[88px]" /> {/* resync spacer */}
      </div>

      {/* Users list */}
      {filteredUsers.length === 0 ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <Users className="h-12 w-12 text-muted-foreground" />
            <div>
              <h2 className="font-semibold text-lg">No Users Found</h2>
              <p className="text-muted-foreground mt-1">
                {isFiltered
                  ? "No users match the current search or filters."
                  : "There are no users in the system."}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden divide-y divide-border/50">
          {filteredUsers.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              expanded={expandedUserId === user.id}
              onToggleExpand={() =>
                setExpandedUserId((prev) => (prev === user.id ? null : user.id))
              }
              onResync={() => handleResync(user.id)}
              isSyncing={syncingId === user.id}
              onEditLimit={(newMaxBytes) => handleEditLimit(user.id, newMaxBytes)}
              isSavingLimit={savingLimitId === user.id}
              onSaveRoles={(roles) => handleSaveRoles(user.id, roles)}
              isSavingRoles={savingRolesId === user.id}
              onSaveRetention={(hours) => handleSaveRetention(user.id, hours)}
              isSavingRetention={savingRetentionId === user.id}
            />
          ))}
        </Card>
      )}
    </div>
  );
}
