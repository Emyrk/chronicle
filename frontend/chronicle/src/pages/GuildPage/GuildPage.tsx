import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import type { DeviceVisibility } from "@/api/typesGenerated";
import { useGuildPage } from "@/api/queries";
import { GuildPageCanvas, TabBar, GuildPageHeader } from "./components";
import { Shield, Pencil, PanelLeft, MoreVertical, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { useIsMobile } from "@/hooks/useIsMobile";

// Helper to check if an item should be visible on current device
function isVisibleOnDevice(visibility: DeviceVisibility | undefined, isMobile: boolean): boolean {
  if (!visibility || visibility === "all") return true;
  if (visibility === "mobile") return isMobile;
  if (visibility === "desktop") return !isMobile;
  return true;
}

export function GuildPage() {
  const { guildId, tabSlug } = useParams<{ guildId: string; tabSlug?: string }>();
  const [activeTab, setActiveTab] = useState<string>(tabSlug || "overview");
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const { data: pageConfig, isLoading, error } = useGuildPage(guildId);

  // Filter tabs and panels based on device visibility
  const visibleTabs = useMemo(() => {
    if (!pageConfig?.tabs) return [];
    return pageConfig.tabs
      .filter((tab) => isVisibleOnDevice(tab.visibility, isMobile))
      .map((tab) => ({
        ...tab,
        panels: tab.panels.filter((panel) => isVisibleOnDevice(panel.visibility, isMobile)),
      }));
  }, [pageConfig?.tabs, isMobile]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !pageConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Guild Page Not Found</h2>
        <p className="text-muted-foreground">
          This guild doesn't have a public page yet.
        </p>
        <Link to="/" className="mt-4 text-primary hover:underline">
          Back to Home
        </Link>
      </div>
    );
  }

  const currentTab = visibleTabs.find((t) => t.slug === activeTab) || visibleTabs[0];
  const showSidebar = visibleTabs.length > 1;

  return (
    <div className="relative w-full px-4">
      {/* Guild actions menu pinned top-right */}
      {(pageConfig.guild.can_edit || pageConfig.guild.can_view_roster) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="absolute top-2 right-4 z-10 hidden md:flex h-8 w-8"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {pageConfig.guild.can_edit && (
              <DropdownMenuItem asChild>
                <Link to={`/guilds/${guildId}/edit`}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Page
                </Link>
              </DropdownMenuItem>
            )}
            {pageConfig.guild.can_view_roster && (
              <DropdownMenuItem asChild>
                <Link to={`/guilds/${guildId}/roster`}>
                  <Users className="h-4 w-4 mr-2" />
                  View Members
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <GuildPageHeader guild={pageConfig.guild} theme={pageConfig.theme} />

      {/* Sidebar + Content */}
      <div className="flex gap-6 relative">
        {showSidebar && (
          <>
            <TabBar
              tabs={visibleTabs}
              activeTab={activeTab}
              isEditing={false}
              isMobile={isMobile}
              sidebarOpen={sidebarOpen}
              onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
              onTabChange={setActiveTab}
            />

            {/* Desktop: inline toggle when sidebar closed */}
            {!sidebarOpen && !isMobile && (
              <div className="shrink-0 border-r border-border pr-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(true)}
                  title="Show sidebar"
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {currentTab && (
            <GuildPageCanvas
              guild={pageConfig.guild}
              panels={currentTab.panels}
              isEditing={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
