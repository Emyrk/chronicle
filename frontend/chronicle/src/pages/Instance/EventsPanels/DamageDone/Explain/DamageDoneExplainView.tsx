/**
 * DamageDoneExplainView — Sidebar + Remotion Player explain page.
 *
 * Left sidebar: lesson list grouped by category.
 * Right main area: Remotion Player walkthrough for the active lesson,
 * plus the live/example DamageDoneContent panel below.
 *
 * Remotion compositions are embedded via @remotion/player — no pre-rendered
 * videos, always matches the current UI style.
 */

import { useState, useMemo, useCallback } from "react";
import { Player } from "@remotion/player";
import { ArrowLeft, BookOpen, ChevronRight, FlaskConical, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/Card/Card";
import { Switch } from "@/components/ui/Switch/Switch";
import { cn } from "@/lib/utils";

import type { DamageDoneResult } from "../damageDone.processor";
import { DamageDoneContent } from "../DamageDoneContent";
import type { PanelContext, PanelRenderProps } from "../../types";
import { PANELS } from "../../EventsPanel";
import { usePanelAggregation } from "../../usePanelAggregation";

import {
  deriveCapabilities,
  resolveLessonState,
  LESSONS,
  CATEGORY_LABELS,
  type LessonId,
  type LessonState,
  type LessonCategory,
} from "./capabilities";
import {
  getFixtureRenderProps,
  getFixtureParsePillsMap,
  getFixtureSpellDataMap,
} from "./fixture";
import { GlossaryTermInline } from "./Glossary";
import { ExplainWalkthrough } from "./compositions";
import { LESSON_TIMINGS } from "./compositions";

/** Data-mode: live vs example */
export type ExplainDataMode = "live" | "example";

export interface DamageDoneExplainViewProps {
  /** Which damage panel variant is being explained. */
  panelType: string;
  /** Live panel context (instance, selections, encounters). */
  context: PanelContext;
  /** Duration of selected encounters in ms. */
  durationMs: number;
  /** Exit the Explain page. */
  onExit: () => void;
  /**
   * Initial data mode. Defaults to "live" (production behavior).
   * Set to "example" to start in example mode — useful for Storybook
   * or when no live event streams are available.
   */
  initialDataMode?: ExplainDataMode;
}

export function DamageDoneExplainView({
  panelType,
  context,
  durationMs,
  onExit,
  initialDataMode = "live",
}: DamageDoneExplainViewProps) {
  const [dataMode, setDataMode] = useState<ExplainDataMode>(initialDataMode);
  const [activeLesson, setActiveLesson] = useState<LessonId | null>(null);

  // ── Explainer-local panel state (never touches URL) ──
  const [localPerSecond, setLocalPerSecond] = useState(false);
  const [localPanelOption, setLocalPanelOption] = useState<string | null>(null);

  // Run the real aggregation pipeline for the damage_done panel.
  // This reuses the existing worker pool and stream caching — no duplication.
  // Disabled when in example mode to avoid requiring InstanceEventsProvider streams.
  const panel = PANELS[panelType] ?? PANELS["damage_done"];
  const aggregation = usePanelAggregation<DamageDoneResult>({
    panel,
    context,
    enabled: dataMode !== "example",
  });

  const liveResult: DamageDoneResult | null =
    aggregation.loading ? null : aggregation.result;

  // Derive capabilities from live result
  const capabilities = useMemo(
    () => deriveCapabilities(liveResult, durationMs),
    [liveResult, durationMs],
  );

  // Resolve lesson states
  const lessonStates = useMemo(() => {
    const states = new Map<LessonId, LessonState>();
    for (const lesson of LESSONS) {
      states.set(lesson.id, resolveLessonState(lesson.id, capabilities));
    }
    return states;
  }, [capabilities]);

  // ── Example-mode overrides ──
  const exampleProps = useMemo(() => getFixtureRenderProps(), []);
  const exampleParsePills = useMemo(() => getFixtureParsePillsMap(), []);
  const exampleSpellData = useMemo(() => getFixtureSpellDataMap(), []);

  // Build render props for active data mode, using explainer-local state
  const activeRenderProps: PanelRenderProps<DamageDoneResult> = useMemo(() => {
    if (dataMode === "example") {
      return {
        ...exampleProps,
        perSecond: localPerSecond,
        checkboxChecked: localPerSecond,
        panelOption: localPanelOption,
        setPanelOption: setLocalPanelOption,
      };
    }
    // Live mode
    return {
      result: aggregation.result,
      totalEvents: aggregation.totalEvents,
      processingTimeMs: aggregation.processingTimeMs,
      durationMs,
      perSecond: localPerSecond,
      checkboxChecked: localPerSecond,
      loading: aggregation.loading,
      processing: aggregation.processing,
      error: aggregation.error,
      context,
      panelOption: localPanelOption,
      setPanelOption: setLocalPanelOption,
    };
  }, [dataMode, aggregation, durationMs, context, exampleProps, localPerSecond, localPanelOption]);

  const handleSeeExample = useCallback((lessonId: LessonId) => {
    setDataMode("example");
    setActiveLesson(lessonId);
    // Reset explainer-local state for clean example
    setLocalPanelOption(null);
    setLocalPerSecond(false);
  }, []);

  const handleReturnToLive = useCallback(() => {
    setDataMode("live");
    setActiveLesson(null);
    setLocalPanelOption(null);
    setLocalPerSecond(false);
  }, []);

  const handleTryIt = useCallback((lessonId: LessonId) => {
    setDataMode("live");
    setActiveLesson(lessonId);
  }, []);

  /** Activate a lesson within the current data mode (no mode switch). */
  const handleShowMe = useCallback((lessonId: LessonId) => {
    setActiveLesson(lessonId);
  }, []);

  const isExample = dataMode === "example";

  // Active lesson timing for the Remotion Player
  const activeLessonTiming = activeLesson ? LESSON_TIMINGS[activeLesson] : null;

  return (
    <div className="min-h-screen bg-background" data-testid="damage-done-explain-view">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-3 flex items-center justify-between">
          <Button variant="ghost" onClick={onExit} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span>Understanding Damage Done</span>
          </h1>
          {/* Data mode switch */}
          {isExample ? (
            <Button size="sm" variant="outline" onClick={handleReturnToLive} className="gap-1.5" data-testid="return-to-live-btn">
              <FlaskConical className="h-3 w-3 text-amber-500" />
              Return to your data
            </Button>
          ) : (
            <div className="w-[160px]" />
          )}
        </div>
      </div>

      {/* Sidebar + Main layout */}
      <div className="flex h-[calc(100vh-49px)]">
        {/* ── Left sidebar: lessons ── */}
        <aside className="w-72 shrink-0 border-r bg-card/30 overflow-y-auto styled-scrollbar" data-testid="lesson-sidebar">
          {/* Intro */}
          <div className="px-4 pt-4 pb-3 border-b border-border/40">
            <p className="text-xs text-muted-foreground leading-relaxed">
              The <GlossaryTermInline termKey="panel">panel</GlossaryTermInline> shows damage dealt per player.
              Select a lesson to watch its walkthrough and try it in the{" "}
              {isExample ? "example" : "live"} panel.
            </p>
          </div>

          {/* Lesson list grouped by category */}
          <nav className="p-2" data-testid="lesson-list">
            {(["essentials", "deeper"] as LessonCategory[]).map((cat) => {
              const catLessons = LESSONS.filter((l) => l.category === cat);
              return (
                <div key={cat} className={cn(cat === "deeper" && "mt-3 pt-2 border-t border-border/40")}>
                  <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-2" data-testid={`lesson-category-${cat}`}>
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <ul className="space-y-0.5">
                    {catLessons.map((lesson) => {
                      const state = lessonStates.get(lesson.id) ?? "example-required";
                      const isActive = activeLesson === lesson.id;
                      return (
                        <LessonRow
                          key={lesson.id}
                          lesson={lesson}
                          state={state}
                          isActive={isActive}
                          isExampleMode={isExample}
                          onTryIt={() => handleTryIt(lesson.id)}
                          onSeeExample={() => handleSeeExample(lesson.id)}
                          onShowMe={() => handleShowMe(lesson.id)}
                        />
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
        </aside>

        {/* ── Main content area ── */}
        <main className="flex-1 overflow-y-auto styled-scrollbar">
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">

            {activeLesson && activeLessonTiming ? (
              /* ── Lesson active: Remotion Player replaces the panel ── */
              <Card>
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <Info className="h-3.5 w-3.5 text-primary" />
                    {LESSONS.find((l) => l.id === activeLesson)?.title}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => setActiveLesson(null)}
                  >
                    Exit lesson
                  </Button>
                </div>
                <CardContent className="pt-1 pb-3">
                  <div className="rounded-lg overflow-hidden border bg-background" data-testid="lesson-player">
                    <Player
                      component={ExplainWalkthrough}
                      inputProps={{ steps: activeLessonTiming.steps }}
                      durationInFrames={activeLessonTiming.durationInFrames}
                      compositionWidth={640}
                      compositionHeight={400}
                      fps={activeLessonTiming.fps}
                      style={{ width: "100%" }}
                      controls
                      loop
                      autoPlay
                    />
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* ── No lesson active: show the live/example panel ── */
              <Card>
                {isExample && (
                  <div
                    className="flex items-center gap-2 mx-4 mt-3 px-3 py-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs"
                    data-testid="example-data-banner"
                  >
                    <FlaskConical className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span className="text-amber-200 font-medium">Example data — select a lesson to start the walkthrough</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <span className="text-sm text-muted-foreground font-medium">
                    {isExample ? "Example — Damage Done" : "Damage Done"}
                  </span>
                  <div className="flex items-center gap-2" data-explainer-per-second>
                    <label htmlFor="explain-per-second" className="text-xs text-muted-foreground cursor-pointer">
                      Per Second
                    </label>
                    <Switch
                      id="explain-per-second"
                      checked={localPerSecond}
                      onCheckedChange={setLocalPerSecond}
                      data-testid="explain-per-second-toggle"
                    />
                  </div>
                </div>
                <CardContent className="pt-0">
                  <div className="styled-scrollbar" data-testid="explain-panel-container">
                    <DamageDoneContent
                      {...activeRenderProps}
                      sourceType="players"
                      parsePillsOverride={isExample ? exampleParsePills : undefined}
                      spellDataOverride={isExample ? exampleSpellData : undefined}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Lesson row ──

interface LessonRowProps {
  lesson: { id: LessonId; title: string; description: string };
  state: LessonState;
  isActive: boolean;
  /** Whether the page is currently showing example data. */
  isExampleMode: boolean;
  onTryIt: () => void;
  onSeeExample: () => void;
  /** Activate lesson in the current data mode (no mode switch). */
  onShowMe: () => void;
}

function LessonRow({ lesson, state, isActive, isExampleMode, onTryIt, onSeeExample, onShowMe }: LessonRowProps) {
  const isMuted = state === "example-required" && !isExampleMode;

  // Single click handler: in example mode just select, in live mode
  // switch to example for example-required or select for available.
  const handleClick = () => {
    if (isExampleMode) {
      onShowMe();
    } else if (state === "example-required") {
      onSeeExample();
    } else {
      onTryIt();
    }
  };

  return (
    <li
      className={cn(
        "flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer transition-colors",
        isActive ? "bg-accent/60 text-accent-foreground" : "hover:bg-accent/30",
        isMuted && !isActive && "opacity-50",
      )}
      data-testid={`lesson-${lesson.id}`}
      data-lesson-state={state}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
    >
      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isActive ? "text-primary rotate-90" : "text-muted-foreground")} />
      <span className={cn("text-sm truncate", isActive && "font-medium")}>{lesson.title}</span>
    </li>
  );
}
