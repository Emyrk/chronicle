/**
 * Panel grid for sim results — reuses EventsPanel with the user's saved layout
 * and action bar for quick layout casting.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { BookOpen, X } from "lucide-react";
import { toast } from "sonner";
import { EventsPanel, type EventsPanelType, type PanelContext, type EntitySelection } from "@/pages/Instance/EventsPanels";
import { PANELS } from "@/pages/Instance/EventsPanels/EventsPanel";
import type { Instance, Encounter } from "@/pages/Instance/InstancePage";
import type { WoWHeroClasses, WoWHeroRaces, ActionBarSlotsResponse } from "@/api/typesGenerated";
import type { UserPanelLayout } from "@/api/queries";
import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import { Button } from "@/components/ui/button";
import { InstanceActionBar } from "@/components/InstanceActionBar/InstanceActionBar";
import { SIM_ENCOUNTER_ID, SIM_PLAYER_GUID, SIM_TARGET_GUID } from "@/sim/panelBridge";
import { useSession } from "@/api/queries";
import { useInstanceDefaultsCache } from "@/hooks/useInstanceDefaultsCache";
import { parsePanelLayout } from "@/features/layoutBook/parseLayout";
import {
  LAYOUT_ACTION_BAR_KEYS,
  type LayoutActionBarSlots,
} from "@/features/layoutBook/layoutBookStore";
import {
  DEFAULT_INSTANCE_LAYOUT_ITEMS,
  DEFAULT_INSTANCE_PANEL_TYPES,
} from "@/pages/Instance/viewDefaults";

const GRID_COLS = 12;

// Class ID → WoWHeroClasses enum string
const CLASS_ID_TO_WOW: Record<number, WoWHeroClasses> = {
  1: "WARRIOR", 2: "PALADIN", 3: "HUNTER", 4: "ROGUE",
  5: "PRIEST", 7: "SHAMAN", 8: "MAGE", 9: "WARLOCK", 11: "DRUID",
};

// Race ID → WoWHeroRaces enum string
const RACE_ID_TO_WOW: Record<number, WoWHeroRaces> = {
  1: "Human", 2: "Orc", 3: "Dwarf", 4: "NightElf",
  5: "Scourge", 6: "Tauren", 7: "Gnome", 8: "Troll",
};

function toLayoutActionBarSlots(slots: ActionBarSlotsResponse | null | undefined): LayoutActionBarSlots {
  return Object.fromEntries(
    LAYOUT_ACTION_BAR_KEYS.map((key) => [key, slots?.[`slot_${key}`] ?? null]),
  ) as LayoutActionBarSlots;
}

function orderLayoutItems(items: GridEditorItem[]): GridEditorItem[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

function normalizeLayoutItems(items: GridEditorItem[]): GridEditorItem[] {
  const normalized = items.map((item) => {
    const w = Math.max(4, Math.min(item.w, GRID_COLS));
    const h = Math.max(4, item.h);
    const x = Math.max(0, Math.min(item.x, GRID_COLS - w));
    const y = Math.max(0, item.y);
    return { ...item, x, y, w, h, minW: item.minW ?? 4, minH: item.minH ?? 4 };
  });

  const occupied = new Set<string>();
  const out: GridEditorItem[] = [];

  for (const item of orderLayoutItems(normalized)) {
    let iy = item.y;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let overlaps = false;
      for (let dx = 0; dx < item.w && !overlaps; dx++) {
        for (let dy = 0; dy < item.h; dy++) {
          if (occupied.has(`${item.x + dx}:${iy + dy}`)) {
            overlaps = true;
            break;
          }
        }
      }
      if (!overlaps) break;
      iy += 1;
    }
    for (let dx = 0; dx < item.w; dx++) {
      for (let dy = 0; dy < item.h; dy++) {
        occupied.add(`${item.x + dx}:${iy + dy}`);
      }
    }
    out.push({ ...item, y: iy });
  }

  return orderLayoutItems(out);
}

interface SimPanelGridProps {
  playerName: string;
  classId: number;
  raceId: number;
  targetName: string;
  durationMs: number;
  startTimestamp: Date;
}

export function SimPanelGrid({
  playerName,
  classId,
  raceId,
  targetName,
  durationMs,
  startTimestamp,
}: SimPanelGridProps) {
  // Load user's saved layout (same as Instance page)
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;
  const instanceDefaults = useInstanceDefaultsCache(isLoggedIn);

  const savedLayout = useMemo(() => {
    const layout = instanceDefaults?.default_desktop_layout;
    if (!layout) return null;
    return parsePanelLayout(layout);
  }, [instanceDefaults?.default_desktop_layout]);

  // Layout state (items + panel types) — can be overridden by casting
  const [layoutItems, setLayoutItems] = useState<GridEditorItem[] | null>(null);
  const [panelTypesById, setPanelTypesById] = useState<Record<string, EventsPanelType> | null>(null);

  const effectiveItems: GridEditorItem[] = useMemo(
    () => layoutItems ?? savedLayout?.items ?? DEFAULT_INSTANCE_LAYOUT_ITEMS,
    [layoutItems, savedLayout],
  );

  const effectivePanelTypes: Record<string, EventsPanelType> = useMemo(
    () => panelTypesById ?? savedLayout?.panelTypesById ?? DEFAULT_INSTANCE_PANEL_TYPES,
    [panelTypesById, savedLayout],
  );

  // Action bar
  const [actionBarOpen, setActionBarOpen] = useState(false);

  const actionBarSlots = useMemo(
    () => toLayoutActionBarSlots(instanceDefaults?.action_bar_slots),
    [instanceDefaults?.action_bar_slots],
  );

  const actionBarLayoutsByID = useMemo(
    () => new Map((instanceDefaults?.action_bar_layouts ?? []).map((l) => [l.id, l])),
    [instanceDefaults?.action_bar_layouts],
  );

  const castLayout = useCallback((layout: UserPanelLayout) => {
    try {
      const parsed = parsePanelLayout(layout);
      const normalizedItems = normalizeLayoutItems(parsed.items);
      const castTypes: Record<string, EventsPanelType> = {};
      normalizedItems.forEach((item) => {
        const candidate = parsed.panelTypesById?.[item.id] ?? "empty";
        castTypes[item.id] = candidate in PANELS ? candidate : "empty";
      });
      const orderedItems = orderLayoutItems(normalizedItems);
      setLayoutItems(orderedItems);
      setPanelTypesById(castTypes);
      toast.success("Cast layout", { description: layout.title });
    } catch {
      toast.error("Failed to cast layout", { description: "Layout payload is invalid." });
    }
  }, []);

  const castResetToDefault = useCallback(() => {
    setLayoutItems(null);
    setPanelTypesById(null);
    toast.success("Reset to default layout");
  }, []);

  // Keyboard shortcuts (0-9) to cast action bar layouts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key < "0" || event.key > "9") return;

      setActionBarOpen(true);
      const layoutID = actionBarSlots[event.key as keyof LayoutActionBarSlots];
      if (!layoutID) return;
      const layout = actionBarLayoutsByID.get(layoutID);
      if (!layout) return;
      event.preventDefault();
      castLayout(layout);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionBarLayoutsByID, actionBarSlots, castLayout]);

  // Per-panel type override
  const handlePanelTypeChange = useCallback((panelId: string, type: EventsPanelType) => {
    setPanelTypesById((prev) => ({ ...(prev ?? {}), [panelId]: type }));
  }, []);

  const encounter: Encounter = useMemo(() => ({
    id: SIM_ENCOUNTER_ID,
    name: "Simulation",
    boss: false,
    kill_type: "clean" as const,
    start_time: startTimestamp.toISOString(),
    end_time: new Date(startTimestamp.getTime() + durationMs).toISOString(),
  }), [startTimestamp, durationMs]);

  const instance: Instance = useMemo(() => ({
    id: "sim-1",
    name: "DPS Simulation",
    startTime: startTimestamp.toISOString(),
    endTime: new Date(startTimestamp.getTime() + durationMs).toISOString(),
    encounters: [encounter],
    players: {
      [SIM_PLAYER_GUID]: {
        name: playerName,
        class: CLASS_ID_TO_WOW[classId] ?? "WARRIOR",
        race: RACE_ID_TO_WOW[raceId] ?? "Human",
      },
    },
    units: {
      [SIM_TARGET_GUID]: {
        name: targetName,
        owner: null,
        entry: 0,
      },
    },
  }), [playerName, classId, raceId, targetName, startTimestamp, durationMs, encounter]);

  const entitySelection: EntitySelection = useMemo(() => ({
    playerIds: new Set([SIM_PLAYER_GUID]),
    enemyIds: new Set([SIM_TARGET_GUID]),
  }), []);

  const panelContext: PanelContext = useMemo(() => ({
    instance,
    selectedEncounterIds: [SIM_ENCOUNTER_ID],
    entitySelection,
  }), [instance, entitySelection]);

  return (
    <>
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(12, 1fr)",
          gridAutoRows: "minmax(80px, auto)",
        }}
      >
        {effectiveItems.map((item, index) => {
          const panelType = effectivePanelTypes[item.id] ?? "empty";
          return (
            <div
              key={item.id}
              className="min-h-0"
              style={{
                gridColumn: `${item.x + 1} / span ${item.w}`,
                gridRow: `${item.y + 1} / span ${item.h}`,
              }}
            >
              <EventsPanel
                panelType={panelType}
                onPanelTypeChange={(type) => handlePanelTypeChange(item.id, type)}
                durationMs={durationMs}
                context={panelContext}
                panelIndex={index}
                panelId={item.id}
              />
            </div>
          );
        })}
      </div>

      {/* Action bar */}
      {actionBarOpen && (
        <div className="fixed bottom-5 left-0 right-0 z-[80] flex justify-center px-2 sm:left-1/2 sm:right-auto sm:w-auto sm:-translate-x-1/2 sm:px-0">
          <div className="inline-flex max-w-full flex-col items-center gap-2">
            <button
              type="button"
              onClick={castResetToDefault}
              className="rounded-full bg-secondary px-4 py-1.5 text-sm font-semibold text-secondary-foreground shadow hover:bg-secondary/90 transition-colors"
            >
              Reset to Default
            </button>
            <div className="relative inline-flex max-w-full">
              <Button
                variant="secondary"
                size="icon"
                className="absolute -right-2 -top-2 z-[81] h-7 w-7 rounded-full border border-zinc-600 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                onClick={() => setActionBarOpen(false)}
                aria-label="Dismiss action bar"
              >
                <X className="h-4 w-4" />
              </Button>
              <InstanceActionBar
                slots={actionBarSlots}
                layouts={instanceDefaults?.action_bar_layouts ?? []}
                onCast={castLayout}
                onResetToDefault={castResetToDefault}
              />
            </div>
          </div>
        </div>
      )}

      {/* FAB to toggle action bar (logged-in users only) */}
      {isLoggedIn && createPortal(
        <Button
          variant="default"
          size="icon"
          onClick={() => setActionBarOpen((prev) => !prev)}
          className="fixed bottom-8 right-8 z-50 h-14 w-14 rounded-full shadow-lg"
          title={actionBarOpen ? "Close action bar" : "Open action bar"}
        >
          {actionBarOpen ? <X className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
        </Button>,
        document.body,
      )}
    </>
  );
}
