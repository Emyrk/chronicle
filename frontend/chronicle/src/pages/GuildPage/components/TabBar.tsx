import { Plus, X, Monitor, Smartphone } from "lucide-react";
import type { GuildPageTab, DeviceVisibility } from "@/api/typesGenerated";

interface TabBarProps {
  tabs: readonly GuildPageTab[];
  activeTab: string;
  isEditing: boolean;
  onTabChange: (slug: string) => void;
  onTabAdd?: () => void;
  onTabDelete?: (tabId: string) => void;
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

export function TabBar({
  tabs,
  activeTab,
  isEditing,
  onTabChange,
  onTabAdd,
  onTabDelete,
  onTabVisibilityChange,
}: TabBarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border pb-1 mb-4 overflow-x-auto styled-scrollbar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex items-center gap-1.5 px-4 py-2 rounded-t-lg cursor-pointer transition-colors ${
            activeTab === tab.slug
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
          onClick={() => onTabChange(tab.slug)}
        >
          {/* Visibility indicator (view mode) or dropdown (edit mode) */}
          {isEditing ? (
            <VisibilityDropdown
              visibility={tab.visibility}
              onChange={(v) => onTabVisibilityChange?.(tab.id, v)}
            />
          ) : (
            <VisibilityIcon visibility={tab.visibility} />
          )}
          
          <span className="text-sm font-medium whitespace-nowrap">{tab.label}</span>
          
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
      ))}
      {isEditing && (
        <button
          onClick={onTabAdd}
          className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-t-lg transition-colors whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Tab
        </button>
      )}
    </div>
  );
}
