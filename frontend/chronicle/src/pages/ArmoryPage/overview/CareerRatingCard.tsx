import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { CareerPlayerCohort, CareerPlayerResponse } from "@/api/typesGenerated";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { specializationIconUrl } from "@/config/specializationIcon";
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes";
import { careerStatusText, cohortKey, cohortLabel, raidCoverage } from "./careerRatingsModel";

interface CareerRatingCardProps {
  data?: CareerPlayerResponse;
  cohort?: CareerPlayerCohort;
  onCohortChange: (key: string) => void;
  isLoading: boolean;
  /** Message to show when the request failed. */
  error?: string;
}

const formatScore = (v: number | null) => (v === null ? "—" : v.toFixed(1));

/** Mastery, Peak, and Renown for one of the character's specs, beside the identity header. */
export function CareerRatingCard({ data, cohort, onCohortChange, isLoading, error }: CareerRatingCardProps) {
  const summary = cohort?.summary;
  // A spec's own status wins: one spec still preparing must not hide another's ratings.
  const message = error
    ?? (isLoading && !data ? "Loading ratings…" : undefined)
    ?? (summary
      ? careerStatusText(summary.performance_status)
      : data && (careerStatusText(data.status) ?? "No rated kills yet."));
  const coverage = cohort ? raidCoverage(cohort) : undefined;

  return (
    // min-h matches JourneyStatsCard so toggling modes doesn't shift the layout.
    <Card className="h-full min-h-[172px] gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-xs font-normal tracking-widest text-muted-foreground uppercase">
          Career rating
          {summary?.chosen_metric && (
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-normal text-foreground">
              {summary.chosen_metric.toUpperCase()}
            </span>
          )}
        </CardTitle>
        <CardAction>
          <Link
            to="/ratings"
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            How ratings work
            <ArrowUpRight className="size-3" />
          </Link>
        </CardAction>
        {data && data.cohorts.length > 1 && (
          <CohortSelector cohorts={data.cohorts} selected={cohort} onSelect={onCohortChange} />
        )}
      </CardHeader>
      <CardContent className="flex grow flex-col justify-center gap-3">
        {summary && (
          <div className="flex items-end gap-6">
            <Stat label="Mastery" value={formatScore(summary.mastery)} color={METRIC_THEMES.mastery.accent} big />
            <div className="flex grow gap-6 border-l border-border pl-6">
              <Stat label="Peak" value={formatScore(summary.peak)} color={METRIC_THEMES.peak.accent} />
              <Stat
                label="Renown"
                value={Math.round(summary.renown).toLocaleString()}
                color={METRIC_THEMES.renown.accent}
              />
            </div>
          </div>
        )}
        {(message || coverage || summary?.refresh_pending) && (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            {message && <p role="status">{message}</p>}
            {coverage && coverage.total > 0 && summary?.mastery !== null && (
              <p>
                {coverage.rated} of {coverage.total} raids rated · raids without kills count as zero
              </p>
            )}
            {summary?.refresh_pending && <p role="status">Updating · showing the last calculated values</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div className="shrink-0">
      <div
        className={`font-mono leading-none font-bold tabular-nums ${big ? "text-5xl" : "text-2xl"}`}
        style={{ color }}
      >
        {value}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/** The spec icon, or the game's "?" icon when the spec is unknown. */
function cohortIconUrl(c: CareerPlayerCohort): string {
  return c.player_spec && c.player_spec !== "Unknown"
    ? specializationIconUrl(c.player_class, c.player_spec)
    : "/c/icons/class_unknown.png";
}

function CohortSelector({
  cohorts,
  selected,
  onSelect,
}: {
  cohorts: readonly CareerPlayerCohort[];
  selected?: CareerPlayerCohort;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="col-span-full flex flex-wrap items-center gap-1 pt-2" role="group" aria-label="Rating specialization">
      {cohorts.map((c) => {
        const key = cohortKey(c);
        const active = selected !== undefined && cohortKey(selected) === key;
        const label = cohortLabel(c);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-label={`Show ${label} ratings`}
            onClick={() => onSelect(key)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              active
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <img src={cohortIconUrl(c)} alt="" className="size-4 rounded-sm" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
