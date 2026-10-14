import { useMemo } from "react";
import { useSnapshotCohort, useSnapshotsList } from "@/api/rankingsQueries";
import type { CohortBucket } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { CohortMessage, CohortSummaryStrip, FilterSelect, SegmentedControl, type SelectOption } from "./CohortChrome";
import { CohortDistribution } from "./CohortDistribution";
import { CohortTable, type CohortTableRow } from "./CohortTable";
import { formatMetric, summarizeCohort, tierCutoffs } from "./cohortStats";
import type { UpdateParams } from "./TimeCohortView";

function distinct(values: readonly string[]): SelectOption[] {
  return [...new Set(values.filter(Boolean))].sort().map((value) => ({ value, label: value }));
}

function formatDate(iso: string): string {
  // Snapshot cutoffs are UTC midnights; local time would show the day before.
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Cohort viewer for DPS/HPS parses: every player in one encounter + class
 * (+ spec) bucket of a parse snapshot.
 */
export function PlayerCohortView({ params, updateParams }: { params: URLSearchParams; updateParams: UpdateParams }) {
  const snapshotsQuery = useSnapshotsList();
  const snapshots = useMemo(() => snapshotsQuery.data ?? [], [snapshotsQuery.data]);
  const snapshotId = params.get("snapshot") ?? snapshots[0]?.id ?? "";
  const encounterName = params.get("encounter") ?? "";
  const playerClass = params.get("class") ?? "";
  const playerSpec = params.get("spec") ?? "";
  const playerSubSpec = params.get("sub_spec") ?? "";
  const difficulty = params.get("difficulty") ?? "";
  const maxPlayersRaw = Number(params.get("max_players") ?? "");
  const maxPlayers = Number.isFinite(maxPlayersRaw) && maxPlayersRaw > 0 ? maxPlayersRaw : undefined;
  const metric: "dps" | "hps" = params.get("metric") === "hps" ? "hps" : "dps";
  const highlight = params.get("highlight") ?? "";

  const cohortQuery = useSnapshotCohort({
    snapshotId,
    encounter_name: encounterName || undefined,
    class: playerClass || undefined,
    spec: playerSpec || undefined,
    sub_spec: playerSubSpec || undefined,
    difficulty,
    max_players: maxPlayers,
    metric,
  });
  const cohort = cohortQuery.data;
  const buckets = useMemo(() => cohort?.buckets ?? [], [cohort?.buckets]);

  const matches = (bucket: CohortBucket, upTo: "encounter" | "class" | "spec") =>
    (!encounterName || bucket.encounter_name === encounterName) &&
    (upTo === "encounter" || !playerClass || bucket.player_class === playerClass) &&
    (upTo !== "spec" || !playerSpec || bucket.player_spec === playerSpec);

  const encounters = useMemo(() => distinct(buckets.map((b) => b.encounter_name)), [buckets]);
  const classes = distinct(buckets.filter((b) => matches(b, "encounter")).map((b) => b.player_class));
  const specs = distinct(buckets.filter((b) => matches(b, "class")).map((b) => b.player_spec));
  const subSpecs = distinct(buckets.filter((b) => matches(b, "spec")).map((b) => b.player_sub_spec ?? ""));
  const difficulties = distinct(buckets.map((b) => b.difficulty_name));
  const sizes = [...new Set(buckets.map((b) => b.max_players))].filter(Boolean).sort((a, b) => a - b);

  const ready = !!encounterName && !!playerClass;
  const entries = useMemo(() => (ready ? (cohort?.entries ?? []) : []), [cohort?.entries, ready]);
  const scored = useMemo(() => entries.map((e) => ({ value: e.metric_value, score: e.display_score })), [entries]);
  const summary = useMemo(() => summarizeCohort(entries.map((e) => e.metric_value), "higher"), [entries]);
  const cutoffs = useMemo(() => tierCutoffs(scored, "higher"), [scored]);
  const highlighted = entries.find((e) => e.player_guid === highlight);
  const metricLabel = metric.toUpperCase();

  const rows = useMemo<CohortTableRow[]>(() => {
    const top = entries[0]?.metric_value ?? 0;
    return entries.map((entry) => ({
      key: `${entry.player_guid}-${entry.killed_at}`,
      rank: entry.rank,
      name: (
        <span className="font-medium" style={{ color: getClassColorVar(playerClass) }}>
          {entry.player_name}
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Snapshot"
          value={snapshotId}
          options={snapshots.map((s) => ({
            value: s.id,
            label: `${formatDate(s.cutoff)} · ${s.lookback_days === 0 ? "all time" : `${s.lookback_days} days`} · ${s.cohort_mode}`,
          }))}
          onChange={(value) => updateParams({ snapshot: value, encounter: "", class: "", spec: "", sub_spec: "" })}
          placeholder={snapshots.length ? undefined : snapshotsQuery.isLoading ? "Loading…" : "No snapshots"}
          className="w-64"
        />
        <FilterSelect
          label="Encounter"
          value={encounterName}
          options={encounters}
          onChange={(value) => updateParams({ encounter: value, class: "", spec: "", sub_spec: "" })}
          placeholder="Choose encounter"
          disabled={!encounters.length}
          className="w-48"
        />
        <FilterSelect
          label="Class"
          value={playerClass}
          options={classes}
          onChange={(value) => updateParams({ class: value, spec: "", sub_spec: "" })}
          placeholder="Choose class"
          disabled={!encounterName}
          className="w-36"
        />
        <FilterSelect
          label="Spec"
          value={playerSpec}
          options={specs}
          onChange={(value) => updateParams({ spec: value, sub_spec: "" })}
          placeholder="All specs"
          disabled={!playerClass}
          className="w-36"
        />
        {subSpecs.length > 0 && (
          <FilterSelect
            label="Sub-spec"
            value={playerSubSpec}
            options={subSpecs}
            onChange={(value) => updateParams({ sub_spec: value })}
            placeholder="All sub-specs"
            disabled={!playerSpec}
            className="w-36"
          />
        )}
        {difficulties.length > 1 && (
          <FilterSelect
            label="Difficulty"
            value={difficulty}
            options={difficulties}
            onChange={(value) => updateParams({ difficulty: value })}
            placeholder="Any"
            className="w-32"
          />
        )}
        {sizes.length > 1 && (
          <FilterSelect
            label="Raid size"
            value={maxPlayers ? String(maxPlayers) : ""}
            options={sizes.map((size) => ({ value: String(size), label: `${size} players` }))}
            onChange={(value) => updateParams({ max_players: value })}
            placeholder="Any"
            className="w-32"
          />
        )}
        <SegmentedControl
          label="Metric"
          value={metric}
          options={[
            { value: "dps", label: "DPS" },
            { value: "hps", label: "HPS" },
          ]}
          onChange={(value) => updateParams({ metric: value === "dps" ? "" : value })}
        />
      </div>

      {snapshotsQuery.isError || cohortQuery.isError ? (
        <CohortMessage>Couldn't load parse snapshots.</CohortMessage>
      ) : !snapshotsQuery.isLoading && snapshots.length === 0 ? (
        <CohortMessage>No parse snapshots have been published yet.</CohortMessage>
      ) : !ready ? (
        <CohortMessage>
          {snapshotsQuery.isLoading || cohortQuery.isLoading ? "Loading…" : "Choose an encounter and class to see the cohort."}
        </CohortMessage>
      ) : !summary ? (
        <CohortMessage>{cohortQuery.isFetching ? "Loading cohort…" : "No players in this bucket. Try different filters."}</CohortMessage>
      ) : (
        <div className={cn("space-y-4 transition-opacity", cohortQuery.isFetching && "opacity-60")}>
          {highlighted && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm">
              Highlighted player: <span className="font-semibold">{highlighted.player_name}</span>,{" "}
              {formatMetric(highlighted.metric_value)} {metricLabel}, rank {highlighted.rank} of {entries.length}, parse{" "}
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
          />
          <CohortDistribution
            values={scored}
            time={false}
            direction="higher"
            formatValue={formatMetric}
            formatTick={(value) => Math.round(value).toLocaleString("en-US")}
            unitLabel="players"
            highlight={highlighted ? { value: highlighted.metric_value, label: highlighted.player_name } : undefined}
          />
          <CohortTable rows={rows} nameHeader="Player" valueHeader={metricLabel} deltaHeader="Behind top" />
        </div>
      )}
    </div>
  );
}
