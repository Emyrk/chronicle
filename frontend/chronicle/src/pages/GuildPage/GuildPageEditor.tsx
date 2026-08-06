import { useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import type { GuildPagePanel, GuildPageTab, GuildPageTheme, DeviceVisibility } from "@/api/typesGenerated";
import { useGuildPage, useSaveGuildPage } from "@/api/queries";
import { GuildPageCanvas, TabBar, AddPanelDrawer, PanelConfigModal, HeaderEditor } from "./components";
import { getPanelDefinition } from "./panels/registry";
import { ArrowLeft, Eye, Save, Monitor, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LayoutItem } from "react-grid-layout";
import { useIsMobile } from "@/hooks/useIsMobile";

export function GuildPageEditor() {
  const { guildId } = useParams<{ guildId: string }>();
  const isMobile = useIsMobile();
  // const navigate = useNavigate(); // Will be used when API is connected
  
  const [tabs, setTabs] = useState<GuildPageTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [configPanel, setConfigPanel] = useState<GuildPagePanel | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [themeOverride, setThemeOverride] = useState<GuildPageTheme | null>(null);

  const { data: pageConfig, isLoading } = useGuildPage(guildId);
  const saveGuildPage = useSaveGuildPage(guildId);

  // Initialize tabs from fetched data
  useState(() => {
    if (pageConfig?.tabs) {
      setTabs([...pageConfig.tabs]);
    }
  });

  // Use pageConfig tabs if local state is empty
  const displayTabs = tabs.length > 0 ? tabs : (pageConfig?.tabs || []);
  const currentTab = displayTabs.find((t) => t.slug === activeTab) || displayTabs[0];

  const handleLayoutChange = useCallback((layout: LayoutItem[]) => {
    setTabs((prevTabs) => {
      const newTabs = prevTabs.length > 0 ? [...prevTabs] : [...(pageConfig?.tabs || [])];
      const tabIndex = newTabs.findIndex((t) => t.slug === activeTab);
      if (tabIndex === -1) return prevTabs;

      newTabs[tabIndex] = {
        ...newTabs[tabIndex],
        panels: newTabs[tabIndex].panels.map((panel) => {
          const layoutItem = layout.find((l) => l.i === panel.id);
          if (layoutItem) {
            return {
              ...panel,
              position: {
                x: layoutItem.x,
                y: layoutItem.y,
                w: layoutItem.w,
                h: layoutItem.h,
              },
            };
          }
          return panel;
        }),
      };
      return newTabs;
    });
    setHasChanges(true);
  }, [activeTab, pageConfig?.tabs]);

  const handleAddPanel = useCallback((panelType: string) => {
    const definition = getPanelDefinition(panelType);
    if (!definition) return;

    const newPanel: GuildPagePanel = {
      id: `panel-${Date.now()}`,
      panel_type: panelType,
      config: definition.defaultConfig as Record<string, unknown>,
      position: {
        x: 0,
        y: 0,
        w: definition.defaultSize.w,
        h: definition.defaultSize.h,
      },
      visibility: "all",
    };

    setTabs((prevTabs) => {
      const newTabs = prevTabs.length > 0 ? [...prevTabs] : [...(pageConfig?.tabs || [])];
      const tabIndex = newTabs.findIndex((t) => t.slug === activeTab);
      if (tabIndex === -1) return prevTabs;

      newTabs[tabIndex] = {
        ...newTabs[tabIndex],
        panels: [...newTabs[tabIndex].panels, newPanel],
      };
      return newTabs;
    });
    setHasChanges(true);
  }, [activeTab, pageConfig?.tabs]);

  const handlePanelDelete = useCallback((panelId: string) => {
    setTabs((prevTabs) => {
      const newTabs = prevTabs.length > 0 ? [...prevTabs] : [...(pageConfig?.tabs || [])];
      const tabIndex = newTabs.findIndex((t) => t.slug === activeTab);
      if (tabIndex === -1) return prevTabs;

      newTabs[tabIndex] = {
        ...newTabs[tabIndex],
        panels: newTabs[tabIndex].panels.filter((p) => p.id !== panelId),
      };
      return newTabs;
    });
    setHasChanges(true);
  }, [activeTab, pageConfig?.tabs]);

  const handlePanelConfigChange = useCallback((panelId: string, config: Record<string, unknown>) => {
    setTabs((prevTabs) => {
      const newTabs = prevTabs.length > 0 ? [...prevTabs] : [...(pageConfig?.tabs || [])];
      const tabIndex = newTabs.findIndex((t) => t.slug === activeTab);
      if (tabIndex === -1) return prevTabs;

      newTabs[tabIndex] = {
        ...newTabs[tabIndex],
        panels: newTabs[tabIndex].panels.map((p) =>
          p.id === panelId ? { ...p, config } : p
        ),
      };
      return newTabs;
    });
    setHasChanges(true);
  }, [activeTab, pageConfig?.tabs]);

  const handlePanelConfig = useCallback((panelId: string) => {
    const panel = currentTab?.panels.find((p) => p.id === panelId);
    if (panel) {
      setConfigPanel(panel);
    }
  }, [currentTab]);

  const handlePanelConfigSave = useCallback((config: Record<string, unknown>, visibility: DeviceVisibility) => {
    if (!configPanel) return;

    setTabs((prevTabs) => {
      const newTabs = prevTabs.length > 0 ? [...prevTabs] : [...(pageConfig?.tabs || [])];
      const tabIndex = newTabs.findIndex((t) => t.slug === activeTab);
      if (tabIndex === -1) return prevTabs;

      newTabs[tabIndex] = {
        ...newTabs[tabIndex],
        panels: newTabs[tabIndex].panels.map((p) =>
          p.id === configPanel.id ? { ...p, config, visibility } : p
        ),
      };
      return newTabs;
    });
    setHasChanges(true);
    setConfigPanel(null);
  }, [configPanel, activeTab, pageConfig?.tabs]);

  const handleAddTab = useCallback(() => {
    const tabCount = displayTabs.length;
    const newTab: GuildPageTab = {
      id: `tab-${Date.now()}`,
      label: `Tab ${tabCount + 1}`,
      slug: `tab-${tabCount + 1}`,
      sort_order: tabCount,
      visibility: "all",
      panels: [],
    };

    setTabs((prevTabs) => {
      const newTabs = prevTabs.length > 0 ? [...prevTabs] : [...(pageConfig?.tabs || [])];
      return [...newTabs, newTab];
    });
    setActiveTab(newTab.slug);
    setHasChanges(true);
  }, [displayTabs.length, pageConfig?.tabs]);

  const handleTabVisibilityChange = useCallback((tabId: string, visibility: DeviceVisibility) => {
    setTabs((prevTabs) => {
      const newTabs = prevTabs.length > 0 ? [...prevTabs] : [...(pageConfig?.tabs || [])];
      return newTabs.map((t) => (t.id === tabId ? { ...t, visibility } : t));
    });
    setHasChanges(true);
  }, [pageConfig?.tabs]);

  const handleDeleteTab = useCallback((tabId: string) => {
    setTabs((prevTabs) => {
      const newTabs = prevTabs.length > 0 ? [...prevTabs] : [...(pageConfig?.tabs || [])];
      const filtered = newTabs.filter((t) => t.id !== tabId);
      if (filtered.length === 0) return prevTabs;
      return filtered;
    });
    setHasChanges(true);
  }, [pageConfig?.tabs]);

  const handleThemeChange = useCallback((theme: GuildPageTheme) => {
    setThemeOverride(theme);
    setHasChanges(true);
  }, []);

  const currentTheme = themeOverride ?? pageConfig?.theme ?? {};

  const handleSave = async () => {
    try {
      const tabsToSave = tabs.length > 0 ? tabs : (pageConfig?.tabs ?? []);
      await saveGuildPage.mutateAsync({ tabs: tabsToSave, theme: themeOverride ?? undefined });
      setThemeOverride(null);
      setHasChanges(false);
    } catch (err) {
      console.error("Failed to save guild page:", err);
      const requestError = err as { message?: string; detail?: string } | null;
      toast.error(requestError?.message || "Failed to save guild page", {
        description: requestError?.detail,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Mobile Warning Banner */}
      {isMobile && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-3">
          <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
            <Monitor className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">
              <span className="font-medium">Editing is optimized for desktop.</span>{" "}
              You can view your page on mobile, but editing layout works best on a larger screen.
            </p>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4">
            <Link
              to={`/g/${guildId}`}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold">Editing: {pageConfig?.guild.name}</h1>
              <p className="text-xs text-muted-foreground">
                {hasChanges ? "Unsaved changes" : "All changes saved"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/g/${guildId}`}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted transition-colors"
            >
              <Eye className="h-4 w-4" />
              Preview
            </Link>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saveGuildPage.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-6">
        <div className="mb-4">
          <HeaderEditor theme={currentTheme} onChange={handleThemeChange} />
        </div>

        <div className="mb-4">
          <AddPanelDrawer onAddPanel={handleAddPanel} />
        </div>

        {/* Sidebar + Content */}
        <div className="flex gap-6 relative">
          <TabBar
            tabs={[...displayTabs]}
            activeTab={activeTab}
            isEditing={true}
            isMobile={isMobile}
            sidebarOpen={sidebarOpen}
            onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
            onTabChange={setActiveTab}
            onTabAdd={handleAddTab}
            onTabDelete={handleDeleteTab}
            onTabVisibilityChange={handleTabVisibilityChange}
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

          <div className="flex-1 min-w-0">
            {currentTab && (
              <GuildPageCanvas
                guild={pageConfig!.guild}
                panels={[...currentTab.panels]}
                isEditing={true}
                onLayoutChange={handleLayoutChange}
                onPanelConfig={handlePanelConfig}
                onPanelDelete={handlePanelDelete}
                onPanelConfigChange={handlePanelConfigChange}
              />
            )}
          </div>
        </div>
      </div>

      {/* Config Modal */}
      <PanelConfigModal
        panel={configPanel}
        onSave={handlePanelConfigSave}
        onClose={() => setConfigPanel(null)}
      />
    </div>
  );
}
