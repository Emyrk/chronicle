import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  useAdminUsers, 
  useAdminLogs, 
  useResyncUserRoles,
  useAuthorizationCheck,
  type User,
  type AdminLog,
} from "@/api/queries";
import { useAuth } from "@/hooks/useAuth";
import { RefreshCw, Users, FileText, Shield, ShieldCheck, TestTube, Loader2, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";

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

function UserRow({ user, onResync, isSyncing }: { user: User; onResync: () => void; isSyncing: boolean }) {
  return (
    <div className="group py-3 px-4 hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{user.username}</span>
            <span className="text-xs text-muted-foreground truncate">{user.email}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {user.roles.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">No roles</span>
            ) : (
              user.roles.map((role) => <RoleBadge key={role} role={role} />)
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
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
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleResync = async (userId: string) => {
    setSyncingId(userId);
    try {
      await resyncMutation.mutateAsync(userId);
    } finally {
      setSyncingId(null);
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
      <span className="text-xs text-muted-foreground">
        {new Date(log.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function LogsSection({ logs }: { logs: readonly AdminLog[] }) {
  return (
    <Card className="overflow-hidden divide-y divide-border/50">
      {logs.map((log) => (
        <LogRow key={log.id} log={log} />
      ))}
    </Card>
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
  const { data: logsData, isLoading: logsLoading, error: logsError } = useAdminLogs();
  
  const [activeTab, setActiveTab] = useState<"users" | "logs">("users");

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
          {logsData && (
            <span className="ml-1 py-0.5 px-2 rounded-full text-xs bg-accent">
              {logsData.logs.length}
            </span>
          )}
        </Button>
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

      {activeTab === "logs" && (
        <>
          {logsLoading ? (
            <Card className="p-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading logs...</p>
              </div>
            </Card>
          ) : logsError ? (
            <Card className="p-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <div>
                  <h2 className="font-semibold text-lg text-destructive">Error Loading Logs</h2>
                  <p className="text-muted-foreground mt-1">{logsError.message}</p>
                </div>
              </div>
            </Card>
          ) : logsData && logsData.logs.length > 0 ? (
            <LogsSection logs={logsData.logs} />
          ) : (
            <Card className="p-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="font-semibold text-lg">No Logs Found</h2>
                  <p className="text-muted-foreground mt-1">There are no logs in the system.</p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
