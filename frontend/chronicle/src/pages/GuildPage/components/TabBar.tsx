import { Plus, X, Monitor, Smartphone, PanelLeftClose, List } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { GuildPageTab, DeviceVisibility } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";

interface TabBarProps {
  tabs: readonly GuildPageTab[];
  activeTab: string;
  isEditing: boolean;
  isMobile: boolean;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  onTabChange: (slug: string) => void;
  onTabAdd?: () => void;
  onTabDelete?: (tabId: string) => void;
  onTabRename?: (tabId: string, label: string) => void;
  onTabVisibilityChange?: (tabId: string, visibility: DeviceVisibility) => void;
}

// Visibility icon indicator
function VisibilityIcon({ visibility }: { visibility: DeviceVisibility | undefined }) {
  if (!visibility || visibility === "all") return null;
  if (visibility === "desktop") {
    return (
      <span title="Desktop only" className="text-blue-400">
        <Monitor className="h-3 w-3" />
      </span>
    );
  }
  if (visibility === "mobile") {
    return (
      <span title="Mobile only" className="text-green-400">
        <Smartphone className="h-3 w-3" />
      </span>
    );
  }
  return null;
}

// Visibility dropdown for editing
function VisibilityDropdown({
  visibility,
  onChange,
}: {
  visibility: DeviceVisibility | undefined;
  onChange: (v: DeviceVisibility) => void;
}) {
  return (
    <select
      value={visibility || "all"}
      onChange={(e) => onChange(e.target.value as DeviceVisibility)}
      onClick={(e) => e.stopPropagation()}
      className="text-xs bg-transparent border border-border rounded px-1 py-0.5 cursor-pointer hover:bg-muted"
      title="Device visibility"
    >
      <option value="all">All</option>
      <option value="desktop">Desktop</option>
      <option value="mobile">Mobile</option>
    </select>
  );
}

// Sidebar component for tab selection
function TabSidebar({
  tabs,
  activeTab,
  isEditing,
  isMobile,
  onCollapse,
  onTabChange,
  onTabAdd,
  onTabDelete,
  onTabRename,
  onTabVisibilityChange,
}: Omit<TabBarProps, "sidebarOpen" | "onSidebarToggle"> & { onCollapse: () => void }) {
  return (
    <div
      className={cn(
        "pt-1 w-48 shrink-0 border-r border-border pr-4 overflow-y-auto styled-scrollbar",
        !isMobile && "sticky top-4 max-h-[calc(100vh-2rem)]",
        isMobile && "fixed inset-y-0 left-0 z-50 bg-background border-r shadow-lg pl-4 pt-4"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Pages</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 -mr-1"
          onClick={onCollapse}
          title="Hide sidebar"
        >
          {isMobile ? <X className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <div className="space-y-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.slug;
          return (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              className={cn(
                "group w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-all duration-150 cursor-pointer",
                isActive
                  ? "bg-primary-darker text-primary-foreground border-l-3 border-l-primary-foreground/70 shadow-sm"
                  : "hover:bg-accent/50 hover:translate-x-0.5 text-muted-foreground"
              )}
              onClick={() => onTabChange(tab.slug)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTabChange(tab.slug);
                }
              }}
            >
              {isEditing ? (
                <VisibilityDropdown
                  visibility={tab.visibility}
                  onChange={(v) => onTabVisibilityChange?.(tab.id, v)}
                />
              ) : (
                <VisibilityIcon visibility={tab.visibility} />
              )}

              {isEditing ? (
                <input
                  type="text"
                  value={tab.label}
                  onChange={(e) => onTabRename?.(tab.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Tab name"
                  title="Rename tab"
                  className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium border-b border-transparent hover:border-border focus:border-primary focus:outline-none"
                />
              ) : (
                <span className="truncate flex-1 font-medium">{tab.label}</span>
              )}

              {isEditing && tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabDelete?.(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        {isEditing && (
          <button
            onClick={onTabAdd}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Tab
          </button>
        )}
      </div>
    </div>
  );
}

export function TabBar({
  tabs,
  activeTab,
  isEditing,
  isMobile,
  sidebarOpen,
  onSidebarToggle,
  onTabChange,
  onTabAdd,
  onTabDelete,
  onTabRename,
  onTabVisibilityChange,
}: TabBarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={onSidebarToggle}
        />
      )}

      {/* Sidebar */}
      {sidebarOpen && (
        <TabSidebar
          tabs={tabs}
          activeTab={activeTab}
          isEditing={isEditing}
          isMobile={isMobile}
          onCollapse={onSidebarToggle}
          onTabChange={onTabChange}
          onTabAdd={onTabAdd}
          onTabDelete={onTabDelete}
          onTabRename={onTabRename}
          onTabVisibilityChange={onTabVisibilityChange}
        />
      )}

      {/* Mobile: FAB toggle button */}
      {isMobile && createPortal(
        <Button
          variant="default"
          size="icon"
          onClick={onSidebarToggle}
          className={cn(
            "fixed bottom-8 left-8 z-50 h-14 w-14 rounded-full shadow-lg"
          )}
          title={sidebarOpen ? "Close pages" : "Show pages"}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <List className="h-5 w-5" />}
        </Button>,
        document.body
      )}
    </>
  );
}
