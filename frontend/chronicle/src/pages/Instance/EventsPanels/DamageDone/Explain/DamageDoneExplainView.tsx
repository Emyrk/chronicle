/**
 * DamageDoneExplainView — Rich Damage Done Explain page.
 *
 * Shows a lesson list with three states (available / limited / example-required).
 * "See example" renders the production DamageDoneContent with deterministic
 * curated fixture data. Returning to live data restores the panel without
 * mutating URL state, selections, or filters.
 */

import { useState, useMemo, useCallback } from "react";
import { ArrowLeft, BookOpen, Lightbulb, Play, Eye, ChevronRight, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { cn } from "@/lib/utils";

import type { DamageDoneResult } from "../damageDone.processor";
import { DamageDoneContent } from "../DamageDoneContent";
import type { PanelContext, PanelRenderProps } from "../../types";

import {
  deriveCapabilities,
  resolveLessonState,
  LESSONS,
  type LessonId,
  type LessonState,
} from "./capabilities";
import { getFixtureRenderProps } from "./fixture";
import { GlossaryTermInline } from "./Glossary";

/** Data-mode: live vs example */
export type ExplainDataMode = "live" | "example";

export interface DamageDoneExplainViewProps {
  /** Live panel result (may be null during loading). */
  liveResult: DamageDoneResult | null;
  /** Live panel context. */
  liveContext: PanelContext;
  /** Live panel duration in ms. */
  liveDurationMs: number;
  /** Live perSecond toggle state. */
  livePerSecond: boolean;
  /** Exit the Explain page. */
  onExit: () => void;
}

export function DamageDoneExplainView({
  liveResult,
  liveContext,
  liveDurationMs,
  livePerSecond,
  onExit,
}: DamageDoneExplainViewProps) {
  const [dataMode, setDataMode] = useState<ExplainDataMode>("live");
  const [activeLesson, setActiveLesson] = useState<LessonId | null>(null);

  // Derive capabilities from live result
  const capabilities = useMemo(
    () => deriveCapabilities(liveResult, liveDurationMs),
    [liveResult, liveDurationMs],
  );

  // Resolve lesson states
  const lessonStates = useMemo(() => {
    const states = new Map<LessonId, LessonState>();
    for (const lesson of LESSONS) {
      states.set(lesson.id, resolveLessonState(lesson.id, capabilities));
    }
    return states;
  }, [capabilities]);

  // Example mode render props (only created when needed)
  const exampleProps = useMemo(() => getFixtureRenderProps(), []);

  // Build props for the currently active data mode
  const activeRenderProps: PanelRenderProps<DamageDoneResult> | null = useMemo(() => {
    if (dataMode === "example") {
      return exampleProps;
    }
    // Live mode
    if (!liveResult) return null;
    return {
      result: liveResult,
      totalEvents: 0,
      processingTimeMs: null,
      durationMs: liveDurationMs,
      perSecond: livePerSecond,
      checkboxChecked: livePerSecond,
      loading: false,
      processing: false,
      error: null,
      context: liveContext,
    };
  }, [dataMode, liveResult, liveDurationMs, livePerSecond, liveContext, exampleProps]);

  const handleSeeExample = useCallback((lessonId: LessonId) => {
    setDataMode("example");
    setActiveLesson(lessonId);
  }, []);

  const handleReturnToLive = useCallback(() => {
    setDataMode("live");
    setActiveLesson(null);
  }, []);

  const handleTryIt = useCallback((lessonId: LessonId) => {
    setDataMode("live");
    setActiveLesson(lessonId);
  }, []);

  return (
    <div className="min-h-screen bg-background" data-testid="damage-done-explain-view">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Button variant="ghost" onClick={onExit} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Exit Explainer
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            <span>Understanding Damage Done</span>
          </h1>
          <div className="w-[140px]" /> {/* Spacer for centering */}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Introduction */}
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground leading-relaxed">
              The Damage Done <GlossaryTermInline termKey="panel" /> shows total damage dealt by each
              player during selected encounters. Use it to compare DPS, identify top contributors,
              and drill into ability breakdowns via the{" "}
              <GlossaryTermInline termKey="breakoutBox" />.{" "}
              <GlossaryTermInline termKey="filters">Filters</GlossaryTermInline> narrow the data,
              and <GlossaryTermInline termKey="focus" /> lets you drill into one player.
            </p>
          </CardContent>
        </Card>

        {/* Data mode indicator */}
        {dataMode === "example" && (
          <div
            className="flex items-center justify-between px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10"
            data-testid="example-data-banner"
          >
            <div className="flex items-center gap-2 text-amber-200">
              <FlaskConical className="h-4 w-4" />
              <span className="text-sm font-medium">Viewing example data</span>
            </div>
            <Button size="sm" variant="outline" onClick={handleReturnToLive} data-testid="return-to-live-btn">
              Return to your data
            </Button>
          </div>
        )}

        {/* Lesson List */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Lessons
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1" data-testid="lesson-list">
              {LESSONS.map((lesson) => {
                const state = lessonStates.get(lesson.id) ?? "example-required";
                const isActive = activeLesson === lesson.id;
                return (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    state={state}
                    isActive={isActive}
                    onTryIt={() => handleTryIt(lesson.id)}
                    onSeeExample={() => handleSeeExample(lesson.id)}
                  />
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {/* Live/Example Panel */}
        {activeRenderProps && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {dataMode === "example" ? (
                  <>
                    <FlaskConical className="h-4 w-4 text-amber-500" />
                    Example — Damage Done
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 text-green-500" />
                    Live — Damage Done
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]" data-testid="explain-panel-container">
                <DamageDoneContent
                  {...activeRenderProps}
                  sourceType="players"
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Lesson row ──

interface LessonRowProps {
  lesson: { id: LessonId; title: string; description: string };
  state: LessonState;
  isActive: boolean;
  onTryIt: () => void;
  onSeeExample: () => void;
}

function LessonRow({ lesson, state, isActive, onTryIt, onSeeExample }: LessonRowProps) {
  const isMuted = state === "example-required";

  return (
    <li
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg transition-colors",
        isActive && "bg-accent/50 border border-accent",
        isMuted && !isActive && "opacity-60",
      )}
      data-testid={`lesson-${lesson.id}`}
      data-lesson-state={state}
    >
      <ChevronRight className={cn("h-4 w-4 mt-0.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{lesson.title}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{lesson.description}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {state === "available" && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onTryIt}>
            <Play className="h-3 w-3" />
            Try it
          </Button>
        )}
        {state === "limited" && (
          <>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onTryIt}>
              <Play className="h-3 w-3" />
              Try it
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onSeeExample}>
              <Eye className="h-3 w-3" />
              See richer example
            </Button>
          </>
        )}
        {state === "example-required" && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onSeeExample}>
            <Eye className="h-3 w-3" />
            See example
          </Button>
        )}
      </div>
    </li>
  );
}
