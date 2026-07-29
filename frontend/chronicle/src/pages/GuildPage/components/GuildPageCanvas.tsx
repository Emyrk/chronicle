import { useMemo, useRef, useState, useEffect } from "react";
import GridLayout, { type LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import type { GuildInfo, GuildPagePanel, DeviceVisibility } from "@/api/typesGenerated";
import { getPanelDefinition } from "../panels/registry";
import { getPanelStyle } from "./PanelConfigModal";
import { GripVertical, Settings, Trash2, Monitor, Smartphone } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

// Small visibility badge for panel header
function VisibilityBadge({ visibility }: { visibility: DeviceVisibility | undefined }) {
  if (!visibility || visibility === "all") return null;
  
  if (visibility === "desktop") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-400/20 text-blue-400" title="Desktop only">
        <Monitor className="h-3 w-3" />
      </span>
    );
  }
  
  if (visibility === "mobile") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-400/20 text-green-400" title="Mobile only">
        <Smartphone className="h-3 w-3" />
      </span>
    );
  }
  
  return null;
}

interface GuildPageCanvasProps {
  guild: GuildInfo;
  panels: GuildPagePanel[];
  isEditing: boolean;
  onLayoutChange?: (layout: LayoutItem[]) => void;
  onPanelConfig?: (panelId: string) => void;
  onPanelDelete?: (panelId: string) => void;
  onPanelConfigChange?: (panelId: string, config: Record<string, unknown>) => void;
}

// Hook to measure container width
function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(ref.current);
    // Set initial width
    setWidth(ref.current.offsetWidth);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}

export function GuildPageCanvas({
  guild,
  panels,
  isEditing,
  onLayoutChange,
  onPanelConfig,
  onPanelDelete,
  onPanelConfigChange,
}: GuildPageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const isMobile = useIsMobile();

  // On mobile, use 2 columns and stack panels vertically
  const cols = isMobile ? 2 : 12;
  const rowHeight = isMobile ? 120 : 100;

  const layout = useMemo(
    () => {
      if (isMobile) {
        // On mobile, stack panels in a single column, full width.
        // Accumulate y offsets to avoid gaps/overlaps (static items skip compaction).
        let yOffset = 0;
        return panels.map((p) => {
          const h = Math.max(2, Math.min(p.position.h, 3));
          const item = {
            i: p.id,
            x: 0,
            y: yOffset,
            w: 2, // Full width (2 of 2 columns)
            h,
            minW: 2,
            minH: 2,
            maxW: 2,
            maxH: 4,
            static: true, // Disable drag/resize on mobile
          };
          yOffset += h;
          return item;
        });
      }

      return panels.map((p) => {
        const definition = getPanelDefinition(p.panel_type);
        return {
          i: p.id,
          x: p.position.x,
          y: p.position.y,
          w: p.position.w,
          h: p.position.h,
          minW: definition?.minSize?.w ?? 2,
          minH: definition?.minSize?.h ?? 1,
          maxW: definition?.maxSize?.w ?? 12,
          maxH: definition?.maxSize?.h ?? 8,
        };
      });
    },
    [panels, isMobile]
  );

  const handleLayoutChange = (newLayout: readonly LayoutItem[]) => {
    // Don't save mobile layout changes
    if (isMobile) return;
    onLayoutChange?.([...newLayout]);
  };

  if (panels.length === 0) {
    return (
      <div ref={containerRef} className="flex items-center justify-center h-64 border-2 border-dashed border-muted rounded-lg">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">No panels yet</p>
          <p className="text-sm">Click "Add Panel" to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <GridLayout
        className="layout"
        layout={layout}
        width={containerWidth}
        gridConfig={{
          cols,
          rowHeight,
        }}
        dragConfig={{
          handle: ".drag-handle",
          enabled: isEditing && !isMobile,
        }}
        resizeConfig={{
          enabled: isEditing && !isMobile,
        }}
        onLayoutChange={handleLayoutChange}
      >
      {panels.map((panel) => {
        const definition = getPanelDefinition(panel.panel_type);
        if (!definition) {
          return (
            <div key={panel.id} className="bg-destructive/10 rounded-lg p-4 flex items-center justify-between gap-2">
              <span>Unknown panel type: {panel.panel_type}</span>
              {isEditing && (
                <button
                  aria-label={`Delete unknown panel ${panel.panel_type}`}
                  onClick={() => onPanelDelete?.(panel.id)}
                  className="p-1 rounded hover:bg-destructive/20 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        }

        const style = getPanelStyle((panel.config as Record<string, unknown>) || {});
        const showHeader = style.showHeader;
        const panelLabel = style.panelName || definition.label;

        let bgStyle: React.CSSProperties | undefined;
        let bgClass = "bg-card";
        if (style.background === "transparent") {
          bgClass = "bg-transparent";
        } else if (style.background === "custom") {
          bgClass = "";
          bgStyle = { backgroundColor: style.backgroundColor };
        }

        return (
          <div
            key={panel.id}
            className={`${bgClass} rounded-lg overflow-hidden shadow-sm relative ${isEditing && style.background === "transparent" ? "border border-dashed border-muted-foreground/30" : "border border-border"}`}
            style={bgStyle}
          >
            {showHeader && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  {isEditing && (
                    <div className="drag-handle cursor-move text-muted-foreground hover:text-foreground">
                      <GripVertical className="h-4 w-4" />
                    </div>
                  )}
                  <span className="text-muted-foreground">{definition.icon}</span>
                  <span className="text-sm font-medium">{panelLabel}</span>
                  {isEditing && <VisibilityBadge visibility={panel.visibility} />}
                </div>
                {isEditing && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onPanelConfig?.(panel.id)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onPanelDelete?.(panel.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* When header is hidden in edit mode but would be hidden in view, show minimal drag handle */}
            {!showHeader && isEditing && (
              <div className={`absolute top-1 right-1 z-10 flex items-center gap-1 ${style.background === "transparent" ? "opacity-70 hover:opacity-100" : "opacity-0 hover:opacity-100"} transition-opacity`}>
                <div className="drag-handle cursor-move p-1 rounded bg-black/50 text-white">
                  <GripVertical className="h-3 w-3" />
                </div>
                <button
                  onClick={() => onPanelConfig?.(panel.id)}
                  className="p-1 rounded bg-black/50 text-white hover:bg-black/70"
                >
                  <Settings className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onPanelDelete?.(panel.id)}
                  className="p-1 rounded bg-black/50 text-white hover:bg-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
            <div
              className="p-3 overflow-auto styled-scrollbar"
              style={{ height: showHeader ? "calc(100% - 41px)" : "100%" }}
            >
              {definition.render({
                guild,
                config: panel.config as never,
                position: panel.position,
                isEditing,
                onConfigChange: isEditing
                  ? (partial) => onPanelConfigChange?.(panel.id, { ...panel.config, ...partial } as Record<string, unknown>)
                  : undefined,
              })}
            </div>
          </div>
        );
      })}
      </GridLayout>
    </div>
  );
}
