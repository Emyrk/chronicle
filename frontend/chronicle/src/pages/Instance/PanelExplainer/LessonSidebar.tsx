/**
 * Lesson sidebar: the grouped, capability-aware lesson list, styled as a
 * course playlist — numbered rows whose thumb becomes a play button on
 * hover. Clicking a row selects it.
 */

import { Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Lesson, LessonState, LessonVideo } from "./types";

/**
 * Available lessons carry no badge — teachable-from-your-data is the normal
 * case. Only the exception states are called out. (Example mode is hidden for
 * now: example-required lessons are greyed and open in live mode anyway.)
 */
const STATE_PILL: Record<LessonState, { label: string; className: string } | null> = {
  available: null,
  limited: {
    label: "LIMITED",
    className: "border-class-rogue/45 text-class-rogue",
  },
  "example-required": {
    label: "NOT IN LIVE DATA",
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
  onHoverLesson,
  highlightedLessonId,
}: {
  panelLabel: string;
  lessons: Lesson<TCaps>[];
  caps: TCaps;
  selectedLessonId: string | null;
  onSelect: (selection: LessonSelection) => void;
  /** Reports which lesson row the pointer is over (null on leave). */
  onHoverLesson?: (lessonId: string | null) => void;
  /** Lesson lit up because its panel region is hovered (reverse link). */
  highlightedLessonId?: string | null;
}) {
  const essentials = lessons.filter((l) => l.group === "essentials");
  const advanced = lessons.filter((l) => l.group === "advanced");

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
      highlighted={lesson.id === highlightedLessonId}
      onSelect={onSelect}
      onHover={onHoverLesson}
    />
  );

  return (
    <div className="w-[392px] flex-shrink-0 overflow-y-auto border-r border-border bg-card">
      <div className="border-b border-border px-[18px] pb-4 pt-5">
        <h1 className="mb-1.5 text-[17px] font-semibold tracking-tight">
          Learn {panelLabel}
        </h1>
        {videoCount > 0 && (
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
            {videoCount} video {videoCount === 1 ? "lesson" : "lessons"} ·{" "}
            {formatSeconds(totalSeconds)} total
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5 px-2.5 pb-7 pt-3.5">
        <GroupHeading>Essentials</GroupHeading>
        {essentials.map((lesson, i) => row(lesson, i + 1))}

        {advanced.length > 0 && (
          <>
            <GroupHeading className="pt-3.5">Advanced</GroupHeading>
            {advanced.map((lesson, i) => row(lesson, essentials.length + i + 1))}
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
  highlighted,
  onSelect,
  onHover,
}: {
  lesson: Lesson<TCaps>;
  index: number;
  caps: TCaps;
  selected: boolean;
  highlighted: boolean;
  onSelect: (selection: LessonSelection) => void;
  onHover?: (lessonId: string | null) => void;
}) {
  const state = lesson.deriveState(caps);
  const pill = STATE_PILL[state];
  const dimmed = lesson.exampleOnly || state === "example-required";
  const rowRef = useRef<HTMLDivElement>(null);

  // Reverse link: when a panel region lights this lesson up, bring it into view.
  useEffect(() => {
    if (highlighted) rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlighted]);

  // Example mode is hidden for now — every lesson opens against live data.
  const open = () => onSelect({ lessonId: lesson.id, mode: "live" });

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      onMouseEnter={() => onHover?.(lesson.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "group relative flex w-full cursor-pointer items-start gap-3 overflow-hidden rounded-lg border border-border/50 bg-muted/15 py-3 pl-3.5 pr-3 text-left transition-colors",
        "hover:border-border hover:bg-muted/35",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary/40 bg-primary/[0.07] hover:bg-primary/10",
        highlighted && "border-primary/60 bg-primary/[0.09] ring-1 ring-primary/40",
        dimmed && !selected && !highlighted && "opacity-65 hover:opacity-90",
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}

      {/* Numbered thumb — flips to a play glyph on hover or when selected. */}
      <span
        className={cn(
          "mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-md border border-border/60 bg-background/60 font-mono text-[13px] text-muted-foreground transition-colors",
          "group-hover:border-primary/50 group-hover:text-primary",
          (selected || highlighted) && "border-primary/50 bg-primary/15 text-primary",
        )}
      >
        <Play
          className={cn(
            "hidden h-3.5 w-3.5 fill-current group-hover:block",
            (selected || highlighted) && "block",
          )}
        />
        <span className={cn("group-hover:hidden", (selected || highlighted) && "hidden")}>
          {index}
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-[7px]">
          <span className="text-[13px] font-semibold tracking-tight">{lesson.title}</span>
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
        {lesson.video && (
          <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
            {formatSeconds(videoSeconds(lesson.video))} video
          </span>
        )}
      </span>
    </div>
  );
}
