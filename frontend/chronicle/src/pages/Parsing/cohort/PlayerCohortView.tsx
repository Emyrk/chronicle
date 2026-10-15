import { useEffect, useMemo } from "react";
import {
  useParseScoreCohort,
  useParseScoreCohortBuckets,
  type TimeParseCohortPeriod,
} from "@/api/rankingsQueries";
import type { ParseScoreCohortBucket } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import {
  CohortMessage,
  CohortSummaryStrip,
  FilterSelect,
  SegmentedControl,
  type SelectOption,
} from "./CohortChrome";
import { CohortDistribution } from "./CohortDistribution";
import { CohortTable, type CohortTableRow } from "./CohortTable";
import { formatMetric, summarizeCohort, tierCutoffs } from "./cohortStats";
import {
  DEFAULT_SUB_SPEC_VALUE,
  playerCohortBucketMatchesSubSpec,
  playerCohortSizeKey,
  selectPlayerCohortSize,
  selectPlayerSubSpec,
} from "./playerCohortState";
import type { UpdateParams } from "./TimeCohortView";

const DEFAULT_PERIOD: TimeParseCohortPeriod = "60d";
const PERIOD_OPTIONS: readonly SelectOption[] = [
  { value: "30d", label: "30 days" },
  { value: "60d", label: "60 days" },
  { value: "90d", label: "90 days" },
  { value: "180d", label: "180 days" },
  { value: "all", label: "All time" },
];
const PERIODS = new Set(PERIOD_OPTIONS.map((option) => option.value));

function isUTCDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function distinct(values: readonly string[]): SelectOption[] {
  return [...new Set(values.filter(Boolean))].sort().map((value) => ({ value, label: value }));
}

function sizeLabel(bucket: ParseScoreCohortBucket): string {
  const parts = [bucket.difficulty_name || "Default", bucket.max_players ? `${bucket.max_players} players` : ""];
  return parts.filter(Boolean).join(" · ");
}

/** Live membership-backed DPS/HPS cohort viewer. */
export function PlayerCohortView({ params, updateParams }: { params: URLSearchParams; updateParams: UpdateParams }) {
  const defaultDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const requestedDate = params.get("date");
  const date = isUTCDate(requestedDate) ? requestedDate : defaultDate;
  const requestedPeriod = params.get("period");
  const period: TimeParseCohortPeriod = PERIODS.has(requestedPeriod ?? "")
    ? (requestedPeriod as TimeParseCohortPeriod)
    : DEFAULT_PERIOD;
  const metric: "dps" | "hps" = params.get("metric") === "hps" ? "hps" : "dps";
  const encounterName = params.get("encounter") ?? "";
  const playerClass = params.get("class") ?? "";
  const playerSpec = params.get("spec") ?? "";
  const playerSubSpec = params.get("sub_spec") ?? "";
  const highlight = params.get("highlight") ?? "";

  useEffect(() => {
    const changes: Record<string, string> = {};
    if (requestedDate !== date) changes.date = date;
    if (requestedPeriod !== period) changes.period = period;
    if (params.has("snapshot")) changes.snapshot = "";
    if (Object.keys(changes).length > 0) updateParams(changes);
  }, [date, params, period, requestedDate, requestedPeriod, updateParams]);

  const bucketsQuery = useParseScoreCohortBuckets(date, period, metric);
  const buckets = useMemo(() => bucketsQuery.data?.buckets ?? [], [bucketsQuery.data]);
  const cohortMode = bucketsQuery.data?.cohort_mode ?? "spec";
  const specMode = cohortMode === "spec";

  useEffect(() => {
    if (!specMode && (params.has("spec") || params.has("sub_spec"))) {
      updateParams({ spec: "", sub_spec: "" });
    }
  }, [params, specMode, updateParams]);

  const encounters = useMemo(() => distinct(buckets.map((bucket) => bucket.encounter_name)), [buckets]);
  const classes = useMemo(
    () => distinct(buckets.filter((bucket) => bucket.encounter_name === encounterName).map((bucket) => bucket.player_class)),
    [buckets, encounterName],
  );
  const specs = useMemo(
    () =>
      distinct(
        buckets
          .filter((bucket) => bucket.encounter_name === encounterName && bucket.player_class === playerClass)
          .map((bucket) => bucket.player_spec ?? ""),
      ),
    [buckets, encounterName, playerClass],
  );
  const rawSubSpecs = useMemo(
    () =>
      [...new Set(
        buckets
          .filter(
            (bucket) =>
              bucket.encounter_name === encounterName &&
              bucket.player_class === playerClass &&
              bucket.player_spec === playerSpec,
          )
          .map((bucket) => bucket.player_sub_spec ?? ""),
      )].sort((a, b) => a.localeCompare(b)),
    [buckets, encounterName, playerClass, playerSpec],
  );
  const subSpecSelection = selectPlayerSubSpec(rawSubSpecs, playerSubSpec);
  const selectedSubSpec = subSpecSelection.selected;
  const subSpecOptions = subSpecSelection.options;
  const showSubSpec = subSpecSelection.showControl;

  useEffect(() => {
    if (specMode && playerSpec && rawSubSpecs.length > 0 && selectedSubSpec !== playerSubSpec) {
      updateParams({ sub_spec: selectedSubSpec, difficulty: "", max_players: "", highlight: "" });
    }
  }, [playerSpec, playerSubSpec, rawSubSpecs.length, selectedSubSpec, specMode, updateParams]);

  const sizeBuckets = useMemo(
    () =>
      buckets
        .filter(
          (bucket) =>
            bucket.encounter_name === encounterName &&
            bucket.player_class === playerClass &&
            (!specMode ||
              (bucket.player_spec === playerSpec && playerCohortBucketMatchesSubSpec(bucket, selectedSubSpec))),
        )
        .sort((a, b) => b.sample_size - a.sample_size),
    [buckets, encounterName, playerClass, playerSpec, selectedSubSpec, specMode],
  );
  const requestedSize = `${params.get("difficulty") ?? ""}|${params.get("max_players") ?? ""}`;
  const selectedSize = selectPlayerCohortSize(sizeBuckets, requestedSize);

  useEffect(() => {
    if (selectedSize && playerCohortSizeKey(selectedSize) !== requestedSize) {
      updateParams({
        difficulty: selectedSize.difficulty_name,
        max_players: String(selectedSize.max_players),
      });
    }
  }, [requestedSize, selectedSize, updateParams]);

  const cohortQuery = useParseScoreCohort({
    date,
    period,
    metric,
    encounterName,
    playerClass,
    playerSpec,
    playerSubSpec: selectedSubSpec,
    difficulty: selectedSize?.difficulty_name ?? "",
    maxPlayers: selectedSize?.max_players,
    cohortMode,
  });
  const cohort = selectedSize ? cohortQuery.data : undefined;
  const entries = useMemo(() => cohort?.entries ?? [], [cohort]);
  const scored = useMemo(() => entries.map((entry) => ({ value: entry.metric_value, score: entry.display_score })), [entries]);
  const summary = useMemo(() => summarizeCohort(entries.map((entry) => entry.metric_value), "higher"), [entries]);
  const cutoffs = useMemo(() => tierCutoffs(scored, "higher"), [scored]);
  const highlighted = entries.find((entry) => entry.player_guid === highlight);
  const metricLabel = metric.toUpperCase();

  const rows = useMemo<CohortTableRow[]>(() => {
    const top = entries[0]?.metric_value ?? 0;
    return entries.map((entry) => ({
      key: `${entry.run_id}-${entry.player_guid}`,
      rank: entry.rank,
      name: (
        <span className="font-medium" style={{ color: getClassColorVar(playerClass) }}>
          {entry.player_name || entry.player_guid}
        </span>
      ),
      value: formatMetric(entry.metric_value),
      score: entry.display_score,
      delta: top > 0 && entry.metric_value < top ? `−${(((top - entry.metric_value) / top) * 100).toFixed(1)}%` : "—",
      killedAt: entry.killed_at,
      logSlug: entry.log_hashed_slug,
      highlighted: entry.player_guid === highlight,
    }));
  }, [entries, highlight, playerClass]);

  const resetSelection = {
    encounter: "",
    class: "",
    spec: "",
    sub_spec: "",
    difficulty: "",
    max_players: "",
    highlight: "",
  };
  const ready = !!encounterName && !!playerClass && (!specMode || !!playerSpec) && !!selectedSize;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-44 min-w-[9rem] flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cutoff date (UTC)</span>
          <input
            type="date"
            value={date}
            onChange={(event) => updateParams({ date: event.target.value, ...resetSelection })}
            className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          />
        </label>
        <FilterSelect
          label="Window"
          value={period}
          options={PERIOD_OPTIONS}
          onChange={(value) => updateParams({ period: value, ...resetSelection })}
          className="w-36"
        />
        <FilterSelect
          label="Encounter"
          value={encounterName}
          options={encounters}
          onChange={(value) => updateParams({ encounter: value, class: "", spec: "", sub_spec: "", difficulty: "", max_players: "", highlight: "" })}
          placeholder="Choose encounter"
          disabled={!buckets.length}
          className="w-52"
        />
        <FilterSelect
          label="Class"
          value={playerClass}
          options={classes}
          onChange={(value) => updateParams({ class: value, spec: "", sub_spec: "", difficulty: "", max_players: "", highlight: "" })}
          placeholder="Choose class"
          disabled={!encounterName}
          className="w-36"
        />
        {specMode && (
          <FilterSelect
            label="Spec"
            value={playerSpec}
            options={specs}
            onChange={(value) => updateParams({ spec: value, sub_spec: "", difficulty: "", max_players: "", highlight: "" })}
            placeholder="Choose spec"
            disabled={!playerClass}
            className="w-36"
          />
        )}
        {specMode && showSubSpec && (
          <FilterSelect
            label="Sub-spec"
            value={selectedSubSpec || DEFAULT_SUB_SPEC_VALUE}
            options={subSpecOptions}
            onChange={(value) =>
              updateParams({
                sub_spec: value === DEFAULT_SUB_SPEC_VALUE ? "" : value,
                difficulty: "",
                max_players: "",
                highlight: "",
              })
            }
            disabled={!playerSpec}
            className="w-36"
          />
        )}
        {sizeBuckets.length > 0 && (
          <FilterSelect
            label="Difficulty"
            value={selectedSize ? playerCohortSizeKey(selectedSize) : ""}
            options={sizeBuckets.map((bucket) => ({
              value: playerCohortSizeKey(bucket),
              label: `${sizeLabel(bucket)} (${bucket.sample_size})`,
            }))}
            onChange={(value) => {
              const [difficulty, maxPlayers] = value.split("|");
              updateParams({ difficulty, max_players: maxPlayers, highlight: "" });
            }}
            className="w-52"
          />
        )}
        <SegmentedControl
          label="Metric"
          value={metric}
          options={[
            { value: "dps", label: "DPS" },
            { value: "hps", label: "HPS" },
          ]}
          onChange={(value) => updateParams({ metric: value === "dps" ? "" : value, ...resetSelection })}
        />
      </div>

      {bucketsQuery.isError ? (
        <CohortMessage>Couldn't load player cohorts.</CohortMessage>
      ) : bucketsQuery.data && !bucketsQuery.data.available ? (
        <CohortMessage>Player parses are disabled for this server.</CohortMessage>
      ) : !ready ? (
        <CohortMessage>
          {bucketsQuery.isLoading
            ? "Loading…"
            : buckets.length === 0
              ? `No ${metricLabel} performances in this date window.`
              : `Choose an encounter, class${specMode ? ", and spec" : ""} to see the cohort.`}
        </CohortMessage>
      ) : cohortQuery.isError ? (
        <CohortMessage>Couldn't load this player cohort.</CohortMessage>
      ) : !cohort || !summary ? (
        <CohortMessage>{cohortQuery.isLoading ? "Loading cohort…" : "No players in this exact bucket."}</CohortMessage>
      ) : (
        <div className={cn("space-y-4 transition-opacity", cohortQuery.isPlaceholderData && "opacity-60")}>
          {highlighted && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm">
              Highlighted player: <span className="font-semibold">{highlighted.player_name || highlighted.player_guid}</span>,{" "}
              {formatMetric(highlighted.metric_value)} {metricLabel}, rank {highlighted.rank} of {highlighted.sample_size + 1}, parse{" "}
              {highlighted.display_score}.
            </div>
          )}
          <CohortSummaryStrip
            summary={summary}
            cutoffs={cutoffs}
            formatValue={formatMetric}
            sampleLabel="Kills"
            bestLabel={`Top ${metricLabel}`}
            worstLabel={`Lowest ${metricLabel}`}
            status={cohort.status}
          />
          <CohortDistribution
            values={scored}
            time={false}
            direction="higher"
            formatValue={formatMetric}
            formatTick={(value) => Math.round(value).toLocaleString("en-US")}
            unitLabel="players"
            highlight={highlighted ? { value: highlighted.metric_value, label: highlighted.player_name || highlighted.player_guid } : undefined}
          />
          <CohortTable rows={rows} nameHeader="Player" valueHeader={metricLabel} deltaHeader="Behind top" />
        </div>
      )}
    </div>
  );
}
