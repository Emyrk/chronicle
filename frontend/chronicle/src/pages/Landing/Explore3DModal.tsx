import { Component, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { InstanceEventsContext, InstanceEventsProvider } from "@/hooks/instanceEvents";
import { prefersReducedMotion } from "@/pages/Instance/EventsPanels/Map/mapModel";
import { trackFunnel } from "@/utils/funnel";
import type { BossRail } from "./BossRail";
import { deathsFromRecaps, exploreRunFromInstance, fullRunHref, type ExploreTarget } from "./explore3D";
import { heroWindow, type HeroReplay } from "./heroReplay";
import type { HeroScrubber } from "./LandingHero";
import { HeroScene } from "./LandingHero3D";
import { useLandingInstance } from "./useLandingInstance";

const FOCUSABLE = "a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])";

// A failed scene reports it (the stage says so instead of spinning); the full run link stays.
class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The run's own stream cache, unless the modal renders inside the hero's (it took over the hero's loaded run). */
function RunEvents({ instanceId, children }: { instanceId: string; children: ReactNode }) {
  const shared = useContext(InstanceEventsContext);
  return shared ? <>{children}</> : <InstanceEventsProvider instanceId={instanceId}>{children}</InstanceEventsProvider>;
}

/**
 * Explore in 3D: the run's pull on the real Map scene, the camera the visitor's (orbit, pan, zoom, touch; click a
 * player to follow), the hero's scrubber and the boss rail. Full viewport on desktop, a full-screen sheet on phones.
 * Esc or the close button dismisses it; focus stays inside and returns to where it was on close.
 * The page hands over its own scrubber and boss rail: imported here, they would split out of /start's first chunk.
 */
export default function Explore3DModal({ target, onClose, Scrubber, Rail }: {
  target: ExploreTarget;
  onClose: () => void;
  Scrubber: typeof HeroScrubber;
  Rail: typeof BossRail;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const instance = useLandingInstance(target.instanceId);
  const run = useMemo(() => target.run ?? (instance ? exploreRunFromInstance(instance) : null), [instance, target.run]);
  const [encounterId, setEncounterId] = useState(target.encounterId ?? null);
  const [replay, setReplay] = useState<HeroReplay | null>(null);
  const [failed, setFailed] = useState(false);
  const [startPaused] = useState(prefersReducedMotion);
  const shown = useMemo(() => run ? heroWindow(run, encounterId) : null, [encounterId, run]);
  // The landing payload has the deaths; a run built from its instance takes them from the replay's recaps.
  const recaps = replay?.deathRecaps ?? null;
  const scrubberRun = useMemo(() => shown && !target.run && recaps ? { ...shown.run, deaths: deathsFromRecaps(recaps) } : shown?.run ?? null,
    [recaps, shown, target.run]);
  const bossName = shown?.window ? shown.run.bosses[0]?.name : null;
  const title = [run?.instance_name ?? instance?.name, bossName].filter(Boolean).join(" · ");

  // Focus moves in on open and back on close; the page under it does not scroll.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const href = fullRunHref({ id: target.instanceId, slug: instance?.slug });

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Explore ${title}` : "Explore the run"}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[100] flex flex-col bg-background text-foreground animate-in fade-in-0 duration-200 max-lg:slide-in-from-bottom-8 motion-reduce:animate-none"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b px-4 py-2 lg:px-6">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold lg:text-base">{title || "Loading the run"}</span>
          <span className="hidden text-xs text-muted-foreground sm:block">
            <span className="lg:hidden">Drag to orbit · pinch to zoom · tap a player to follow</span>
            <span className="hidden lg:inline">Drag to orbit · right-drag to pan · scroll to zoom · click a player to follow</span>
          </span>
        </div>
        <Link
          to={href}
          onClick={() => trackFunnel("explore_3d_full_run", { placement: target.placement })}
          className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground no-underline hover:brightness-110 lg:min-h-9 lg:px-4"
        >
          Open the full run →
        </Link>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border bg-card hover:border-primary lg:h-9 lg:w-9"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-card">
        {!replay && (
          // The run loads over its poster (or dungeon art); a scene taken over from the hero is up at once.
          <div className="absolute inset-0 flex items-center justify-center">
            {target.poster && <img src={target.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
            <div className="relative flex items-center gap-2 rounded-md border bg-background/85 px-3 py-2 text-sm text-muted-foreground">
              {failed ? (
                <span role="status">This run can't be shown here. Open the full run instead.</span>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  <span role="status">Loading the run…</span>
                </>
              )}
            </div>
          </div>
        )}
        {instance && shown && (
          <SceneBoundary onError={() => setFailed(true)}>
            <RunEvents instanceId={target.instanceId}>
              <HeroScene
                instance={instance}
                startOffsetMs={0}
                pull={shown.window}
                active
                onReplay={setReplay}
                explore
                startPaused={startPaused}
                initialMs={target.startMs ?? 0}
              />
            </RunEvents>
          </SceneBoundary>
        )}
      </div>

      {scrubberRun && (
        <div className="shrink-0 border-t bg-background px-4 py-3 lg:px-6">
          <Scrubber run={scrubberRun} currentMs={replay?.currentMs ?? 0} playback={replay} trackInteractions={false} />
        </div>
      )}
      {run && run.bosses.length > 0 && (
        <Rail bosses={run.bosses} selectedId={shown?.window?.encounterId ?? null} onPick={setEncounterId} />
      )}
    </div>,
    document.body,
  );
}
