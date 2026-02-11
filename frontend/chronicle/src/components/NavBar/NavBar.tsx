import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Settings, Upload, LogOut, FileText, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthorizationCheck } from "@/api/queries";
import { Button } from "../ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "../ui/NavigationMenu/navigation-menu";

type NavItem = {
  title: string;
  icon: LucideIcon;
} & ({ href: string } | { onClick: () => void });

export function NavBar() {
  const location = useLocation();
  const { isAuthenticated, isLoading, logout } = useAuth();

  // Check admin permission via SpiceDB
  const authzChecks = useMemo(() => ({
    admin: "chronicle:chronicle#admin_users",
  }), []);
  const { data: authz } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated,
  });
  const isAdmin = authz?.admin ?? false;

  const accountMenuItems: NavItem[] = [
    { title: "My Logs", href: "/logs", icon: FileText },
    { title: "Upload", href: "/upload", icon: Upload },
    ...(isAdmin ? [{ title: "Admin", href: "/admin", icon: Shield } as NavItem] : []),
    { title: "Settings", href: "/account/settings", icon: Settings },
    { title: "Sign Out", onClick: logout, icon: LogOut },
  ];

  return (
    <nav className="flex items-center justify-between p-4 border-b">
      <Link to="/" className="text-xl font-bold">
        Chronicle
      </Link>
      <div>
        {isLoading ? null : isAuthenticated ? (
          <NavigationMenu className="justify-end">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Account</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[200px] gap-4">
                    <li>
                      {accountMenuItems.map((item) => (
                        <NavigationMenuLink key={item.title} asChild>
                          {"href" in item ? (
                            <Link to={item.href} className="flex-row items-center gap-2">
                              <item.icon />
                              {item.title}
                            </Link>
                          ) : (
                            <button onClick={item.onClick} className="flex-row items-center gap-2 w-full">
                              <item.icon />
                              {item.title}
                            </button>
                          )}
                        </NavigationMenuLink>
                      ))}
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        ) : (
          <Link
            to={`/login?from=${encodeURIComponent(location.pathname + location.search)}`}
          >
            <Button>Sign In</Button>
          </Link>
        )}
      </div>
    </nav>
  );
}
