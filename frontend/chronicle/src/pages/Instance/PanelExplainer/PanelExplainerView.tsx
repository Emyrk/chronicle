/**
 * PanelExplainerView — full-page learning mode for a single panel.
 *
 * Panels with a LessonSet get the full shell: lesson sidebar (capability-aware
 * states), a lesson area (video where authored), and the live panel below so
 * users can immediately try what they watched. Panels with only summary/tips
 * get the simple fallback layout.
 *
 * Mobile: this view is not shown on mobile — tooltips are used instead.
 */

import { ArrowLeft, ArrowRight, BookOpen, FlaskConical, Lightbulb, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { EventsPanel } from "../EventsPanels";
import { PANELS, type EventsPanelType } from "../EventsPanels/EventsPanel";
import { getExplainer } from "../EventsPanels/explainers";
import type { PanelContext } from "../EventsPanels/types";
import { usePanelAggregation } from "../EventsPanels/usePanelAggregation";
import { ExplainerTopBar } from "./ExplainerTopBar";
import { LessonPlayer } from "./LessonPlayer";
import { LessonSidebar, type LessonSelection } from "./LessonSidebar";
import type { Lesson, LessonSet, PanelExplainer } from "./types";

export interface PanelExplainerViewProps {
  /** The panel type being explained */
  panelType: EventsPanelType;
  /** The source panel's option string (series config, toggles, …) so the
   *  live panel matches what the user was looking at. */
  panelOption?: string | null;
  /** Panel context for rendering the live panel */
  context: PanelContext;
  /** Duration in ms for per-second calculations */
  durationMs: number;
  /** Callback to exit explainer mode */
  onExit: () => void;
  /** Storybook/testing only: start in this data mode. */
  initialMode?: "live" | "example";
}

export function PanelExplainerView({
  panelType,
  panelOption,
  context,
  durationMs,
  onExit,
  initialMode,
}: PanelExplainerViewProps) {
  const explainer = getExplainer(panelType);

  if (!explainer) {
    // Shouldn't happen (the ? button is gated by hasExplainer), but fall back gracefully.
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={onExit}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="mt-4 text-muted-foreground">No explainer available for this panel.</p>
      </div>
    );
  }

  if (explainer.lessonSet) {
    return (
      <LessonShell
        panelType={panelType}
        panelOption={panelOption}
        explainer={explainer}
        lessonSet={explainer.lessonSet}
        context={context}
        durationMs={durationMs}
        onExit={onExit}
        initialMode={initialMode}
      />
    );
  }

  return (
    <FallbackExplainer
      panelType={panelType}
      panelOption={panelOption}
      explainer={explainer}
      context={context}
      durationMs={durationMs}
      onExit={onExit}
    />
  );
}

const NO_EXTRAS = {};
function useNoLiveExtras(): Record<string, never> {
  return NO_EXTRAS;
}

/** Full learning shell for panels with authored lessons. */
function LessonShell<TResult, TCaps>({
  panelType,
  panelOption,
  explainer,
  lessonSet,
  context,
  durationMs,
  onExit,
  initialMode,
}: {
  panelType: EventsPanelType;
  panelOption?: string | null;
  explainer: PanelExplainer<TResult, TCaps>;
  lessonSet: LessonSet<TResult, TCaps>;
  context: PanelContext;
  durationMs: number;
  onExit: () => void;
  initialMode?: "live" | "example";
}) {
  const panel = PANELS[panelType];
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<"live" | "example">(initialMode ?? "live");

  // Two-way hover linking between lesson rows and tagged panel regions:
  // hovering a lesson boxes its [data-lesson-target] elements in the panel,
  // and hovering a tagged element lights up its lesson in the sidebar.
  const liveAreaRef = useRef<HTMLDivElement>(null);
  const [hoveredLessonId, setHoveredLessonId] = useState<string | null>(null);
  const [panelLessonId, setPanelLessonId] = useState<string | null>(null);

  const handlePanelMouseOver = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as Element).closest?.("[data-lesson-target]");
      const id = target?.getAttribute("data-lesson-target") ?? null;
      setPanelLessonId(id && lessonSet.lessons.some((l) => l.id === id) ? id : null);
    },
    [lessonSet],
  );
  const handlePanelMouseLeave = useCallback(() => setPanelLessonId(null), []);

  // Live aggregation feeds both capabilities and the embedded panel.
  const aggregation = usePanelAggregation<TResult>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panel: panel as any,
    context,
    panelIndex: 0,
  });

  // Live-query capability extras (e.g. parse availability). The hook is
  // stable per mount — the shell remounts when panelType changes.
  const useLiveExtras = lessonSet.useLiveCapabilityExtras ?? useNoLiveExtras;
  const liveExtras = useLiveExtras(context);

  const caps = useMemo(
    () => ({
      ...lessonSet.deriveCapabilities(aggregation.result ?? null, durationMs, context.instance),
      ...liveExtras,
    }),
    [lessonSet, aggregation.result, durationMs, context.instance, liveExtras],
  );

  const lessonParam = searchParams.get("lesson");
  const selectedLesson: Lesson<TCaps> | null = useMemo(
    () => lessonSet.lessons.find((l) => l.id === lessonParam) ?? null,
    [lessonSet, lessonParam],
  );

  const selectLesson = useCallback(
    (selection: LessonSelection | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (selection) next.set("lesson", selection.lessonId);
          else next.delete("lesson");
          return next;
        },
        { replace: true },
      );
      if (selection) setMode(selection.mode);
    },
    [setSearchParams],
  );

  // Example mode is hidden from user flows for now (the example panel needs
  // work) — lessons always render against live data. `initialMode: "example"`
  // remains a storybook/testing escape hatch.
  const effectiveMode = initialMode === "example" ? mode : "live";

  const returnToLive = useCallback(() => {
    // Leaving example mode on an example-forced lesson also closes the lesson.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("lesson");
        return next;
      },
      { replace: true },
    );
    setMode("live");
  }, [setSearchParams]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <ExplainerTopBar
        panelLabel={panel?.label ?? panelType}
        panelIcon={panel?.icon}
        instanceName={context.instance?.name}
        encounterCount={context.selectedEncounterIds.length}
        onExit={onExit}
      />
      <div className="flex min-h-0 flex-1">
        <LessonSidebar
          panelLabel={panel?.label ?? panelType}
          lessons={lessonSet.lessons}
          caps={caps}
          selectedLessonId={selectedLesson?.id ?? null}
          onSelect={selectLesson}
          onHoverLesson={setHoveredLessonId}
          highlightedLessonId={panelLessonId}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-6 pt-5">
          {effectiveMode === "example" && (
            <ExampleModeBanner onReturn={returnToLive} />
          )}

          {selectedLesson ? (
            <LessonHeaderCard
              lesson={selectedLesson}
              mode={effectiveMode}
              onClose={() => selectLesson(null)}
            />
          ) : (
            <IntroCard summary={explainer.summary} />
          )}

          <div className="mt-1 flex flex-shrink-0 items-center gap-3">
            <span className="text-[13px] font-semibold">Try it yourself</span>
            <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
              {effectiveMode === "example" ? "EXAMPLE DATA" : "LIVE DATA"}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div
            ref={liveAreaRef}
            className="relative h-[560px] flex-shrink-0"
            onMouseOver={handlePanelMouseOver}
            onMouseLeave={handlePanelMouseLeave}
          >
            {effectiveMode === "example" ? (
              lessonSet.renderExample()
            ) : (
              <div className="h-full rounded-lg border border-border bg-card p-2">
                {/* The REAL panel, exactly as it renders on the instance page —
                    including the configuration it was opened from. */}
                <EventsPanel
                  panelType={panelType}
                  onPanelTypeChange={() => {}}
                  durationMs={durationMs}
                  context={context}
                  panelIndex={0}
                  panelOption={panelOption}
                />
              </div>
            )}
            <LessonTargetOverlay containerRef={liveAreaRef} lessonId={hoveredLessonId} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Draws pulsing boxes over every [data-lesson-target="<lessonId>"] element in
 * the live area while a lesson row is hovered. Rects are measured on hover
 * entry (and window resize) relative to the container, so the overlay scrolls
 * with the page for free.
 */
function LessonTargetOverlay({
  containerRef,
  lessonId,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  lessonId: string | null;
}) {
  // Keyed by lesson id: a stale entry (different lesson, or hover ended)
  // simply doesn't render, so the effect never needs to clear state.
  const [measured, setMeasured] = useState<{
    lessonId: string;
    boxes: Array<{ left: number; top: number; width: number; height: number }>;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !lessonId) return;
    const measure = () => {
      const cRect = container.getBoundingClientRect();
      const els = container.querySelectorAll(`[data-lesson-target="${lessonId}"]`);
      const boxes: Array<{ left: number; top: number; width: number; height: number }> = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        let left = r.left - 4;
        let top = r.top - 4;
        let right = r.right + 4;
        let bottom = r.bottom + 4;
        // Clip against every scroll/overflow ancestor so targets scrolled out
        // of an inner viewport (e.g. chart rows) don't paint over the chrome.
        for (let node = el.parentElement; node && node !== container; node = node.parentElement) {
          const cs = getComputedStyle(node);
          if (/(auto|scroll|hidden)/.test(cs.overflowX + cs.overflowY)) {
            const nr = node.getBoundingClientRect();
            left = Math.max(left, nr.left);
            top = Math.max(top, nr.top);
            right = Math.min(right, nr.right);
            bottom = Math.min(bottom, nr.bottom);
          }
        }
        // Fully (or nearly fully) hidden targets get no box at all.
        if (right - left < 12 || bottom - top < 10) continue;
        boxes.push({
          left: left - cRect.left,
          top: top - cRect.top,
          width: right - left,
          height: bottom - top,
        });
      }
      setMeasured({ lessonId, boxes });
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    // Capture-phase: inner scroll areas (the chart) re-measure too.
    container.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      container.removeEventListener("scroll", measure, true);
    };
  }, [containerRef, lessonId]);

  const boxes = measured?.lessonId === lessonId ? measured.boxes : [];
  if (boxes.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {boxes.map((box, i) => (
        <div
          key={i}
          className="absolute animate-pulse rounded-md border-2 border-primary bg-primary/10 shadow-[0_0_14px_-2px_var(--primary)]"
          style={box}
        />
      ))}
    </div>
  );
}

function ExampleModeBanner({ onReturn }: { onReturn: () => void }) {
  return (
    <div className="flex flex-shrink-0 items-start gap-3 rounded-lg border border-class-rogue/40 bg-class-rogue/10 px-3.5 py-3">
      <span className="mt-px flex flex-shrink-0 items-center gap-1.5 rounded-full bg-class-rogue px-2 py-0.5 font-mono text-[9.5px] tracking-[0.08em] text-background">
        <FlaskConical className="h-3 w-3" />
        EXAMPLE DATA
      </span>
      <p className="min-w-0 flex-1 text-[12.5px] leading-normal text-pretty">
        Showing a sample raid built to demonstrate this feature. Your encounter selection,
        filters, and panel configuration have not changed.
      </p>
      <button
        type="button"
        onClick={onReturn}
        className="flex-shrink-0 rounded-sm border border-border bg-secondary px-2.5 py-1 text-[11.5px] font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
      >
        Return to your data
      </button>
    </div>
  );
}

function LessonHeaderCard<TCaps>({
  lesson,
  mode,
  onClose,
}: {
  lesson: Lesson<TCaps>;
  mode: "live" | "example";
  onClose: () => void;
}) {
  return (
    <div className="flex flex-shrink-0 flex-col gap-1.5 rounded-lg border border-border bg-popover px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="text-[13px] font-semibold">{lesson.title}</span>
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
          {mode === "example" ? "example data" : "your data"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close lesson"
          className="px-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {lesson.video && <LessonPlayer video={lesson.video} lessonId={lesson.id} />}
      {lesson.bullets ? (
        <ul className="max-w-[78ch] list-disc space-y-0.5 pl-5 text-[12.5px] leading-relaxed text-pretty">
          {lesson.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : (
        <p className="max-w-[78ch] text-[12.5px] leading-relaxed text-pretty">
          {lesson.instruction}
        </p>
      )}
      {lesson.learnMore && (
        <Link
          to={lesson.learnMore.href}
          className="flex w-fit items-center gap-1.5 text-[12px] font-medium text-primary hover:text-foreground"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {lesson.learnMore.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function IntroCard({ summary }: { summary: string }) {
  return (
    <div className="flex flex-shrink-0 items-start gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
      <BookOpen className="mt-px h-[15px] w-[15px] flex-shrink-0 text-muted-foreground" />
      <div>
        <p className="mb-1 text-[12.5px]">{summary}</p>
        <p className="text-[11.5px] text-muted-foreground">
          Pick a lesson on the left to walk through it here. The panel stays live the whole
          time.
        </p>
      </div>
    </div>
  );
}

/** Simple summary/tips layout for panels without a lesson set. */
function FallbackExplainer({
  panelType,
  panelOption,
  explainer,
  context,
  durationMs,
  onExit,
}: {
  panelType: EventsPanelType;
  panelOption?: string | null;
  explainer: PanelExplainer;
  context: PanelContext;
  durationMs: number;
  onExit: () => void;
}) {
  const panel = PANELS[panelType];

  return (
    <div className="min-h-screen bg-background">
      <ExplainerTopBar
        panelLabel={panel?.label ?? panelType}
        panelIcon={panel?.icon}
        instanceName={context.instance?.name}
        encounterCount={context.selectedEncounterIds.length}
        onExit={onExit}
      />

      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" />
              What this panel shows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{explainer.summary}</p>
          </CardContent>
        </Card>

        <div className="h-[500px] rounded-lg border border-border bg-card p-2">
          <EventsPanel
            panelType={panelType}
            onPanelTypeChange={() => {}}
            durationMs={durationMs}
            context={context}
            panelIndex={0}
            panelOption={panelOption}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4" />
              Tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {explainer.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
