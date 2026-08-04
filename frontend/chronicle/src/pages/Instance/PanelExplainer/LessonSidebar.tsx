/**
 * Lesson sidebar: the grouped, capability-aware lesson list, styled as a
 * course playlist — numbered rows whose thumb becomes a play button on
 * hover. Clicking a row selects it; limited rows keep a secondary
 * "richer example" action.
 */

import { ChevronDown, Play } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Lesson, LessonState, LessonVideo } from "./types";

/**
 * Available lessons carry no badge — teachable-from-your-data is the normal
 * case. Only the exception states are called out.
 */
const STATE_PILL: Record<LessonState, { label: string; className: string } | null> = {
  available: null,
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

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function videoSeconds(video: LessonVideo): number {
  return video.durationInFrames / video.fps;
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

  const essentials = lessons.filter((l) => l.group === "essentials");
  const deeper = lessons.filter((l) => l.group === "deeper");
  const more = lessons.filter((l) => l.group === "more");

  const videoCount = lessons.filter((l) => l.video).length;
  const totalSeconds = lessons.reduce(
    (sum, l) => sum + (l.video ? videoSeconds(l.video) : 0),
    0,
  );

  const row = (lesson: Lesson<TCaps>, index: number) => (
    <LessonRow
      key={lesson.id}
      lesson={lesson}
      index={index}
      caps={caps}
      selected={lesson.id === selectedLessonId}
      onSelect={onSelect}
    />
  );

  return (
    <div className="w-[392px] flex-shrink-0 overflow-y-auto border-r border-border bg-card">
      <div className="border-b border-border px-[18px] pb-4 pt-5">
        <h1 className="mb-1.5 text-[17px] font-semibold tracking-tight">
          Learn {panelLabel}
        </h1>
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
          Each lesson is checked against the log you have open. Where your data can
          teach it, you practice on your own raid.
        </p>
        {videoCount > 0 && (
          <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
            {videoCount} video {videoCount === 1 ? "lesson" : "lessons"} ·{" "}
            {formatSeconds(totalSeconds)} total
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5 px-2.5 pb-7 pt-3.5">
        <GroupHeading>Essentials</GroupHeading>
        {essentials.map((lesson, i) => row(lesson, i + 1))}

        {deeper.length > 0 && (
          <>
            <GroupHeading className="pt-3.5">Deeper analysis</GroupHeading>
            {deeper.map((lesson, i) => row(lesson, essentials.length + i + 1))}
          </>
        )}

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
              more.map((lesson, i) =>
                row(lesson, essentials.length + deeper.length + i + 1),
              )}
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
  index,
  caps,
  selected,
  onSelect,
}: {
  lesson: Lesson<TCaps>;
  index: number;
  caps: TCaps;
  selected: boolean;
  onSelect: (selection: LessonSelection) => void;
}) {
  const state = lesson.deriveState(caps);
  const pill = STATE_PILL[state];
  const exampleForced = lesson.exampleOnly || state === "example-required";

  const open = () =>
    onSelect({ lessonId: lesson.id, mode: exampleForced ? "example" : "live" });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={cn(
        "group relative flex w-full cursor-pointer items-start gap-3 overflow-hidden rounded-lg border border-border/50 bg-muted/15 py-3 pl-3.5 pr-3 text-left transition-colors",
        "hover:border-border hover:bg-muted/35",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary/40 bg-primary/[0.07] hover:bg-primary/10",
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}

      {/* Numbered thumb — flips to a play glyph on hover or when selected. */}
      <span
        className={cn(
          "mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-md border border-border/60 bg-background/60 font-mono text-[13px] text-muted-foreground transition-colors",
          "group-hover:border-primary/50 group-hover:text-primary",
          selected && "border-primary/50 bg-primary/15 text-primary",
        )}
      >
        <Play
          className={cn("hidden h-3.5 w-3.5 fill-current group-hover:block", selected && "block")}
        />
        <span className={cn("group-hover:hidden", selected && "hidden")}>{index}</span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-[7px]">
          <span
            className={cn(
              "text-[13px] font-semibold tracking-tight",
              state === "example-required" && !selected && "text-foreground/80",
            )}
          >
            {lesson.title}
          </span>
          {pill && (
            <span
              className={cn(
                "rounded-full border px-1.5 py-px font-mono text-[9.5px]",
                pill.className,
              )}
            >
              {pill.label}
            </span>
          )}
        </span>
        <span className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
          {lesson.description(caps)}
        </span>
        <span className="mt-1 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
          {lesson.video && <span>{formatSeconds(videoSeconds(lesson.video))} video</span>}
          {state === "limited" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect({ lessonId: lesson.id, mode: "example" });
              }}
              className="tracking-[0.1em] text-primary/80 underline-offset-2 hover:text-primary hover:underline"
            >
              richer example →
            </button>
          )}
        </span>
      </span>
    </div>
  );
}
