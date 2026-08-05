import { useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/hooks/useAuth";
import { useAuthorizationCheck } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import {
  Users,
  FileText,
  Trophy,
  Shield,
  ShieldCheck,
  HardDrive,
  FlaskConical,
  RefreshCw,
  Menu,
  X,
  Loader2,
  ClipboardList,
  Database,
  Camera,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Tab = {
  path: string;
  label: string;
  icon: LucideIcon;
};

const tabs: Tab[] = [
  { path: "/admin/users-overview", label: "Users", icon: Users },
  { path: "/admin/logs", label: "Logs", icon: FileText },
  { path: "/admin/leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "/admin/site-settings", label: "Site Settings", icon: Shield },
  { path: "/admin/users", label: "Manage Users", icon: Users },
  { path: "/admin/storage", label: "Storage Grants", icon: HardDrive },
  { path: "/admin/regression", label: "Regression", icon: FlaskConical },
  { path: "/admin/outdated-instances", label: "Outdated Instances", icon: RefreshCw },
  { path: "/admin/applications", label: "Applications", icon: ClipboardList },
  { path: "/admin/cache-stats", label: "Cache Stats", icon: Database },
  { path: "/admin/parsing", label: "Parsing", icon: Camera },
  { path: "/admin/gear-builder", label: "Gear Builder", icon: Wrench },
];

export function AdminLayout() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const authzChecks = useMemo(
    () => ({
      admin: "chronicle:chronicle#admin_users",
    }),
    [],
  );
  const { data: authz, isLoading: authzLoading } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated,
  });
  const isAdmin = authz?.admin ?? false;

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

  const renderNavLinks = (closeOnNavigate: boolean) => (
    <ul className="space-y-1">
      {tabs.map((tab) => (
        <li key={tab.path}>
          <Link
            to={tab.path}
            onClick={closeOnNavigate ? () => setMobileSidebarOpen(false) : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              location.pathname === tab.path
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  if (isMobile) {
    return (
      <div className="relative min-h-[calc(100vh-8rem)]">
        {mobileSidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close admin menu"
          />
        ) : null}

        <nav
          className={`fixed left-0 top-0 z-50 h-full w-72 border-r bg-background p-4 shadow-xl transition-transform duration-200 ${
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Administration
            </h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Collapse admin menu"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {renderNavLinks(true)}
        </nav>

        <main className="p-4">
          <Button
            variant="outline"
            size="sm"
            className="mb-4 gap-2"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
            Open admin menu
          </Button>
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)]">
      <nav className="w-64 border-r p-4">
        <h1 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Administration
        </h1>
        {renderNavLinks(false)}
      </nav>

      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
