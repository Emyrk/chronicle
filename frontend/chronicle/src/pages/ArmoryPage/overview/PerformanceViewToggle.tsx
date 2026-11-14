import { Award, BarChart3, type LucideIcon } from "lucide-react";

export type PerformanceView = "ratings" | "parses";

const VIEWS: Array<{ key: PerformanceView; label: string; title: string; icon: LucideIcon }> = [
  { key: "ratings", label: "Ratings", title: "Career Mastery, Peak, and Renown", icon: Award },
  { key: "parses", label: "Parses", title: "Best-3 parse average per boss, last 60 days", icon: BarChart3 },
];

/** Pill switch between career ratings and the 60-day parse scores. */
export function PerformanceViewToggle({
  view,
  onChange,
}: {
  view: PerformanceView;
  onChange: (view: PerformanceView) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Performance view"
      className="relative col-span-2 grid h-8 grid-cols-2 rounded-full border border-border bg-muted/40 p-0.5 sm:col-span-1"
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-primary/20 shadow-sm ring-1 ring-primary/60 transition-transform duration-200 ease-out"
        style={{ transform: view === "parses" ? "translateX(100%)" : undefined }}
      />
      {VIEWS.map(({ key, label, title, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={view === key}
          title={title}
          onClick={() => onChange(key)}
          className={`relative z-10 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            view === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className={`size-3.5 ${view === key ? "text-primary" : ""}`} />
          {label}
        </button>
      ))}
    </div>
  );
}
