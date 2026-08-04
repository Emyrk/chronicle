/**
 * DamageDoneExplainView — Rich Damage Done Explain page.
 *
 * Shows a lesson list with three states (available / limited / example-required).
 * "See example" renders the production DamageDoneContent with deterministic
 * curated fixture data, including parse pills and spell rank data — no network
 * calls. Returning to live data restores the panel without mutating URL state,
 * selections, or filters.
 *
 * Live aggregation: runs usePanelAggregation internally with the damage_done
 * panel definition so it receives real DamageDoneResult from the worker
 * pipeline — no duplicated processing, no DOM inference.
 *
 * The embedded panel wrapper owns local perSecond, showRanks, and panelOption
 * state so DPS/Ranks/Focus lessons are fully demonstrable. These never touch
 * the user's URL.
 */

import { useState, useMemo, useCallback } from "react";
import { ArrowLeft, BookOpen, Lightbulb, ChevronRight, FlaskConical, Info, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card";
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

// ── Lesson instructions ──
// Shown adjacent to the panel when a lesson is active.

const LESSON_INSTRUCTIONS: Record<LessonId, string> = {
  "reading-chart":
    "Look at the horizontal bars below. Each bar represents a player, colour-coded by class. Longer bars = more damage.",
  "dps-vs-total":
    "Toggle the Per Second switch in the panel header to switch between total damage and DPS.",
  "parse-scores":
    "Notice the coloured number pills on each player row. These are parse scores — higher is better, and the colour shifts from green → blue → purple → orange → pink.",
  "breakout-box":
    "Click any player row to open the Breakout Box showing their ability and target breakdown.",
  "abilities-vs-targets":
    "Inside the Breakout Box, switch between the 'By Ability' and 'By Target' tabs.",
  "detailed-results":
    "In the Breakout Box, click 'More detail' on an ability, then click the ↕ button to see min/avg/max for each hit type.",
  "spell-ranks":
    "Toggle the Ranks button in the panel header to separate abilities by spell rank (e.g. Frostbolt Rank 4 vs Rank 11).",
  "focus":
    "Ctrl+click (Cmd+click on Mac) a player row, then choose Focus to see their per-ability chart with full breakouts.",
};

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
          <div className="w-[140px]" />
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
        {isExample && (
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

        {/* Lesson List — grouped by category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Lessons
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div data-testid="lesson-list">
              {(["essentials", "deeper"] as LessonCategory[]).map((cat) => {
                const catLessons = LESSONS.filter((l) => l.category === cat);
                return (
                  <div key={cat} className={cn(cat === "deeper" && "mt-4 pt-3 border-t border-border/50")}>
                    <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-3" data-testid={`lesson-category-${cat}`}>
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
            </div>
          </CardContent>
        </Card>

        {/* Panel with explainer-local header controls */}
        <Card>
          {/* Active lesson instruction — pinned inside the panel card */}
          {activeLesson && (
            <div
              className="flex items-start gap-3 mx-6 mt-4 px-3 py-2.5 rounded-md border border-primary/30 bg-primary/5"
              data-testid="lesson-instruction"
            >
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <p className="text-xs text-foreground leading-relaxed">
                {LESSON_INSTRUCTIONS[activeLesson]}
              </p>
            </div>
          )}

          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                {isExample ? (
                  <>
                    <FlaskConical className="h-4 w-4 text-amber-500" />
                    Example — Damage Done
                  </>
                ) : (
                  <span className="text-muted-foreground text-sm font-normal">Damage Done</span>
                )}
              </span>
              {/* Explainer-local Per Second toggle */}
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
            </CardTitle>
          </CardHeader>
          <CardContent>
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

  // In example mode, all lessons use "Show me" (just activates the lesson
  // without switching data mode). In live mode, use state-dependent actions.
  const renderActions = () => {
    if (isExampleMode) {
      return (
        <Button size="sm" variant={isActive ? "default" : "ghost"} className="h-7 text-xs gap-1" onClick={onShowMe}>
          <MousePointerClick className="h-3 w-3" />
          {isActive ? "Active" : "Show me"}
        </Button>
      );
    }
    // Live mode actions based on capability state
    switch (state) {
      case "available":
        return (
          <Button size="sm" variant={isActive ? "default" : "ghost"} className="h-7 text-xs gap-1" onClick={onTryIt}>
            <MousePointerClick className="h-3 w-3" />
            {isActive ? "Active" : "Try it"}
          </Button>
        );
      case "limited":
        return (
          <>
            <Button size="sm" variant={isActive ? "default" : "ghost"} className="h-7 text-xs gap-1" onClick={onTryIt}>
              <MousePointerClick className="h-3 w-3" />
              {isActive ? "Active" : "Try it"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onSeeExample}>
              See richer example
            </Button>
          </>
        );
      case "example-required":
        return (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onSeeExample}>
            See example
          </Button>
        );
    }
  };

  return (
    <li
      className={cn(
        "flex items-start gap-3 py-2.5 px-3 rounded-lg transition-colors",
        isActive && "bg-accent/50 ring-1 ring-accent",
        isMuted && !isActive && "opacity-50",
      )}
      data-testid={`lesson-${lesson.id}`}
      data-lesson-state={state}
    >
      <ChevronRight className={cn("h-4 w-4 mt-0.5 shrink-0 transition-transform", isActive ? "text-primary rotate-90" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{lesson.title}</div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{lesson.description}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {renderActions()}
      </div>
    </li>
  );
}
