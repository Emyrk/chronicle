/**
 * Panel grid for sim results — reuses EventsPanel with the user's saved layout.
 */

import { useState, useMemo, useCallback } from "react";
import { EventsPanel, type EventsPanelType, type PanelContext, type EntitySelection } from "@/pages/Instance/EventsPanels";
import type { Instance, Encounter } from "@/pages/Instance/InstancePage";
import type { WoWHeroClasses, WoWHeroRaces } from "@/api/typesGenerated";
import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import { SIM_ENCOUNTER_ID, SIM_PLAYER_GUID, SIM_TARGET_GUID } from "@/sim/panelBridge";
import { useSession } from "@/api/queries";
import { useInstanceDefaultsCache } from "@/hooks/useInstanceDefaultsCache";
import { parsePanelLayout } from "@/features/layoutBook/parseLayout";
import {
  DEFAULT_INSTANCE_LAYOUT_ITEMS,
  DEFAULT_INSTANCE_PANEL_TYPES,
} from "@/pages/Instance/viewDefaults";

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

  const layoutItems: GridEditorItem[] = useMemo(
    () => savedLayout?.items ?? DEFAULT_INSTANCE_LAYOUT_ITEMS,
    [savedLayout],
  );

  const defaultPanelTypes: Record<string, EventsPanelType> = useMemo(
    () => savedLayout?.panelTypesById ?? DEFAULT_INSTANCE_PANEL_TYPES,
    [savedLayout],
  );

  // Panel types can be changed per-panel (starts from saved/default)
  const [panelTypeOverrides, setPanelTypeOverrides] = useState<Record<string, EventsPanelType>>({});

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

  const handlePanelTypeChange = useCallback((panelId: string, type: EventsPanelType) => {
    setPanelTypeOverrides((prev) => ({ ...prev, [panelId]: type }));
  }, []);

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: "repeat(12, 1fr)",
        gridAutoRows: "minmax(80px, auto)",
      }}
    >
      {layoutItems.map((item, index) => {
        const panelType = panelTypeOverrides[item.id] ?? defaultPanelTypes[item.id] ?? "empty";
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
  );
}
