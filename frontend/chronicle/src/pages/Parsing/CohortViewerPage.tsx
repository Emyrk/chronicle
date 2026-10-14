import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PlayerCohortView } from "./cohort/PlayerCohortView";
import { TimeCohortView } from "./cohort/TimeCohortView";

type CohortView = "boss" | "clear" | "players";

const VIEWS: { value: CohortView; label: string; description: string }[] = [
  { value: "boss", label: "Boss kill times", description: "Every clean kill of one boss, scored by how fast it died." },
  { value: "clear", label: "Clear times", description: "Every full clear of one instance, scored by total clear time." },
  { value: "players", label: "Player DPS / HPS", description: "Every player in one encounter and class, scored by DPS or HPS." },
];

export function CohortViewerPage() {
  // All selections live in the URL so a cohort view can be linked/shared,
  // e.g. /parsing/cohorts?view=boss&instance=Molten+Core&encounter=Ragnaros
  const [searchParams, setSearchParams] = useSearchParams();
  // Links from before the time views existed carry player filters but no view.
  const requestedView = searchParams.get("view");
  const view: CohortView =
    requestedView === "boss" || requestedView === "clear" || requestedView === "players"
      ? requestedView
      : searchParams.has("class")
        ? "players"
        : "boss";

  // Apply several param changes at once. Empty values delete the param to
  // keep URLs short; replace avoids history spam while clicking through.
  const updateParams = useCallback(
    (changes: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Snapshots and filters don't carry across populations, so switching view
  // starts fresh.
  const setView = (next: CohortView) => setSearchParams(next === "boss" ? {} : { view: next });
  const active = VIEWS.find((v) => v.value === view) ?? VIEWS[0];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <Link to="/parsing" className="text-sm text-muted-foreground hover:text-foreground">
        ← How parses work
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-3xl font-bold">Cohort Viewer</h1>
        <p className="mt-1 text-muted-foreground">
          The raw populations behind parse scores. Pick a cohort to see every run in it and what each parse takes.
        </p>
      </div>

      <div className="mb-5 border-b border-border">
        <div role="tablist" aria-label="Cohort type" className="styled-scrollbar -mb-px flex gap-1 overflow-x-auto">
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={view === option.value}
              onClick={() => setView(option.value)}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                view === option.value
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{active.description}</p>

      {view === "players" ? (
        <PlayerCohortView params={searchParams} updateParams={updateParams} />
      ) : (
        <TimeCohortView
          key={view}
          kind={view === "boss" ? "boss_kill" : "clear_time"}
          params={searchParams}
          updateParams={updateParams}
        />
      )}
    </div>
  );
}
