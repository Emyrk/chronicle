import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { GuildPageConfig, DeviceVisibility } from "@/api/typesGenerated";
import { GuildPageCanvas, TabBar } from "./components";
import { ArrowLeft, Pencil, Shield } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

// Helper to check if an item should be visible on current device
function isVisibleOnDevice(visibility: DeviceVisibility | undefined, isMobile: boolean): boolean {
  if (!visibility || visibility === "all") return true;
  if (visibility === "mobile") return isMobile;
  if (visibility === "desktop") return !isMobile;
  return true;
}

// Fake data for development - will be replaced with API call
const FAKE_GUILD_PAGE: GuildPageConfig = {
  id: "fake-page-id",
  guild_id: "fake-guild-id",
  guild: {
    id: "fake-guild-id",
    name: "The Eternal Flame",
    realm_id: "fake-realm-id",
    realm_name: "Turtle WoW",
    has_page: true,
    can_edit: true,
  },
  theme: {
    primary_color: "#f59e0b",
  },
  tabs: [
    {
      id: "tab-1",
      label: "Overview",
      slug: "overview",
      sort_order: 0,
      visibility: "all",
      panels: [
        {
          id: "panel-1",
          panel_type: "stats",
          config: { showTotalKills: true, showRaidTime: true, showMembers: true },
          position: { x: 0, y: 0, w: 6, h: 2 },
          visibility: "all",
        },
        {
          id: "panel-2",
          panel_type: "leaderboard",
          config: { metric: "dps", limit: 5 },
          position: { x: 6, y: 0, w: 6, h: 3 },
          visibility: "desktop", // Example: hide complex leaderboard on mobile
        },
        {
          id: "panel-3",
          panel_type: "recent_raids",
          config: { limit: 5, showDate: true },
          position: { x: 0, y: 2, w: 6, h: 3 },
          visibility: "all",
        },
      ],
    },
    {
      id: "tab-2",
      label: "Progress",
      slug: "progress",
      sort_order: 1,
      visibility: "all",
      panels: [
        {
          id: "panel-4",
          panel_type: "progress",
          config: { instance: "mc" },
          position: { x: 0, y: 0, w: 12, h: 2 },
          visibility: "all",
        },
        {
          id: "panel-5",
          panel_type: "progress",
          config: { instance: "bwl" },
          position: { x: 0, y: 2, w: 12, h: 2 },
          visibility: "all",
        },
      ],
    },
    {
      id: "tab-3",
      label: "Roster",
      slug: "roster",
      sort_order: 2,
      visibility: "desktop", // Example: roster only on desktop
      panels: [
        {
          id: "panel-6",
          panel_type: "roster",
          config: { showClass: true, showRole: true },
          position: { x: 0, y: 0, w: 12, h: 4 },
          visibility: "all",
        },
      ],
    },
  ],
};

async function fetchGuildPage(guildId: string): Promise<GuildPageConfig> {
  // For now, return fake data
  // TODO: Replace with actual API call when connected
  void guildId; // Will be used when API is connected
  return FAKE_GUILD_PAGE;
}

export function GuildPage() {
  const { guildId, tabSlug } = useParams<{ guildId: string; tabSlug?: string }>();
  const [activeTab, setActiveTab] = useState<string>(tabSlug || "overview");
  const isMobile = useIsMobile();

  const { data: pageConfig, isLoading, error } = useQuery({
    queryKey: ["guild-page", guildId],
    queryFn: () => fetchGuildPage(guildId!),
    enabled: !!guildId,
  });

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

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{pageConfig.guild.name}</h1>
            <p className="text-sm text-muted-foreground">{pageConfig.guild.realm_name}</p>
          </div>
        </div>
        {pageConfig.guild.can_edit && (
          <Link
            to={`/guilds/${guildId}/edit`}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit Page
          </Link>
        )}
      </div>

      {/* Tab Navigation */}
      <TabBar
        tabs={visibleTabs}
        activeTab={activeTab}
        isEditing={false}
        onTabChange={setActiveTab}
      />

      {/* Content */}
      {currentTab && (
        <GuildPageCanvas
          guild={pageConfig.guild}
          panels={currentTab.panels}
          isEditing={false}
        />
      )}
    </div>
  );
}
