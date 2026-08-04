import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  FlaskConical,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
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
import {
  formatLessonCountdown,
  getLessonCountdownProgress,
  LESSON_GUIDES,
  LESSON_STEP_DURATION_MS,
  type GuideTarget,
} from "./lessonGuides";

export type ExplainDataMode = "live" | "example";

export interface DamageDoneExplainViewProps {
  panelType: string;
  context: PanelContext;
  durationMs: number;
  onExit: () => void;
  initialDataMode?: ExplainDataMode;
}

function firstPlayerId(result: DamageDoneResult | null | undefined): string | null {
  if (!result) return null;
  for (const encounter of result.EncounterDamage.values()) {
    const first = encounter.keys().next();
    if (!first.done) return first.value;
  }
  return null;
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
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [remainingMs, setRemainingMs] = useState(LESSON_STEP_DURATION_MS);
  const remainingMsRef = useRef(LESSON_STEP_DURATION_MS);
  const [localPerSecond, setLocalPerSecond] = useState(false);
  const [localPanelOption, setLocalPanelOption] = useState<string | null>(null);
  const [showRanks, setShowRanks] = useState(true);

  const panel = PANELS[panelType] ?? PANELS.damage_done;
  const aggregation = usePanelAggregation<DamageDoneResult>({
    panel,
    context,
    enabled: dataMode === "live",
  });
  const liveResult = aggregation.loading ? null : aggregation.result;

  const capabilities = useMemo(
    () => deriveCapabilities(liveResult, durationMs),
    [liveResult, durationMs],
  );
  const lessonStates = useMemo(() => {
    const states = new Map<LessonId, LessonState>();
    for (const lesson of LESSONS) {
      states.set(lesson.id, resolveLessonState(lesson.id, capabilities));
    }
    return states;
  }, [capabilities]);

  const exampleProps = useMemo(() => getFixtureRenderProps(), []);
  const exampleParsePills = useMemo(() => getFixtureParsePillsMap(), []);
  const exampleSpellData = useMemo(() => getFixtureSpellDataMap(), []);
  const isExample = dataMode === "example";

  const activeRenderProps: PanelRenderProps<DamageDoneResult> = useMemo(() => {
    if (isExample) {
      return {
        ...exampleProps,
        perSecond: localPerSecond,
        checkboxChecked: localPerSecond,
        panelOption: localPanelOption,
        setPanelOption: setLocalPanelOption,
      };
    }
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
  }, [isExample, exampleProps, localPerSecond, localPanelOption, aggregation, durationMs, context]);

  const activeLessonMeta = activeLesson
    ? LESSONS.find((lesson) => lesson.id === activeLesson) ?? null
    : null;
  const activeSteps = activeLesson ? LESSON_GUIDES[activeLesson] : [];
  const activeStep = activeSteps[stepIndex] ?? null;
  const activeTarget: GuideTarget | null = activeStep?.target ?? null;
  const activeResult = activeRenderProps.result;
  const activePlayerId = firstPlayerId(activeResult);
  const activeDemo = activeStep?.demo;
  const effectivePerSecond = activeDemo?.perSecond ?? localPerSecond;
  const effectiveShowRanks = activeDemo?.showRanks ?? showRanks;
  const effectivePanelOption = activeLesson
    ? activeDemo?.focus && activePlayerId
      ? `f:${activePlayerId}`
      : null
    : localPanelOption;
  const demoBreakout = activeDemo?.breakout && activePlayerId
    ? { playerId: activePlayerId, ...activeDemo.breakout }
    : undefined;

  const resetPanelDemoState = useCallback(() => {
    setLocalPerSecond(false);
    setLocalPanelOption(null);
    setShowRanks(true);
  }, []);

  const resetCountdown = useCallback(() => {
    remainingMsRef.current = LESSON_STEP_DURATION_MS;
    setRemainingMs(LESSON_STEP_DURATION_MS);
  }, []);

  useEffect(() => {
    if (!activeLesson || !isPlaying || activeSteps.length === 0) return;

    const deadline = performance.now() + remainingMsRef.current;
    const interval = window.setInterval(() => {
      const nextRemainingMs = Math.max(0, deadline - performance.now());
      remainingMsRef.current = nextRemainingMs;
      setRemainingMs(nextRemainingMs);

      if (nextRemainingMs > 0) return;
      window.clearInterval(interval);

      if (stepIndex < activeSteps.length - 1) {
        remainingMsRef.current = LESSON_STEP_DURATION_MS;
        setRemainingMs(LESSON_STEP_DURATION_MS);
        setStepIndex((current) => current + 1);
      } else {
        setIsPlaying(false);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [activeLesson, activeSteps.length, isPlaying, stepIndex]);

  const selectLesson = useCallback((lessonId: LessonId, state: LessonState) => {
    if (dataMode === "live" && state === "example-required") {
      setDataMode("example");
    }
    resetPanelDemoState();
    resetCountdown();
    setActiveLesson(lessonId);
    setStepIndex(0);
    setIsPlaying(true);
  }, [dataMode, resetCountdown, resetPanelDemoState]);

  const changeDataMode = useCallback((mode: ExplainDataMode) => {
    setDataMode(mode);
    resetPanelDemoState();
    resetCountdown();
    setStepIndex(0);
    setIsPlaying(!!activeLesson);
  }, [activeLesson, resetCountdown, resetPanelDemoState]);

  const closeLesson = useCallback(() => {
    setActiveLesson(null);
    setStepIndex(0);
    setIsPlaying(false);
    resetCountdown();
    resetPanelDemoState();
  }, [resetCountdown, resetPanelDemoState]);

  const replayLesson = useCallback(() => {
    resetCountdown();
    setStepIndex(0);
    setIsPlaying(true);
  }, [resetCountdown]);

  const countdownLabel = formatLessonCountdown(remainingMs);
  const countdownProgress = getLessonCountdownProgress(remainingMs);

  return (
    <div className="min-h-screen bg-background" data-testid="damage-done-explain-view">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <Button variant="ghost" size="sm" onClick={onExit} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <div className="flex min-w-0 items-center gap-2">
            <BookOpen className="h-4 w-4 shrink-0 text-[color:var(--tertiary)]" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">Learn Damage Done</h1>
              <p className="hidden text-2xs text-muted-foreground sm:block">Guided practice on the real panel</p>
            </div>
          </div>
          <div className="ml-auto flex items-center rounded-lg border bg-muted/25 p-0.5" aria-label="Data source">
            <button
              type="button"
              onClick={() => changeDataMode("live")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                !isExample ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid="use-live-data-btn"
            >
              Your data
            </button>
            <button
              type="button"
              onClick={() => changeDataMode("example")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isExample ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid="use-example-data-btn"
            >
              <FlaskConical className="h-3 w-3" />
              Example
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="border-b bg-card/20 lg:border-b-0 lg:border-r" data-testid="lesson-sidebar">
          <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto p-3 styled-scrollbar">
            <div className="mb-3 rounded-lg border border-[color:var(--tertiary)]/20 bg-[color:var(--tertiary)]/5 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-[color:var(--tertiary)]" />
                Watch it happen
              </div>
              <p className="text-2xs leading-relaxed text-muted-foreground">
                Pick a lesson and the tour will operate the real panel automatically from start to finish.
              </p>
            </div>

            <nav data-testid="lesson-list" aria-label="Damage Done lessons">
              {(["essentials", "deeper"] as LessonCategory[]).map((category) => (
                <div key={category} className={cn(category === "deeper" && "mt-4")}>
                  <h2 className="mb-1 px-2 text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {CATEGORY_LABELS[category]}
                  </h2>
                  <ul className="space-y-1">
                    {LESSONS.filter((lesson) => lesson.category === category).map((lesson, index) => {
                      const state = lessonStates.get(lesson.id) ?? "example-required";
                      return (
                        <LessonRow
                          key={lesson.id}
                          lessonNumber={index + 1}
                          lesson={lesson}
                          state={state}
                          active={activeLesson === lesson.id}
                          onClick={() => selectLesson(lesson.id, state)}
                        />
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden">
          <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
            {activeLessonMeta && activeStep ? (
              <section
                className="overflow-hidden rounded-xl border border-[color:var(--tertiary)]/25 bg-card shadow-sm"
                data-testid="lesson-guide"
              >
                <div className="relative flex items-center gap-3 border-b bg-[color:var(--tertiary)]/5 px-4 py-2.5">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[color:var(--tertiary)]/15 text-[color:var(--tertiary)]">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{activeLessonMeta.title}</p>
                    <p className="text-2xs text-muted-foreground">Step {stepIndex + 1} of {activeSteps.length}</p>
                  </div>
                  <div className="ml-auto flex gap-1" aria-label="Lesson progress">
                    {activeSteps.map((_, index) => (
                      <span
                        key={index}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          index === stepIndex
                            ? "w-6 bg-[color:var(--tertiary)]"
                            : index < stepIndex
                              ? "w-1.5 bg-[color:var(--tertiary)]/55"
                              : "w-1.5 bg-muted-foreground/20",
                        )}
                      />
                    ))}
                  </div>
                  <div
                    className="flex min-w-[104px] items-center justify-center gap-1.5 rounded-md border border-[color:var(--tertiary)]/20 bg-background/65 px-2 py-1 font-mono text-2xs tabular-nums"
                    role="timer"
                    aria-label={isPlaying ? `${countdownLabel} until the next step` : `${countdownLabel} remaining while paused`}
                    data-testid="lesson-countdown"
                  >
                    <Timer className="h-3 w-3 text-[color:var(--tertiary)]" />
                    <span className="text-muted-foreground">
                      {isPlaying ? (stepIndex === activeSteps.length - 1 ? "Ends" : "Next") : remainingMs > 0 ? "Paused" : "Done"}
                    </span>
                    <span className="font-semibold text-foreground">{countdownLabel}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={closeLesson} aria-label="Close lesson" className="h-7 w-7">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <div
                    className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-[color:var(--tertiary)]/10"
                    role="progressbar"
                    aria-label="Time remaining in this lesson step"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(countdownProgress)}
                  >
                    <div
                      className="h-full bg-[color:var(--tertiary)] transition-[width] duration-100 ease-linear"
                      style={{ width: `${countdownProgress}%` }}
                    />
                  </div>
                </div>

                <div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div>
                    <h2 className="mb-1 text-base font-semibold tracking-tight">{activeStep.title}</h2>
                    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{activeStep.body}</p>
                    <p className="mt-2 text-2xs font-medium uppercase tracking-[0.12em] text-[color:var(--tertiary)]">
                      {isPlaying ? "Demonstrating automatically" : "Demonstration complete"}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {isPlaying ? (
                      <Button variant="outline" size="sm" onClick={() => setIsPlaying(false)}>
                        <Pause className="mr-1.5 h-3.5 w-3.5" />
                        Pause
                      </Button>
                    ) : stepIndex === activeSteps.length - 1 ? (
                      <Button variant="outline" size="sm" onClick={replayLesson}>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Replay
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setIsPlaying(true)}>
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                        Resume
                      </Button>
                    )}
                  </div>
                </div>
              </section>
            ) : (
              <section className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Explore your Damage Done panel</p>
                  <p className="text-xs text-muted-foreground">Choose a lesson from the left when you want guided practice.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => selectLesson("reading-chart", lessonStates.get("reading-chart") ?? "limited")}>
                  Start with the chart
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </section>
            )}

            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Damage Done</span>
                    {isExample && (
                      <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-2xs font-medium text-amber-400">
                        Example raid
                      </span>
                    )}
                  </div>
                  <p className="text-2xs text-muted-foreground">
                    {isExample ? "Curated data for demonstrating every lesson" : "Using your current encounter selection"}
                  </p>
                </div>
                <div
                  className={cn(
                    "ml-auto flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-all",
                    activeTarget === "per-second" && "border-[color:var(--tertiary)] ring-2 ring-[color:var(--tertiary)]/20",
                  )}
                  data-explainer-per-second
                >
                  <label htmlFor="explain-per-second" className="cursor-pointer text-xs text-muted-foreground">
                    Per Second
                  </label>
                  <Switch
                    id="explain-per-second"
                    checked={effectivePerSecond}
                    onCheckedChange={setLocalPerSecond}
                    disabled={!!activeLesson}
                    data-testid="explain-per-second-toggle"
                  />
                </div>
                {!activeLesson && (localPerSecond || localPanelOption || !showRanks) && (
                  <Button variant="ghost" size="sm" onClick={resetPanelDemoState} className="h-8 gap-1.5 text-xs">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset panel
                  </Button>
                )}
              </div>
              <CardContent className="p-3 lg:p-4">
                <div
                  className={cn(
                    "min-h-[320px] rounded-lg border border-transparent p-1 transition-all duration-200",
                    activeTarget && activeTarget !== "per-second" && "border-[color:var(--tertiary)]/60 bg-[color:var(--tertiary)]/[0.025] ring-2 ring-[color:var(--tertiary)]/10",
                  )}
                  data-testid="explain-panel-container"
                >
                  <DamageDoneContent
                    {...activeRenderProps}
                    perSecond={effectivePerSecond}
                    checkboxChecked={effectivePerSecond}
                    panelOption={effectivePanelOption}
                    sourceType={panelType === "enemy_damage_done" ? "enemies" : "players"}
                    parsePillsOverride={isExample ? exampleParsePills : undefined}
                    spellDataOverride={isExample ? exampleSpellData : undefined}
                    showRanksOverride={effectiveShowRanks}
                    onShowRanksChange={setShowRanks}
                    explainTarget={activeTarget}
                    demoBreakout={demoBreakout}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

interface LessonRowProps {
  lessonNumber: number;
  lesson: { id: LessonId; title: string; description: string };
  state: LessonState;
  active: boolean;
  onClick: () => void;
}

function LessonRow({ lessonNumber, lesson, state, active, onClick }: LessonRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group flex w-full items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-2.5 text-left transition-colors",
          active
            ? "border-[color:var(--tertiary)]/25 bg-[color:var(--tertiary)]/10"
            : "hover:border-border hover:bg-accent/35",
        )}
        data-testid={`lesson-${lesson.id}`}
        data-lesson-state={state}
      >
        <span
          className={cn(
            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-2xs font-semibold",
            active
              ? "bg-[color:var(--tertiary)] text-white"
              : "bg-muted text-muted-foreground group-hover:text-foreground",
          )}
        >
          {lessonNumber}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn("truncate text-xs font-medium", active && "text-foreground")}>{lesson.title}</span>
            {state === "example-required" && (
              <FlaskConical className="h-3 w-3 shrink-0 text-amber-400" aria-label="Uses example data" />
            )}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-2xs leading-relaxed text-muted-foreground">
            {lesson.description}
          </span>
        </span>
        <ChevronRight className={cn("mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", active && "translate-x-0.5 text-[color:var(--tertiary)]")} />
      </button>
    </li>
  );
}
