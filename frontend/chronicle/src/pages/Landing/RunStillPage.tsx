import { useCallback, useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { useInstance } from "@/api/queries";
import type { WoWParsedInstance } from "@/api/typesGenerated";
import LandingHero3D from "./LandingHero3D";
import type { HeroReplay } from "./heroReplay";

declare global {
  interface Window {
    /** Read by the server's still renderer (chronicle/run_still.go): true once the replay is on screen. */
    __runStillReady?: true | "failed";
  }
}

/**
 * The still's moment, in ms from the first played encounter's start (the hero's run time):
 * halfway through the first boss kill, else through the longest played encounter.
 */
function runStillOffsetMs(instance: WoWParsedInstance): number {
  const played = (instance.encounters ?? [])
    .filter((encounter) => encounter.kill_type !== "wipe" && encounter.kill_type !== "reset")
    .map((encounter) => ({ boss: encounter.boss, start: Date.parse(encounter.start_time), end: Date.parse(encounter.end_time) }))
    .filter((encounter) => Number.isFinite(encounter.start) && Number.isFinite(encounter.end))
    .sort((a, b) => a.start - b.start);
  if (played.length === 0) return 0;
  const pick = played.find((encounter) => encounter.boss)
    ?? played.reduce((longest, encounter) => (encounter.end - encounter.start > longest.end - longest.start ? encounter : longest));
  return pick.start + (pick.end - pick.start) / 2 - played[0].start;
}

/** Bare 640x360 replay of one run, opened by the server's headless renderer to take the run's still. */
export function RunStillPage() {
  const { instanceId = "" } = useParams();
  const { data: instance, isError } = useInstance(instanceId);
  const startOffsetMs = useMemo(() => (instance ? runStillOffsetMs(instance) : null), [instance]);

  const frameRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(false);

  useEffect(() => {
    if (isError) window.__runStillReady = "failed";
  }, [isError]);
  // Ready once the replay is up and every map image (the 2D view's tiles) has loaded.
  const onReplay = useCallback((replay: HeroReplay | null) => {
    if (!replay || shownRef.current) return;
    shownRef.current = true;
    const check = () => {
      const images = [...(frameRef.current?.querySelectorAll("img") ?? [])];
      if (images.every((image) => image.complete)) window.__runStillReady = true;
      else window.setTimeout(check, 250);
    };
    check();
  }, []);

  return (
    <div ref={frameRef} className="relative h-[360px] w-[640px] overflow-hidden bg-[#0c1322]">
      {startOffsetMs !== null && (
        <LandingHero3D instanceId={instanceId} startOffsetMs={startOffsetMs} active onReplay={onReplay} still />
      )}
    </div>
  );
}
