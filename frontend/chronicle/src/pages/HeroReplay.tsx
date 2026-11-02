import { useEffect, useMemo, useState } from "react";
import { useInstance } from "@/api/queries";
import { useIsMobile } from "@/hooks/useIsMobile";
import { InstanceEventsProvider } from "@/hooks/instanceEvents";
import { transformToInstance, type Instance } from "@/pages/Instance/InstancePage";
import { createMapPanel } from "@/pages/Instance/EventsPanels/Map/Map";
import { useEmbeddedPanel } from "@/pages/Instance/EventsPanels/useEmbeddedPanel";
import type { EntitySelection, PanelContext } from "@/pages/Instance/EventsPanels/types";

/**
 * A hand-picked fight shown as the homepage hero's animated backdrop: Bloodlord
 * Mandokir, a ~43s clean kill from a public Zul'Gurub log (instance
 * OJbOLvyr1pXA3AX9). Swap these two ids to feature a different fight.
 */
const HERO_INSTANCE_ID = "OJbOLvyr1pXA3AX9";
const HERO_ENCOUNTER_ID = "b1a9a702-6173-46e9-9dbc-80c28317a67d";
const HERO_ENCOUNTER_DURATION_MS = 43_000;

const EMPTY_SELECTION: EntitySelection = { enemyIds: new Set(), playerIds: new Set() };
const HERO_MAP_PANEL = createMapPanel({ mini: true, ambient: true });

/**
 * Arms after the browser goes idle (or a timeout), so the hero's live replay
 * never competes with the homepage's own initial render and data fetches.
 */
function useIdleArmed(): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setArmed(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setArmed(true), 1500);
    return () => window.clearTimeout(id);
  }, []);
  return armed;
}

function HeroReplayPanel({ instance }: { instance: Instance }) {
  const context = useMemo((): PanelContext => ({
    instance,
    selectedEncounterIds: [HERO_ENCOUNTER_ID],
    entitySelection: EMPTY_SELECTION,
  }), [instance]);
  const render = useEmbeddedPanel({
    panel: HERO_MAP_PANEL,
    context,
    durationMs: HERO_ENCOUNTER_DURATION_MS,
  });
  return <>{render()}</>;
}

function HeroReplayData() {
  const { data } = useInstance(HERO_INSTANCE_ID);
  const instance = useMemo(() => (data ? transformToInstance(data) : null), [data]);
  if (!instance) return null;
  return <HeroReplayPanel instance={instance} />;
}

/**
 * Live 3D replay of a hand-picked fight, filling the hero's background behind
 * the static poster image. Skipped on mobile and with reduced motion (the
 * poster stays); armed only once the browser is idle, since it pulls in the
 * 3D renderer, a dungeon mesh and several MB of combat telemetry.
 */
export function HeroReplayBackground() {
  const isMobile = useIsMobile();
  const armed = useIdleArmed();
  const [reducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  if (isMobile || reducedMotion || !armed) return null;
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <InstanceEventsProvider instanceId={HERO_INSTANCE_ID}>
        <HeroReplayData />
      </InstanceEventsProvider>
    </div>
  );
}
