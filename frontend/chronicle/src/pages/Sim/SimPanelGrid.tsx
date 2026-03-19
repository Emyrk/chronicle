/**
 * Panel grid for sim results — reuses EventsPanel with a mock Instance.
 */

import { useState, useMemo, useCallback } from "react";
import { EventsPanel, type EventsPanelType, type PanelContext, type EntitySelection } from "@/pages/Instance/EventsPanels";
import type { Instance, Encounter } from "@/pages/Instance/InstancePage";
import type { WoWHeroClasses, WoWHeroRaces } from "@/api/typesGenerated";
import { SIM_ENCOUNTER_ID, SIM_PLAYER_GUID, SIM_TARGET_GUID } from "@/sim/panelBridge";

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

interface PanelState {
  id: string;
  type: EventsPanelType;
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_PANELS: PanelState[] = [
  { id: "panel-0", type: "damage_done", x: 0, y: 0, w: 6, h: 4 },
  { id: "panel-1", type: "damage_done_by_target", x: 6, y: 0, w: 6, h: 4 },
  { id: "panel-2", type: "damage_done_timeline", x: 0, y: 4, w: 12, h: 4 },
];

export function SimPanelGrid({
  playerName,
  classId,
  raceId,
  targetName,
  durationMs,
  startTimestamp,
}: SimPanelGridProps) {
  const [panels, setPanels] = useState<PanelState[]>(DEFAULT_PANELS);

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
    setPanels((prev) =>
      prev.map((p) => (p.id === panelId ? { ...p, type } : p)),
    );
  }, []);

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: "repeat(12, 1fr)",
        gridAutoRows: "minmax(80px, auto)",
      }}
    >
      {panels.map((panel, index) => (
        <div
          key={panel.id}
          className="min-h-0"
          style={{
            gridColumn: `${panel.x + 1} / span ${panel.w}`,
            gridRow: `${panel.y + 1} / span ${panel.h}`,
          }}
        >
          <EventsPanel
            panelType={panel.type}
            onPanelTypeChange={(type) => handlePanelTypeChange(panel.id, type)}
            durationMs={durationMs}
            context={panelContext}
            panelIndex={index}
            panelId={panel.id}
          />
        </div>
      ))}
    </div>
  );
}
