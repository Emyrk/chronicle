import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useTimeParseCohort,
  useTimeParseCohortBuckets,
  type TimeParseCohortPeriod,
} from "@/api/rankingsQueries";
import type { TimeParseCohortBucket, TimeParseCohortKind } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { ChoiceChips, CohortMessage, CohortSummaryStrip, FilterSelect, type SelectOption } from "./CohortChrome";
import { CohortDistribution } from "./CohortDistribution";
import { CohortTable, type CohortTableRow } from "./CohortTable";
import { formatClock, summarizeCohort, tierCutoffs } from "./cohortStats";

const DEFAULT_PERIOD: TimeParseCohortPeriod = "60d";
const PERIOD_OPTIONS: readonly SelectOption[] = [
  { value: "30d", label: "30 days" },
  { value: "60d", label: "60 days" },
  { value: "90d", label: "90 days" },
  { value: "180d", label: "180 days" },
  { value: "all", label: "All time" },
];
const PERIODS = new Set(PERIOD_OPTIONS.map((option) => option.value));

export type UpdateParams = (changes: Record<string, string>) => void;

function isUTCDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function sizeKey(bucket: TimeParseCohortBucket): string {
  return `${bucket.difficulty_name}|${bucket.max_players}`;
}

function sizeLabel(bucket: TimeParseCohortBucket): string {
  const parts = [bucket.difficulty_name || "Default", bucket.max_players ? `${bucket.max_players} players` : ""];
  return parts.filter(Boolean).join(" · ");
}

/** Sums bucket sample sizes by key, e.g. per instance or per boss. */
function sampleTotals(buckets: readonly TimeParseCohortBucket[], key: (bucket: TimeParseCohortBucket) => string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const bucket of buckets) totals.set(key(bucket), (totals.get(key(bucket)) ?? 0) + bucket.sample_size);
  return totals;
}

function formatGap(ms: number): string {
  return ms === 0 ? "—" : `+${formatClock(ms)}`;
}

/** Cohort viewer for live kill-time parses in a selected UTC date window. */
export function TimeCohortView({
  kind,
  params,
  updateParams,
}: {
  kind: TimeParseCohortKind;
  params: URLSearchParams;
  updateParams: UpdateParams;
}) {
  const isBoss = kind === "boss_kill";
  const defaultDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const requestedDate = params.get("date");
  const date = isUTCDate(requestedDate) ? requestedDate : defaultDate;
  const requestedPeriod = params.get("period");
  const period: TimeParseCohortPeriod = PERIODS.has(requestedPeriod ?? "")
    ? (requestedPeriod as TimeParseCohortPeriod)
    : DEFAULT_PERIOD;
  const instanceName = params.get("instance") ?? "";
  const encounterName = isBoss ? (params.get("encounter") ?? "") : "";
  const highlight = params.get("highlight") ?? "";

  // Materialize defaults in the URL so today's default remains the same when
  // the view is copied or revisited later. Also clean up legacy snapshot links.
  useEffect(() => {
    const changes: Record<string, string> = {};
    if (requestedDate !== date) changes.date = date;
    if (requestedPeriod !== period) changes.period = period;
    if (params.has("snapshot")) changes.snapshot = "";
    if (Object.keys(changes).length > 0) updateParams(changes);
  }, [date, params, period, requestedDate, requestedPeriod, updateParams]);

  const bucketsQuery = useTimeParseCohortBuckets(date, period);
  const buckets = useMemo(
    () => (bucketsQuery.data?.buckets ?? []).filter((bucket) => bucket.kind === kind),
    [bucketsQuery.data, kind],
  );

  const instanceTotals = useMemo(() => sampleTotals(buckets, (b) => b.instance_name), [buckets]);
  const encounterTotals = useMemo(
    () => sampleTotals(buckets.filter((b) => b.instance_name === instanceName), (b) => b.encounter_name ?? ""),
    [buckets, instanceName],
  );
  const sizeBuckets = useMemo(
    () =>
      buckets
        .filter((b) => b.instance_name === instanceName && (!isBoss || b.encounter_name === encounterName))
        .sort((a, b) => b.sample_size - a.sample_size),
    [buckets, instanceName, encounterName, isBoss],
  );

  // Default to the most-populated difficulty and raid size for the selection.
  const requestedSize = `${params.get("difficulty") ?? ""}|${params.get("max_players") ?? ""}`;
  const selectedSize = sizeBuckets.find((b) => sizeKey(b) === requestedSize) ?? sizeBuckets[0];

  const cohortQuery = useTimeParseCohort({
    date,
    period,
    kind,
    instanceName,
    encounterName,
    difficulty: selectedSize?.difficulty_name ?? "",
    maxPlayers: selectedSize?.max_players,
  });
  const cohort = selectedSize ? cohortQuery.data : undefined;

  const entries = useMemo(() => cohort?.entries ?? [], [cohort]);
  const scored = useMemo(() => entries.map((e) => ({ value: e.duration_ms, score: e.display_score })), [entries]);
  const summary = useMemo(() => summarizeCohort(entries.map((e) => e.duration_ms), "lower"), [entries]);
  const cutoffs = useMemo(() => tierCutoffs(scored, "lower"), [scored]);
  const highlighted = entries.find((e) => e.instance_id === highlight);

  const rows = useMemo<CohortTableRow[]>(() => {
    const fastest = entries[0]?.duration_ms ?? 0;
    return entries.map((entry) => ({
      key: entry.instance_id,
      rank: entry.rank,
      name: entry.guild_id ? (
        <Link to={`/g/${entry.guild_id}`} className="hover:underline">
          {entry.guild_name}
        </Link>
      ) : (
        <span className="text-muted-foreground">No guild</span>
      ),
      value: formatClock(entry.duration_ms),
      score: entry.display_score,
      delta: formatGap(entry.duration_ms - fastest),
      killedAt: entry.killed_at,
      logSlug: entry.log_hashed_slug,
      highlighted: entry.instance_id === highlight,
    }));
  }, [entries, highlight]);

  const toOptions = (totals: Map<string, number>): SelectOption[] =>
    [...totals.keys()].sort().map((name) => ({ value: name, label: name }));
  const resetCohortSelection = {
    instance: "",
    encounter: "",
    difficulty: "",
    max_players: "",
    highlight: "",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-44 min-w-[9rem] flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cutoff date (UTC)</span>
          <input
            type="date"
            value={date}
            onChange={(event) => updateParams({ date: event.target.value, ...resetCohortSelection })}
            className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          />
        </label>
        <FilterSelect
          label="Window"
          value={period}
          options={PERIOD_OPTIONS}
          onChange={(value) => updateParams({ period: value, ...resetCohortSelection })}
          className="w-36"
        />
        <FilterSelect
          label="Instance"
          value={instanceName}
          options={toOptions(instanceTotals)}
          onChange={(value) => updateParams({ instance: value, encounter: "", difficulty: "", max_players: "" })}
          placeholder="Choose instance"
          disabled={!buckets.length}
          className="w-52"
        />
        {isBoss && (
          <FilterSelect
            label="Boss"
            value={encounterName}
            options={toOptions(encounterTotals)}
            onChange={(value) => updateParams({ encounter: value, difficulty: "", max_players: "" })}
            placeholder="Choose boss"
            disabled={!instanceName}
            className="w-52"
          />
        )}
        {sizeBuckets.length > 0 && (
          <FilterSelect
            label="Difficulty"
            value={selectedSize ? sizeKey(selectedSize) : ""}
            options={sizeBuckets.map((b) => ({ value: sizeKey(b), label: `${sizeLabel(b)} (${b.sample_size})` }))}
            onChange={(value) => {
              const [difficulty, maxPlayers] = value.split("|");
              updateParams({ difficulty, max_players: maxPlayers });
            }}
            className="w-52"
          />
        )}
      </div>

      {bucketsQuery.isError ? (
        <CohortMessage>Couldn't load time-parse cohorts.</CohortMessage>
      ) : !instanceName ? (
        buckets.length > 0 ? (
          <ChoiceChips
            title="Choose an instance"
            choices={[...instanceTotals].map(([value, count]) => ({ value, label: value, count }))}
            onChoose={(value) => updateParams({ instance: value })}
          />
        ) : (
          <CohortMessage>{bucketsQuery.isLoading ? "Loading…" : "No runs in this date window."}</CohortMessage>
        )
      ) : isBoss && !encounterName ? (
        <ChoiceChips
          title={`Choose a ${instanceName} boss`}
          choices={[...encounterTotals].map(([value, count]) => ({ value, label: value, count }))}
          onChoose={(value) => updateParams({ encounter: value })}
        />
      ) : cohortQuery.isError ? (
        <CohortMessage>Couldn't load this cohort.</CohortMessage>
      ) : !cohort || !summary ? (
        <CohortMessage>{cohortQuery.isLoading || bucketsQuery.isLoading ? "Loading cohort…" : "No runs in this bucket."}</CohortMessage>
      ) : (
        <div className={cn("space-y-4 transition-opacity", cohortQuery.isPlaceholderData && "opacity-60")}>
          {highlighted && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm">
              Highlighted run: <span className="font-semibold">{formatClock(highlighted.duration_ms)}</span>, rank{" "}
              {highlighted.rank} of {cohort.sample_size}, parse {highlighted.display_score}.
            </div>
          )}
          <CohortSummaryStrip
            summary={summary}
            cutoffs={cutoffs}
            formatValue={formatClock}
            sampleLabel={isBoss ? "Kills" : "Clears"}
            bestLabel="Fastest"
            worstLabel="Slowest"
            status={cohort.status}
          />
          <CohortDistribution
            values={scored}
            time
            direction="lower"
            formatValue={formatClock}
            unitLabel={isBoss ? "kills" : "clears"}
            highlight={highlighted ? { value: highlighted.duration_ms, label: "This run" } : undefined}
          />
          <CohortTable
            rows={rows}
            nameHeader="Guild"
            valueHeader={isBoss ? "Kill time" : "Clear time"}
            deltaHeader="Behind fastest"
          />
        </div>
      )}
    </div>
  );
}
