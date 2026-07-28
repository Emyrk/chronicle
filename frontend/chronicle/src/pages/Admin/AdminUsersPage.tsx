import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useAdminUsers,
  useResyncUserRoles,
  useUserGrants,
  useDeleteUserGrant,
  type User,
  type DataGrant,
} from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { UserCharactersSection } from "./UserCharactersSection";
import { Button } from "@/components/ui/button";
import {
  Users,
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  HardDrive,
  Shield,
  ShieldCheck,
  TestTube,
  Calendar,
  Mail,
  Gift,
  Trash2,
  Clock,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

const ROLE_CONFIG: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  technical_admin: {
    icon: <ShieldCheck className="h-3 w-3" />,
    label: "Tech Admin",
    className: "bg-purple-500/15 text-purple-500",
  },
  admin: {
    icon: <Shield className="h-3 w-3" />,
    label: "Admin",
    className: "bg-blue-500/15 text-blue-500",
  },
  alpha_tester: {
    icon: <TestTube className="h-3 w-3" />,
    label: "Alpha Tester",
    className: "bg-green-500/15 text-green-500",
  },
};

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] ?? {
    icon: null,
    label: role.replace(/_/g, " "),
    className: "bg-muted text-muted-foreground",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  base: "Base Allocation",
  support: "Supporter Bonus",
  "alpha-tester": "Alpha Tester",
  "beta-tester": "Beta Tester",
  promotion: "Promotion",
  gift: "Gift",
};

function formatSource(source: string): string {
  return SOURCE_LABELS[source] || source.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatExpirationDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Expired";
  if (diffDays === 0) return "Expires today";
  if (diffDays === 1) return "Expires tomorrow";
  if (diffDays <= 7) return `${diffDays}d left`;
  if (diffDays <= 30) return `${Math.ceil(diffDays / 7)}w left`;

  return date.toLocaleDateString();
}

// Compact grant row for user details
function GrantRow({ grant, userId }: { grant: DataGrant; userId: string }) {
  const deleteMutation = useDeleteUserGrant();

  const isExpired = grant.expires_at && new Date(grant.expires_at) < new Date();
  const isExpiringSoon =
    grant.expires_at &&
    !isExpired &&
    new Date(grant.expires_at).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000;

  const handleDelete = async () => {
    if (grant.source === "base") {
      if (!confirm("Delete base grant? User will have 0 storage.")) return;
    }
    await deleteMutation.mutateAsync({ userId, source: grant.source });
  };

  return (
    <div className={`flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 group ${isExpired ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm">{formatSource(grant.source)}</span>
        {grant.expires_at && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded ${
              isExpired
                ? "bg-destructive/15 text-destructive"
                : isExpiringSoon
                ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Clock className="h-2.5 w-2.5" />
            {formatExpirationDate(grant.expires_at)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{formatBytes(grant.storage_bytes)}</span>
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive p-1"
        >
          {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

interface UserRowProps {
  user: User;
}

function UserRow({ user }: UserRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const resyncMutation = useResyncUserRoles();
  const { data: grants, isLoading: grantsLoading } = useUserGrants(user.id, { enabled: expanded });

  const percentage = user.max_storage_bytes > 0 
    ? Math.min((user.consumed_storage_bytes / user.max_storage_bytes) * 100, 100) 
    : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(user.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="border-b last:border-b-0">
      {/* Main row - clickable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}

        {/* User info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{user.username}</span>
            <span className="text-sm text-muted-foreground truncate">{user.email}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {!user.roles || user.roles.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">No roles</span>
            ) : (
              user.roles.map((role) => <RoleBadge key={role} role={role} />)
            )}
          </div>
        </div>

        {/* Storage bar */}
        <div className="flex items-center gap-2 min-w-[160px]">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isAtLimit ? "bg-destructive" : isNearLimit ? "bg-yellow-500" : "bg-primary"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>{formatBytes(user.consumed_storage_bytes)}</span>
              <span>{formatBytes(user.max_storage_bytes)}</span>
            </div>
          </div>
        </div>

        {/* Join date */}
        <div className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
          {new Date(user.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pl-12 space-y-4">
          {/* User details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1">User ID</div>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{user.id}</code>
                <button onClick={handleCopyId} className="text-muted-foreground hover:text-foreground">
                  {copiedId ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Email</div>
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span>{user.email}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Joined</div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span>{new Date(user.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Actions</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resyncMutation.mutate(user.id)}
                disabled={resyncMutation.isPending}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
                Resync Roles
              </Button>
            </div>
          </div>

          {/* Linked characters */}
          <UserCharactersSection userId={user.id} enabled={expanded} />

          {/* Storage grants */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Gift className="h-4 w-4 text-muted-foreground" />
                Storage Grants
              </div>
              <Link
                to="/admin/storage"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Manage
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {grantsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : grants && grants.length > 0 ? (
              <div className="border rounded-lg divide-y">
                {grants.map((grant) => (
                  <GrantRow key={grant.id} grant={grant} userId={user.id} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">No grants. User has no storage allocation.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type SortField = "username" | "email" | "created_at" | "storage";
type SortOrder = "asc" | "desc";

export function AdminUsersPage() {
  const { data: usersData, isLoading, error } = useAdminUsers();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const filteredAndSortedUsers = useMemo(() => {
    if (!usersData?.users) return [];

    let users = [...usersData.users];

    // Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      users = users.filter(
        (user) =>
          user.username.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.id.toLowerCase().includes(query)
      );
    }

    // Sort
    users.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "username":
          comparison = a.username.localeCompare(b.username);
          break;
        case "email":
          comparison = a.email.localeCompare(b.email);
          break;
        case "created_at":
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "storage":
          comparison = a.consumed_storage_bytes - b.consumed_storage_bytes;
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return users;
  }, [usersData?.users, searchQuery, sortField, sortOrder]);

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="p-6">
          <p className="text-destructive">Error loading users: {String(error)}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          User Management
        </h1>
        <p className="text-muted-foreground mt-1">
          View and manage users, roles, and storage allocations.
        </p>
      </div>

      {/* Search and sort controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by username, email, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort:</span>
          <select
            value={`${sortField}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split("-") as [SortField, SortOrder];
              setSortField(field);
              setSortOrder(order);
            }}
            className="px-3 py-2 bg-background border rounded-lg text-sm"
          >
            <option value="created_at-desc">Newest first</option>
            <option value="created_at-asc">Oldest first</option>
            <option value="username-asc">Username A-Z</option>
            <option value="username-desc">Username Z-A</option>
            <option value="storage-desc">Most storage used</option>
            <option value="storage-asc">Least storage used</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      {usersData && (
        <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
          <span>{filteredAndSortedUsers.length} users</span>
          {searchQuery && filteredAndSortedUsers.length !== usersData.users.length && (
            <span>(filtered from {usersData.users.length})</span>
          )}
        </div>
      )}

      {/* Users list */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAndSortedUsers.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            {searchQuery ? "No users match your search." : "No users found."}
          </div>
        ) : (
          filteredAndSortedUsers.map((user) => <UserRow key={user.id} user={user} />)
        )}
      </Card>
    </div>
  );
}
