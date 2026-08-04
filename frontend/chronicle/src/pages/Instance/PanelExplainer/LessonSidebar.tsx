/**
 * Lesson sidebar: readiness counts and the grouped, capability-aware lesson
 * list. Selecting a lesson (or its "See example" action) is reported upward.
 */

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  countLessonStates,
  type Lesson,
  type LessonState,
} from "./types";

const STATE_DOT: Record<LessonState, { glyph: string; className: string }> = {
  available: { glyph: "●", className: "text-class-hunter" },
  limited: { glyph: "◐", className: "text-class-rogue" },
  "example-required": { glyph: "○", className: "text-muted-foreground opacity-70" },
};

const STATE_PILL: Record<LessonState, { label: string; className: string }> = {
  available: {
    label: "IN YOUR DATA",
    className: "border-class-hunter/45 text-class-hunter",
  },
  limited: {
    label: "LIMITED",
    className: "border-class-rogue/45 text-class-rogue",
  },
  "example-required": {
    label: "EXAMPLE DATA",
    className: "border-border text-muted-foreground",
  },
};

export interface LessonSelection {
  lessonId: string;
  mode: "live" | "example";
}

export function LessonSidebar<TCaps>({
  panelLabel,
  lessons,
  caps,
  selectedLessonId,
  onSelect,
}: {
  panelLabel: string;
  lessons: Lesson<TCaps>[];
  caps: TCaps;
  selectedLessonId: string | null;
  onSelect: (selection: LessonSelection) => void;
}) {
  const [moreExpanded, setMoreExpanded] = useState(false);

  const counts = useMemo(() => countLessonStates(lessons, caps), [lessons, caps]);
  const essentials = lessons.filter((l) => l.group === "essentials");
  const deeper = lessons.filter((l) => l.group === "deeper");
  const more = lessons.filter((l) => l.group === "more");

  return (
    <div className="w-[392px] flex-shrink-0 overflow-y-auto border-r border-border bg-card">
      <div className="border-b border-border px-[18px] pb-3 pt-5">
        <h1 className="mb-1.5 text-[17px] font-semibold tracking-tight">
          Learn {panelLabel}
        </h1>
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
          Each lesson is checked against the log you have open. Where your data can
          teach it, you practice on your own raid.
        </p>
        <div className="mt-3 flex gap-3.5 font-mono text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="text-class-hunter">●</span>
            {counts.available} ready
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-class-rogue">◐</span>
            {counts.limited} limited
          </span>
          <span className="flex items-center gap-1.5">
            <span className="opacity-60">○</span>
            {counts.exampleRequired} need{counts.exampleRequired === 1 ? "s" : ""} example
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-2.5 pb-7 pt-3.5">
        <GroupHeading>Essentials</GroupHeading>
        {essentials.map((lesson) => (
          <LessonRow
            key={lesson.id}
            lesson={lesson}
            caps={caps}
            selected={lesson.id === selectedLessonId}
            onSelect={onSelect}
          />
        ))}

        <GroupHeading className="pt-3.5">Deeper analysis</GroupHeading>
        {deeper.map((lesson) => (
          <LessonRow
            key={lesson.id}
            lesson={lesson}
            caps={caps}
            selected={lesson.id === selectedLessonId}
            onSelect={onSelect}
          />
        ))}

        {more.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setMoreExpanded((v) => !v)}
              className="mt-4 flex items-center gap-2 border-t border-border px-2 py-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", moreExpanded && "rotate-180")}
              />
              <span>More topics</span>
              <span className="font-mono text-[10.5px] opacity-70">{more.length}</span>
            </button>
            {moreExpanded &&
              more.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  caps={caps}
                  selected={lesson.id === selectedLessonId}
                  onSelect={onSelect}
                />
              ))}
          </>
        )}
      </div>
    </div>
  );
}

function GroupHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

function LessonRow<TCaps>({
  lesson,
  caps,
  selected,
  onSelect,
}: {
  lesson: Lesson<TCaps>;
  caps: TCaps;
  selected: boolean;
  onSelect: (selection: LessonSelection) => void;
}) {
  const state = lesson.deriveState(caps);
  const dot = STATE_DOT[state];
  const pill = STATE_PILL[state];
  const exampleForced = lesson.exampleOnly || state === "example-required";
  const primaryLabel = lesson.video ? "Watch" : "Read";

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-md px-2 py-2 hover:bg-muted/60",
        selected && "bg-muted/60",
      )}
    >
      <span className={cn("w-3 flex-shrink-0 text-xs leading-[18px]", dot.className)}>
        {dot.glyph}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-[7px]">
          <span
            className={cn(
              "text-[13px] font-medium",
              state === "example-required" && "text-muted-foreground",
            )}
          >
            {lesson.title}
          </span>
          <span
            className={cn(
              "rounded-full border px-1.5 py-px font-mono text-[9.5px]",
              pill.className,
            )}
          >
            {pill.label}
          </span>
        </div>
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          {lesson.description(caps)}
        </p>
        <div className="mt-0.5 flex gap-1.5">
          {!exampleForced && (
            <button
              type="button"
              onClick={() => onSelect({ lessonId: lesson.id, mode: "live" })}
              className="rounded-sm bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/85"
            >
              {state === "limited" ? `${primaryLabel} with your data` : primaryLabel}
            </button>
          )}
          {(exampleForced || state === "limited") && (
            <button
              type="button"
              onClick={() => onSelect({ lessonId: lesson.id, mode: "example" })}
              className="rounded-sm border border-border bg-secondary px-2.5 py-1 text-[11.5px] font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {state === "limited" ? "See richer example" : "See example"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
