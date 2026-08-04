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
import { useCallback, useMemo, useState } from "react";
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
  explainer,
  lessonSet,
  context,
  durationMs,
  onExit,
  initialMode,
}: {
  panelType: EventsPanelType;
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

  // Example-forced lessons (exampleOnly, or the live data can't teach them)
  // always render in example mode — derived, so deep links work without effects.
  const exampleForced =
    !!selectedLesson &&
    (selectedLesson.exampleOnly || selectedLesson.deriveState(caps) === "example-required");
  const effectiveMode = exampleForced ? "example" : mode;

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

          <div className="h-[560px] flex-shrink-0">
            {effectiveMode === "example" ? (
              lessonSet.renderExample()
            ) : (
              <div className="h-full rounded-lg border border-border bg-card p-2">
                {/* The REAL panel, exactly as it renders on the instance page. */}
                <EventsPanel
                  panelType={panelType}
                  onPanelTypeChange={() => {}}
                  durationMs={durationMs}
                  context={context}
                  panelIndex={0}
                />
              </div>
            )}
          </div>
        </div>
      </div>
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
  explainer,
  context,
  durationMs,
  onExit,
}: {
  panelType: EventsPanelType;
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
