import { entityAttributes, specEntity } from "@/components/EntityMenu/entity";
import { CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type {
  CareerContribution,
  CareerPlayerCohort,
  CareerPlayerResponse,
  CareerSummary,
} from "@/api/typesGenerated";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
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
            <Stat
              label="Mastery"
              value={formatScore(summary.mastery)}
              color={METRIC_THEMES.mastery.accent}
              big
              breakdown={summary.mastery !== null && <WeightedBreakdown summary={summary} field="mastery" />}
            />
            <div className="flex grow gap-6 border-l border-border pl-6">
              <Stat
                label="Peak"
                value={formatScore(summary.peak)}
                color={METRIC_THEMES.peak.accent}
                breakdown={summary.peak !== null && <WeightedBreakdown summary={summary} field="peak" />}
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

function Stat({
  label,
  value,
  color,
  big,
  breakdown,
}: {
  label: string;
  value: string;
  color: string;
  big?: boolean;
  /** Shown on hover. */
  breakdown?: ReactNode;
}) {
  const stat = (
    <div className={`shrink-0 ${breakdown ? "cursor-help" : ""}`} tabIndex={breakdown ? 0 : undefined}>
      <div
        className={`font-mono leading-none font-bold tabular-nums ${big ? "text-5xl" : "text-2xl"}`}
        style={{ color }}
      >
        {value}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{label}</div>
    </div>
  );
  if (!breakdown) return stat;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{stat}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={2} className="max-w-none px-3 py-2.5">
        {breakdown}
      </TooltipContent>
    </Tooltip>
  );
}

const raidName = (c: CareerContribution) =>
  [c.instance_name, c.difficulty_name, c.max_players > 0 ? `${c.max_players}` : ""].filter(Boolean).join(" ");

/** Weighted average of each raid's Mastery or Peak; raids without kills count as zero. */
function WeightedBreakdown({ summary, field }: { summary: CareerSummary; field: "mastery" | "peak" }) {
  const label = field === "mastery" ? "Mastery" : "Peak";
  const rows = summary.contributions
    .filter((c) => c.include_average)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || raidName(a).localeCompare(raidName(b)));
  const totalWeight = rows.reduce((n, c) => n + (c.weight ?? 0), 0);
  const totalWeighted = rows.reduce((n, c) => n + (c.weight ?? 0) * (c[field] ?? 0), 0);
  return (
    <div className="space-y-2">
      <div className="font-semibold">{label} by raid</div>
      <table className="font-mono tabular-nums">
        <thead>
          <tr className="text-zinc-400">
            <th className="pr-4 text-left font-normal">Raid</th>
            <th className="pr-4 text-right font-normal">Weight</th>
            <th className="pr-4 text-right font-normal">{label}</th>
            <th className="text-right font-normal">Weighted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const value = c[field] ?? 0;
            const empty = c.eligible_metric_kills === 0;
            return (
              <tr key={raidName(c)} className={empty ? "text-zinc-500" : undefined}>
                <td className="pr-4 font-sans">{raidName(c)}</td>
                <td className="pr-4 text-right">{c.weight === null ? "—" : `×${c.weight}`}</td>
                <td className="pr-4 text-right">{empty ? "0" : value.toFixed(1)}</td>
                <td className="text-right">{((c.weight ?? 0) * value).toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/10">
            <td className="pt-1 pr-4 font-sans text-zinc-400">Total</td>
            <td className="pt-1 pr-4 text-right">{totalWeight}</td>
            <td />
            <td className="pt-1 text-right">{totalWeighted.toFixed(1)}</td>
          </tr>
        </tfoot>
      </table>
      {totalWeight > 0 && (
        <div className="text-zinc-400">
          {totalWeighted.toFixed(1)} ÷ {totalWeight} = <span className="text-zinc-100">{formatScore(summary[field])}</span>
          {" · "}raids without kills count as zero
        </div>
      )}
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
            {...(c.player_spec ? entityAttributes(specEntity(c.player_class, CLASS_DISPLAY[c.player_class] ?? c.player_class, c.player_spec, c.player_sub_spec || undefined)) : {})}
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
