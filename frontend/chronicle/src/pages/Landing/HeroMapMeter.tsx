import { useEffect, useState } from "react";
import { SyncModeProvider, useSyncModeContext } from "@/pages/Instance/SyncModeContext";
import { MeterWindows } from "@/pages/Instance/EventsPanels/Map/MeterWindows";
import type { MeterWindow } from "@/pages/Instance/EventsPanels/Map/meterWindowsState";
import type { PanelContext } from "@/pages/Instance/EventsPanels/types";

/** Over the stats column's old spot: above the scrubber, at the content's right edge; tall enough for a 5-player group. */
const HERO_METER: MeterWindow = { id: "hero-meter", meter: "damage_done", right: 32, bottom: 112, width: 300, height: 136, perSecond: true };

/** Drives sync mode from the hero's clock, as the run page's Map panel does, so the meter reads at the replay's cursor. */
function HeroSyncCursor({ cursorMs, startMs, endMs }: { cursorMs: number; startMs: number; endMs: number }) {
  const { applyAuthoritativeState, setEncounterBounds } = useSyncModeContext();
  useEffect(() => setEncounterBounds({ start: new Date(startMs), end: new Date(endMs) }), [endMs, setEncounterBounds, startMs]);
  useEffect(() => {
    applyAuthoritativeState({ enabled: true, currentTimestamp: new Date(cursorMs), isPlaying: false, playbackSpeed: 1 });
  }, [applyAuthoritativeState, cursorMs]);
  return null;
}

/**
 * The 3D map's own meter window (Damage Done, the same panel and processor as the run page's Map),
 * following the hero replay's cursor. Rendered inside the hero's run, so it shares its stream cache.
 */
export function HeroMapMeter({ context, durationMs, cursorMs, startMs, endMs }: {
  context: PanelContext;
  durationMs: number;
  /** The replay's cursor, absolute (combat log time). */
  cursorMs: number;
  startMs: number;
  endMs: number;
}) {
  // Not remembered: the landing always opens on Damage Done.
  const [windows, setWindows] = useState<MeterWindow[]>([HERO_METER]);
  return (
    <SyncModeProvider>
      <HeroSyncCursor cursorMs={cursorMs} startMs={startMs} endMs={endMs} />
      <MeterWindows windows={windows} onChange={setWindows} context={context} durationMs={durationMs} />
    </SyncModeProvider>
  );
}
