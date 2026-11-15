import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PortalContainerProvider, usePortalContainer } from "@/components/ui/PortalContainerContext";
import { ReplayToggleFlash } from "../../ReplayToggleFlash";
import type { PanelRenderProps } from "../types";
import type { MapResult } from "./map.processor";
import { IDLE_MOBILE_MAP_INPUT, type MobileMapInput } from "./mapControls";
import { LeeroyFeaturedUnits, ReloadingChip } from "./MapChrome";
import { MapFloorPicker } from "./MapFloorPicker";
import { mapOwnsPortalContainer } from "./mapHostModel";
import { MobileMapControls } from "./MobileMapControls";
import type { PlanItem } from "./plan/mapPlan";
import { ReplayPlayer, ReplayPlayerFlatView, ReplayPlayerMessage } from "./ReplayPlayer";
import { useFullscreenElement } from "./useFullscreenElement";
import { useMapHost } from "./useMapHost";

const NO_PLAN_ITEMS: readonly PlanItem[] = [];

/**
 * The Map panel on a phone: the replay as an inert 2D preview with "Enter 3D
 * world", which opens the 3D view fullscreen (landscape) with touch controls.
 * Its clock is the map's preview (whole runs capped at 4x) until the page's
 * Replay is on. Capabilities: mapHostCapabilities("mobile").
 */
export function MobileMapHost({ wholeRun = false, ...props }: PanelRenderProps<MapResult> & { wholeRun?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const attachRoot = useCallback((element: HTMLDivElement | null) => {
    rootRef.current = element;
    setRootElement(element);
  }, []);
  const [mobileWorldOpen, setMobileWorldOpen] = useState(false);
  const [mobileInput, setMobileInput] = useState<MobileMapInput>(IDLE_MOBILE_MAP_INPUT);
  // The open world is the map's root in browser fullscreen: popovers portal into it.
  const fullscreenNode = useFullscreenElement();
  const fullscreen = fullscreenNode !== null && fullscreenNode === rootElement;
  const inheritedPortalContainer = usePortalContainer();
  const map = useMapHost({ props, kind: "mobile", wholeRun, immersive: fullscreen, mobileWorldOpen });
  const { player, setWalking, walking, canWalk } = map;
  const closeMobileWorld = useCallback(() => {
    setMobileInput(IDLE_MOBILE_MAP_INPUT);
    setWalking(false);
    setMobileWorldOpen(false);
    const orientation = screen.orientation as (ScreenOrientation & { unlock?: () => void }) | undefined;
    orientation?.unlock?.();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [setWalking]);
  const openMobileWorld = useCallback(() => {
    setMobileWorldOpen(true);
    const target = rootRef.current;
    const request = target?.requestFullscreen?.();
    if (!request) return;
    void request.then(() => {
      const orientation = screen.orientation as (ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> }) | undefined;
      return orientation?.lock?.("landscape");
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!mobileWorldOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setMobileInput(IDLE_MOBILE_MAP_INPUT);
        setWalking(false);
        setMobileWorldOpen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [mobileWorldOpen, setWalking]);

  const ready = player.ready;
  if (!ready) return <ReplayPlayerMessage player={player} />;

  // No camera row on a phone: the floor picker stands alone, bottom left.
  const floorControls = (ready.floors.length > 1 || ready.floorUncertain) ? (
    <MapFloorPicker compact floors={ready.floors} value={ready.selectedFloorNumber} manualValue={ready.manualFloorNumber} uncertain={ready.floorUncertain} onChange={ready.setFloorNumber} />
  ) : null;
  const portalContainer = mapOwnsPortalContainer(fullscreen, false, mobileWorldOpen)
    ? rootElement ?? inheritedPortalContainer
    : inheritedPortalContainer;

  return (
    <PortalContainerProvider container={portalContainer}>
      <div
        ref={attachRoot}
        data-window-fullscreen={mobileWorldOpen ? "" : undefined}
        className={cn("flex h-full min-h-0 flex-col bg-black", mobileWorldOpen && "fixed inset-0 z-[100] h-[100dvh] w-screen")}
      >
        <ReplayPlayer
          player={player}
          fallback={!mobileWorldOpen ? (
            <>
              <div className="pointer-events-none absolute inset-0"><ReplayPlayerFlatView player={player} trailSeconds={map.effectSettings.trailSeconds} /></div>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/15" aria-hidden />
              <button
                type="button"
                onClick={openMobileWorld}
                className="absolute bottom-4 left-1/2 z-40 flex min-h-12 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-amber-100/30 bg-amber-300 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[0_10px_36px_rgba(0,0,0,.6)] active:scale-95"
              >
                <Gamepad2 className="size-5" />
                Enter 3D world
              </button>
            </>
          ) : undefined}
          view={{
            ...map.view,
            mobileInput: mobileWorldOpen ? mobileInput : null,
            planItems: NO_PLAN_ITEMS,
            planSelectedId: null,
            planInput: null,
          }}
          overlay={(
            <>
              {props.context.instance.id === "leeroy" && <LeeroyFeaturedUnits />}
              {mobileWorldOpen && (
                <MobileMapControls
                  walking={walking}
                  canWalk={canWalk}
                  onWalkingChange={setWalking}
                  onInputChange={setMobileInput}
                  onClose={closeMobileWorld}
                />
              )}
              {floorControls && <div className="absolute bottom-2 left-2 z-40 max-w-[calc(100%-1rem)]">{floorControls}</div>}
              {/* X toggles the replay: flash play or pause over the map, like a video player. */}
              <ReplayToggleFlash />
              {player.reloading && <ReloadingChip />}
            </>
          )}
        />
      </div>
    </PortalContainerProvider>
  );
}
