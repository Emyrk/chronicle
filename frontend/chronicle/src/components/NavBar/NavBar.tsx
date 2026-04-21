import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Settings, Upload, LogOut, FileText, Shield, Key, Castle, Menu, Swords, Trophy, Database } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthorizationCheck } from "@/api/queries";
import { Button } from "../ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "../ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/DropdownMenu/DropdownMenu";

type NavItem = {
  title: string;
  icon: LucideIcon;
} & ({ href: string; external?: boolean } | { onClick: () => void });

export function NavBar() {
  const location = useLocation();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Check admin permissions via SpiceDB
  const authzChecks = useMemo(() => ({
    admin: "chronicle:chronicle#admin_users",
    adminAuthz: "chronicle:chronicle#administer_authz",
    adminWorldData: "chronicle:chronicle#admin_world_data",
  }), []);
  const { data: authz } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated,
  });
  const isAdmin = authz?.admin ?? false;
  const canAdminAuthz = authz?.adminAuthz ?? false;
  const canAdminWorldData = authz?.adminWorldData ?? false;

  const accountMenuItems: NavItem[] = [
    { title: "My Logs", href: "/logs", icon: FileText },
    { title: "Upload", href: "/upload", icon: Upload },
    ...(isAdmin ? [{ title: "Admin", href: "/admin", icon: Shield } as NavItem] : []),
    ...(canAdminWorldData ? [{ title: "Game Data", href: "/game-data", icon: Database } as NavItem] : []),
    ...(canAdminAuthz ? [{ title: "Saffron", href: "/saffron", icon: Key, external: true } as NavItem] : []),
    { title: "Settings", href: "/account/settings", icon: Settings },
    { title: "Sign Out", onClick: logout, icon: LogOut },
  ];

  const loginUrl = `/login?from=${encodeURIComponent(location.pathname + location.search)}`;

  // Reusable menu item renderer for mobile menu
  const renderMenuItem = (item: NavItem, closeMobile?: () => void) => {
    const className = "flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2";
    if ("href" in item) {
      if (item.external) {
        return (
          <a key={item.title} href={item.href} className={className} onClick={closeMobile}>
            <item.icon className="h-4 w-4" />
            {item.title}
          </a>
        );
      }
      return (
        <Link key={item.title} to={item.href} className={className} onClick={closeMobile}>
          <item.icon className="h-4 w-4" />
          {item.title}
        </Link>
      );
    }
    return (
      <button
        key={item.title}
        onClick={() => {
          item.onClick();
          closeMobile?.();
        }}
        className={`${className} w-full text-left`}
      >
        <item.icon className="h-4 w-4" />
        {item.title}
      </button>
    );
  };

  return (
    <nav className="relative flex items-center justify-between p-4 border-b">
      {/* Left: Mobile hamburger menu (visible on mobile only) */}
      <div className="md:hidden">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-6">
            <nav className="flex flex-col gap-2 mt-4">
              <Link
                to="/recent"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                <Castle className="h-4 w-4" />
                Recent Raids
              </Link>
              <Link
                to="/armory"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                <Swords className="h-4 w-4" />
                Armory
              </Link>
              <Link
                to="/leaderboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                <Trophy className="h-4 w-4" />
                Leaderboards
              </Link>
              {isAuthenticated && (
                <>
                  <div className="border-t my-2" />
                  {accountMenuItems.map((item) =>
                    renderMenuItem(item, () => setMobileMenuOpen(false))
                  )}
                </>
              )}
              {!isAuthenticated && !isLoading && (
                <>
                  <div className="border-t my-2" />
                  <Link to={loginUrl} onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full">Sign In</Button>
                  </Link>
                </>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      {/* Left spacer for desktop to balance layout */}
      <div className="hidden md:block w-10" />

      {/* Center: Logo (hidden on guild pages) */}
      {!location.pathname.startsWith("/g/") && (
        <Link to="/" className="absolute left-1/2 -translate-x-1/2 flex items-center">
          <img src="/c/chronicle/ChronicleLogoCenter.svg" alt="Chronicle" className="h-15 -my-2" />
        </Link>
      )}

      {/* Right: Desktop navigation (hidden on mobile) */}
      <div className="hidden md:flex items-center gap-6">
        <Link
          to="/recent"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Castle className="h-4 w-4" />
          Recent Raids
        </Link>
        <Link
          to="/armory"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Swords className="h-4 w-4" />
          Armory
        </Link>
        <Link
          to="/leaderboard"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Trophy className="h-4 w-4" />
          Leaderboards
        </Link>
        {isLoading ? null : isAuthenticated ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 px-4 text-sm font-medium">
                Account
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              {accountMenuItems.map((item) =>
                "href" in item ? (
                  <DropdownMenuItem key={item.title} asChild>
                    {item.external ? (
                      <a href={item.href} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {item.title}
                      </a>
                    ) : (
                      <Link to={item.href} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {item.title}
                      </Link>
                    )}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={item.title} onSelect={item.onClick} className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link to={loginUrl}>
            <Button>Sign In</Button>
          </Link>
        )}
      </div>

      {/* Right: Empty spacer for mobile to balance hamburger on left */}
      <div className="md:hidden w-10" />
    </nav>
  );
}
