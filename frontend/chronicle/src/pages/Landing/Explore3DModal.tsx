import { Component, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { BarChart3, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { InstanceEventsContext, InstanceEventsProvider } from "@/hooks/instanceEvents";
import { prefersReducedMotion } from "@/pages/Instance/EventsPanels/Map/mapModel";
import { trackFunnel } from "@/utils/funnel";
import type { BossRail } from "./BossRail";
import { deathsFromRecaps, exploreRunFromInstance, fullRunHref, type ExploreTarget } from "./explore3D";
import type { HeroMeterPane } from "./heroMeter";
import type { HeroMeter } from "./HeroMeter";
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

/** The desktop stats column's collapse, for the session. */
const STATS_COLLAPSED_KEY = "landing-explore-stats-collapsed";

function readStatsCollapsed() {
  try {
    return sessionStorage.getItem(STATS_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function ToggleButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  const Icon = expanded ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse the stats" : "Expand the stats"}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 text-muted-foreground hover:text-foreground"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/**
 * The hero's stats column over the scene, following the modal's cursor: the glass meter, then Threat (estimated) or
 * Raid Frames. Desktop docks it top-right (clear of the compass, bottom-right), collapsible; phones start on a
 * three-bar strip at the bottom, a tap expands it. In an open meter a bar click drills into that player.
 */
function ExploreStats({ replay, Meter }: { replay: HeroReplay; Meter: typeof HeroMeter }) {
  const [pane, setPane] = useState<HeroMeterPane>("damage_done");
  const [statsPane, setStatsPane] = useState<"threat" | "frames">("threat");
  const [collapsed, setCollapsed] = useState(readStatsCollapsed);
  const [phoneExpanded, setPhoneExpanded] = useState(false);
  const meter = replay.meter;
  if (!meter) return null;
  const toggleDesktop = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      sessionStorage.setItem(STATS_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Not remembered without storage.
    }
  };
  // As on the hero: Threat and Raid Frames share one slot; Raid Frames only from lg up.
  const cards = (
    <>
      {replay.renderThreat && (
        <div className={statsPane === "frames" && replay.renderRaidFrames ? "lg:hidden" : undefined}>
          {replay.renderThreat(replay.renderRaidFrames ? () => setStatsPane("frames") : null)}
        </div>
      )}
      {replay.renderRaidFrames && (
        <div className={statsPane === "frames" || !replay.renderThreat ? "hidden lg:block" : "hidden"}>
          {replay.renderRaidFrames(replay.renderThreat ? () => setStatsPane("threat") : null)}
        </div>
      )}
    </>
  );
  const expandPhone = () => setPhoneExpanded(true);
  return (
    <>
      <div className="styled-scrollbar absolute right-4 top-4 z-20 hidden max-h-[calc(100%-6rem)] w-[320px] flex-col gap-2 overflow-y-auto lg:flex">
        {collapsed ? (
          <button
            type="button"
            aria-expanded={false}
            onClick={toggleDesktop}
            className="flex items-center gap-1.5 self-end rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur-md hover:border-primary"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Show the stats
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <>
            <Meter data={meter} sourceKey="explore" pane={pane} onPaneChange={setPane} placement="explore" action={<ToggleButton expanded onClick={toggleDesktop} />} />
            {cards}
          </>
        )}
      </div>
      {phoneExpanded ? (
        <div className="styled-scrollbar absolute inset-x-2 bottom-[76px] top-14 z-20 flex flex-col gap-2 overflow-y-auto lg:hidden">
          <Meter data={meter} sourceKey="explore" pane={pane} onPaneChange={setPane} placement="explore" action={<ToggleButton expanded onClick={() => setPhoneExpanded(false)} />} />
          {cards}
        </div>
      ) : (
        // Clear of the compass in the bottom-right corner.
        <div className="absolute bottom-2 left-2 right-[76px] z-20 lg:hidden">
          <Meter data={meter} sourceKey="explore" pane={pane} onPaneChange={setPane} rows={3} onOpen={expandPhone} action={<ToggleButton expanded={false} onClick={expandPhone} />} />
        </div>
      )}
    </>
  );
}

/**
 * Explore in 3D: the run's pull on the real Map scene, the camera the visitor's (orbit, pan, zoom, touch; click a
 * player to follow), the hero's scrubber and the boss rail. Full viewport on desktop, a full-screen sheet on phones.
 * Esc or the close button dismisses it; focus stays inside and returns to where it was on close.
 * The page hands over its own scrubber, boss rail and glass meter: imported here, they would split out of /start's first chunk.
 */
export default function Explore3DModal({ target, onClose, Scrubber, Rail, Meter }: {
  target: ExploreTarget;
  onClose: () => void;
  Scrubber: typeof HeroScrubber;
  Rail: typeof BossRail;
  Meter: typeof HeroMeter;
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
        {replay && <ExploreStats replay={replay} Meter={Meter} />}
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
