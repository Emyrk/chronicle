import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import type { HeroReplay } from "./heroReplay";

// The 3D chunk (three.js, the Map scene, the featured run's data): requested only once the trigger below fires.
const LandingHero3D = lazy(() => import("./LandingHero3D"));

// The featured run until the config car moves it to a site setting: a public
// instance with unit positions and a published dungeon mesh.
const FEATURED_INSTANCE: string | undefined = import.meta.env.VITE_LANDING_FEATURED_INSTANCE || undefined;
/** Where in the featured run the replay starts, in seconds from its start. */
const FEATURED_START_OFFSET_MS = (Number(import.meta.env.VITE_LANDING_FEATURED_START_S) || 0) * 1000;
/** requestIdleCallback's deadline: the 3D layer starts loading by then even on a busy page. */
const IDLE_TIMEOUT_MS = 1500;

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

function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(callback, IDLE_TIMEOUT_MS);
  return () => window.clearTimeout(timer);
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
 */
export function HeroReplayLayer({ onReplay }: { onReplay: (replay: HeroReplay | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [allowed] = useState(() => Boolean(FEATURED_INSTANCE) && canShow3D());
  const [inView, setInView] = useState(false);
  const [load, setLoad] = useState(false);
  const pageVisible = usePageVisible();

  useEffect(() => {
    const element = ref.current;
    if (!allowed || !element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [allowed]);

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
      {load && FEATURED_INSTANCE && (
        <SilentBoundary>
          <Suspense fallback={null}>
            <LandingHero3D
              instanceId={FEATURED_INSTANCE}
              startOffsetMs={FEATURED_START_OFFSET_MS}
              active={inView && pageVisible}
              onReplay={onReplay}
            />
          </Suspense>
        </SilentBoundary>
      )}
    </div>
  );
}
