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
import { ArrowLeft, BookOpen, Lightbulb, Play, Eye, ChevronRight, FlaskConical, Info } from "lucide-react";
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
  type LessonId,
  type LessonState,
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
}: DamageDoneExplainViewProps) {
  const [dataMode, setDataMode] = useState<ExplainDataMode>("live");
  const [activeLesson, setActiveLesson] = useState<LessonId | null>(null);

  // ── Explainer-local panel state (never touches URL) ──
  const [localPerSecond, setLocalPerSecond] = useState(false);
  const [localPanelOption, setLocalPanelOption] = useState<string | null>(null);

  // Run the real aggregation pipeline for the damage_done panel.
  // This reuses the existing worker pool and stream caching — no duplication.
  const panel = PANELS[panelType] ?? PANELS["damage_done"];
  const aggregation = usePanelAggregation<DamageDoneResult>({
    panel,
    context,
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

        {/* Active lesson instruction */}
        {activeLesson && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-lg border border-primary/30 bg-primary/5"
            data-testid="lesson-instruction"
          >
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <p className="text-sm text-foreground">
              {LESSON_INSTRUCTIONS[activeLesson]}
            </p>
          </div>
        )}

        {/* Panel with explainer-local header controls */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                {isExample ? (
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
            <div className="min-h-[400px] styled-scrollbar" data-testid="explain-panel-container">
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
