import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCalendarWeeks,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from "../utils/calendarUtils";
import { CalendarAgendaView } from "./CalendarAgendaView";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface LogsCalendarProps {
  month: Date;
  onMonthChange: (date: Date) => void;
  dayContent: (date: Date) => React.ReactNode;
  headerRight?: React.ReactNode;
  density?: "default" | "compact";
  fillHeight?: boolean;
  /**
   * "bordered" (default) renders one bordered grid with shared cell borders;
   * "cells" renders detached rounded day cells with gaps between them.
   */
  variant?: "bordered" | "cells";
}

function useIsSmallScreen(): boolean {
  const [isSmall, setIsSmall] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 640 : false
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const handler = (e: MediaQueryListEvent) => setIsSmall(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isSmall;
}

export function LogsCalendar({
  month,
  onMonthChange,
  dayContent,
  headerRight,
  density = "default",
  fillHeight = false,
  variant = "bordered",
}: LogsCalendarProps) {
  const isSmall = useIsSmallScreen();
  const compact = density === "compact";
  const cells = variant === "cells";
  // The cells variant is themed compact throughout so the panel works small.
  const tightHeader = compact || cells;
  const weeks = getCalendarWeeks(month);

  if (isSmall) {
    return (
      <CalendarAgendaView
        month={month}
        onMonthChange={onMonthChange}
        dayContent={dayContent}
        headerRight={headerRight}
      />
    );
  }

  return (
    <div className={fillHeight ? "flex h-full w-full min-h-0 flex-col" : "w-full"}>
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between ${tightHeader ? "mb-1 gap-1" : "mb-4 gap-3"}`}>
        <div className="flex items-center gap-2">
          <h2 className={tightHeader ? "text-sm font-semibold" : "text-lg font-semibold"}>
            {format(month, "MMMM yyyy")}
          </h2>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className={tightHeader ? "h-6 w-6" : "h-8 w-8"}
              onClick={() => onMonthChange(subMonths(month, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={tightHeader ? "h-6 w-6" : "h-8 w-8"}
              onClick={() => onMonthChange(addMonths(month, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {headerRight}
      </div>

      {/* Calendar grid - horizontal scroll on mobile */}
      <div className={`overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 ${fillHeight ? "min-h-0 flex-1" : ""}`}>
        <div
          className={`min-w-[500px] sm:min-w-0 ${cells ? "" : "border border-border rounded-lg overflow-hidden"} ${fillHeight ? "flex h-full min-h-0 flex-col" : ""} ${cells && fillHeight ? "gap-1.5" : ""}`}
        >
          {/* Day names header */}
          <div className={`grid grid-cols-7 ${cells ? "gap-1.5" : "bg-muted/50"}`}>
            {DAY_NAMES.map((day) => (
              <div
                key={day}
                className={`${cells ? "py-0.5 text-[10px] uppercase tracking-widest" : compact ? "py-1 text-[10px] border-b border-border" : "py-2 text-xs border-b border-border"} text-center font-medium text-muted-foreground`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, weekIndex) => (
            <div
              key={weekIndex}
              className={`grid grid-cols-7 ${cells ? "gap-1.5" : ""} ${cells && !fillHeight ? "mb-1.5 last:mb-0" : ""} ${fillHeight ? "min-h-0 flex-1" : ""}`}
            >
              {week.map((date, dayIndex) => {
                const inCurrentMonth = isSameMonth(date, month);
                const today = isToday(date);

                return (
                  <div
                    key={dayIndex}
                    className={`
                      ${
                        fillHeight
                          ? cells
                            ? "p-0.5"
                            : compact
                              ? "p-1"
                              : "p-1 sm:p-1.5"
                          : cells
                            ? compact
                              ? "min-h-[36px] p-0.5"
                              : "min-h-[56px] p-1"
                            : compact
                              ? "min-h-[48px] p-1"
                              : "min-h-[80px] sm:min-h-[100px] p-1 sm:p-1.5"
                      }
                      ${
                        cells
                          ? `rounded-md border ${today ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/20"} ${!inCurrentMonth ? "opacity-40" : ""}`
                          : `border-b border-r border-border last:border-r-0 ${!inCurrentMonth ? "bg-muted/30" : ""} ${today ? "bg-primary/5" : ""}`
                      }
                      ${fillHeight ? "flex min-h-0 flex-col overflow-hidden" : ""}
                    `}
                  >
                    {/* Date number */}
                    <div className="mb-1 flex shrink-0 items-center justify-between">
                      <span
                        className={`
                          ${compact ? "text-[10px]" : "text-xs sm:text-sm"} font-medium
                          ${!inCurrentMonth ? "text-muted-foreground/50" : ""}
                          ${today ? "text-primary font-bold" : ""}
                        `}
                      >
                        {format(date, "d")}
                      </span>
                      {today && (
                        <span className={`${compact ? "text-[9px]" : "text-[10px] sm:text-xs"} text-primary font-medium`}>
                          Today
                        </span>
                      )}
                    </div>

                    {/* Day content (instances, upload badges, etc.). In
                        fillHeight mode the row height is fixed by the panel,
                        so overflowing content scrolls inside the cell instead
                        of spilling into the next week. */}
                    <div className={fillHeight ? "min-h-0 flex-1 space-y-1 overflow-y-auto" : "space-y-1"}>
                      {dayContent(date)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
