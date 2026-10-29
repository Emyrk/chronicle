import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { trackFunnel } from "@/utils/funnel";
import type { HeroReplay, HeroWindow } from "./heroReplay";
import { whenIdle } from "./whenIdle";

// The 3D chunk (three.js, the Map scene, the featured run's data): requested only once the trigger below fires.
const LandingHero3D = lazy(() => import("./LandingHero3D"));

/** Where in the featured run the replay starts, in seconds from its start. */
const FEATURED_START_OFFSET_MS = (Number(import.meta.env.VITE_LANDING_FEATURED_START_S) || 0) * 1000;
/** How long the hero must play (or the poster stay in view) before hero_play_3s. */
const HERO_PLAY_EVENT_MS = 3000;

interface NavigatorConnection {
  saveData?: boolean;
}

/** No 3D for reduced motion, data saver, or a browser without WebGL2: the poster stays. */
function canShow3D(): boolean {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  if ((navigator as Navigator & { connection?: NavigatorConnection }).connection?.saveData) return false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

// A failed 3D chunk or scene leaves the poster as it is.
class SilentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

/**
 * The hero's 3D slot: mounts LandingHero3D after the shell's first paint,
 * once the hero is on screen and the browser is idle (or 1.5 s passed), and
 * pauses it while the hero is scrolled away or the tab is hidden.
 * Sends hero_play_3s once the 3D replay has played for 3 s on screen, or,
 * with 3D suppressed (or no featured run), once the poster has been on screen for 3 s.
 */
export function HeroReplayLayer({ instanceId, pull, onReplay }: {
  /** The featured run: a public instance with unit positions and a published dungeon mesh; without one, the poster stays. */
  instanceId?: string;
  /** The featured run's boss pull to loop; without one the whole run plays. */
  pull?: HeroWindow | null;
  onReplay: (replay: HeroReplay | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [allowed] = useState(() => Boolean(instanceId) && canShow3D());
  const [inView, setInView] = useState(false);
  const [load, setLoad] = useState(false);
  const pageVisible = usePageVisible();
  const [playing3D, setPlaying3D] = useState(false);
  const heroPlaySent = useRef(false);

  const handleReplay = useCallback((replay: HeroReplay | null) => {
    onReplay(replay);
    setPlaying3D(replay?.playing ?? false);
  }, [onReplay]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A 3 s stretch of uninterrupted play on screen; a pause, scroll-away or hidden tab restarts it.
  const heroMode = !inView || !pageVisible ? null : allowed ? (playing3D ? "3d" : null) : "poster";
  useEffect(() => {
    if (!heroMode || heroPlaySent.current) return;
    const timer = window.setTimeout(() => {
      heroPlaySent.current = true;
      trackFunnel("hero_play_3s", { mode: heroMode });
    }, HERO_PLAY_EVENT_MS);
    return () => window.clearTimeout(timer);
  }, [heroMode]);

  useEffect(() => {
    if (!allowed || load || !inView) return;
    // Two frames: the shell has painted at least once before the 3D work starts.
    let cancelIdle: (() => void) | null = null;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        cancelIdle = whenIdle(() => setLoad(true));
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelIdle?.();
    };
  }, [allowed, inView, load]);

  return (
    <div ref={ref} className="absolute inset-0">
      {load && instanceId && (
        <SilentBoundary>
          <Suspense fallback={null}>
            <LandingHero3D
              instanceId={instanceId}
              startOffsetMs={FEATURED_START_OFFSET_MS}
              pull={pull}
              active={inView && pageVisible}
              onReplay={handleReplay}
            />
          </Suspense>
        </SilentBoundary>
      )}
    </div>
  );
}
