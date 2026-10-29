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

/** Phones, data saver and reduced motion keep the clip (or poster) until the visitor asks for the 3D. */
function autoplays3D(): boolean {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.matchMedia?.("(max-width: 899px)").matches) return false;
  return !(navigator as Navigator & { connection?: NavigatorConnection }).connection?.saveData;
}

/** No 3D at all without WebGL2. */
function hasWebGL2(): boolean {
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

/** One montage entry: a public instance with unit positions and a published dungeon mesh, and the boss pull to loop. */
export interface HeroEntry {
  instanceId: string;
  /** Without one the whole run plays. */
  pull?: HeroWindow | null;
}

/** One entry's replay. A hidden slot preloads (instance, streams, mesh) without playing or showing. */
function HeroSlot({ slotKey, entry, active, hidden, onPullEnd, onReplay }: {
  slotKey: string;
  entry: HeroEntry;
  active: boolean;
  hidden: boolean;
  onPullEnd?: () => void;
  onReplay: (slotKey: string, replay: HeroReplay | null) => void;
}) {
  const report = useCallback((replay: HeroReplay | null) => onReplay(slotKey, replay), [onReplay, slotKey]);
  return (
    // visibility, not an opacity fade: the cut to a preloaded entry is hard, and its scene keeps its size while hidden.
    <div className="absolute inset-0" style={hidden ? { visibility: "hidden" } : undefined}>
      <SilentBoundary>
        <Suspense fallback={null}>
          <LandingHero3D
            instanceId={entry.instanceId}
            startOffsetMs={FEATURED_START_OFFSET_MS}
            pull={entry.pull}
            active={active}
            onPullEnd={onPullEnd}
            onReplay={report}
          />
        </Suspense>
      </SilentBoundary>
    </div>
  );
}

/**
 * The hero's 3D slot: mounts LandingHero3D after the shell's first paint,
 * once the hero is on screen and the browser is idle (or 1.5 s passed), and
 * pauses it while the hero is scrolled away or the tab is hidden.
 * With several entries it plays entries[index]'s pull, and once that plays,
 * preloads the next entry (hidden, so never more than one mesh ahead); at the
 * end of a pull it cuts to the next entry if that is ready, else loops the pull.
 * On phones, with data saver or reduced motion it mounts only once `requested`
 * (the visitor touched the scrubber, a boss chip or the meter); a request
 * elsewhere skips the idle wait.
 * Sends hero_play_3s once the 3D replay has played for 3 s on screen, or,
 * with 3D suppressed (or no featured run), once the poster has been on screen for 3 s.
 */
export function HeroReplayLayer({ entries, index, requested = false, onAdvance, onReplay }: {
  /** The montage; empty leaves the poster. */
  entries: HeroEntry[];
  /** The entry playing. */
  index: number;
  /** The visitor asked for the live replay: load it now. */
  requested?: boolean;
  /** Moves the montage on to the next entry. */
  onAdvance: () => void;
  onReplay: (replay: HeroReplay | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [webgl] = useState(() => entries.length > 0 && hasWebGL2());
  const [auto] = useState(autoplays3D);
  const allowed = webgl && (auto || requested);
  const [inView, setInView] = useState(false);
  const [load, setLoad] = useState(false);
  const pageVisible = usePageVisible();
  const [playing3D, setPlaying3D] = useState(false);
  // The slot whose replay has played (the next entry preloads only then), and the preloaded slot that is ready to show.
  const [playedKey, setPlayedKey] = useState<string | null>(null);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const heroPlaySent = useRef(false);

  const current = entries.length > 0 ? index % entries.length : -1;
  const next = entries.length > 1 ? (current + 1) % entries.length : -1;
  // Keyed by entry, so the preloaded slot is the one that plays after the cut.
  const currentKey = `entry-${current}`;
  const nextKey = next < 0 ? null : `entry-${next}`;

  const handleReplay = useCallback((slotKey: string, replay: HeroReplay | null) => {
    if (slotKey !== currentKey) {
      setReadyKey((key) => (replay ? slotKey : key === slotKey ? null : key));
      return;
    }
    onReplay(replay);
    setPlaying3D(replay?.playing ?? false);
    if (replay?.playing) setPlayedKey(slotKey);
  }, [currentKey, onReplay]);
  const nextReady = nextKey !== null && readyKey === nextKey;
  const handlePullEnd = useCallback(() => {
    if (nextReady) onAdvance();
  }, [nextReady, onAdvance]);

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
    if (!allowed || load || requested || !inView) return;
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
  }, [allowed, inView, load, requested]);
  // A request mounts it at once.
  const mounted = load || (allowed && requested);

  return (
    <div ref={ref} className="absolute inset-0">
      {mounted && current >= 0 && (
        <HeroSlot
          key={currentKey}
          slotKey={currentKey}
          entry={entries[current]}
          active={inView && pageVisible}
          hidden={false}
          onPullEnd={nextKey ? handlePullEnd : undefined}
          onReplay={handleReplay}
        />
      )}
      {mounted && nextKey && playedKey === currentKey && (
        <HeroSlot key={nextKey} slotKey={nextKey} entry={entries[next]} active={false} hidden onReplay={handleReplay} />
      )}
    </div>
  );
}
