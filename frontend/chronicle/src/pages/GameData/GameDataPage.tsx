import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Database, Package, FileCode, HardDrive, Boxes, Menu, X, FlaskConical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useIsMobile";

type Tab = {
  path: string;
  label: string;
  icon: LucideIcon;
};

const tabs: Tab[] = [
  { path: "/game-data/datasets", label: "Datasets", icon: Boxes },
  { path: "/game-data/consumables", label: "Consumables", icon: FlaskConical },
  { path: "/game-data/wdb", label: "WDB", icon: Package },
  { path: "/game-data/import-sql", label: "Import SQL", icon: FileCode },
  { path: "/game-data/dbc", label: "DBC Import", icon: HardDrive },
];

export function GameDataLayout() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
            aria-label="Close game data menu"
          />
        ) : null}

        <nav
          className={`fixed left-0 top-0 z-50 h-full w-72 border-r bg-background p-4 shadow-xl transition-transform duration-200 ${
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Database className="h-5 w-5" />
              Game Data
            </h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Collapse game data menu"
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
            Open game data menu
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
          <Database className="h-5 w-5" />
          Game Data
        </h1>
        {renderNavLinks(false)}
      </nav>

      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
