import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTimeParseCohort, useTimeParseCohortBuckets, useTimeParseSnapshots } from "@/api/rankingsQueries";
import type { TimeParseCohortBucket, TimeParseCohortKind, TimeParseSnapshotSummary } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { ChoiceChips, CohortMessage, CohortSummaryStrip, FilterSelect, type SelectOption } from "./CohortChrome";
import { CohortDistribution } from "./CohortDistribution";
import { CohortTable, type CohortTableRow } from "./CohortTable";
import { formatClock, summarizeCohort, tierCutoffs } from "./cohortStats";

/** Matches parsepolicy.DefaultLookbackDays, the window instance pages score against. */
const DEFAULT_LOOKBACK_DAYS = 60;

export type UpdateParams = (changes: Record<string, string>) => void;

function snapshotLabel(snapshot: TimeParseSnapshotSummary): string {
  const date = new Date(snapshot.cutoff).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const window = snapshot.lookback_days === 0 ? "all time" : `${snapshot.lookback_days} days`;
  return `${date} · ${window}`;
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

/**
 * Cohort viewer for kill-time parses: every boss kill (or full clear) in one
 * bucket of a time-parse snapshot, scored against the rest.
 */
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
  const snapshotsQuery = useTimeParseSnapshots();
  const snapshots = useMemo(() => snapshotsQuery.data ?? [], [snapshotsQuery.data]);
  const defaultSnapshot = snapshots.find((s) => s.lookback_days === DEFAULT_LOOKBACK_DAYS) ?? snapshots[0];
  const snapshotId = params.get("snapshot") ?? defaultSnapshot?.id ?? "";
  const instanceName = params.get("instance") ?? "";
  const encounterName = isBoss ? (params.get("encounter") ?? "") : "";
  const highlight = params.get("highlight") ?? "";

  const bucketsQuery = useTimeParseCohortBuckets(snapshotId);
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
    snapshotId,
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Snapshot"
          value={snapshotId}
          options={snapshots.map((s) => ({ value: s.id, label: snapshotLabel(s) }))}
          onChange={(value) => updateParams({ snapshot: value })}
          placeholder={snapshots.length ? undefined : snapshotsQuery.isLoading ? "Loading…" : "No snapshots"}
          className="w-52"
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

      {snapshotsQuery.isError || bucketsQuery.isError ? (
        <CohortMessage>Couldn't load time-parse snapshots.</CohortMessage>
      ) : !snapshotsQuery.isLoading && snapshots.length === 0 ? (
        <CohortMessage>No time-parse snapshots have been published yet.</CohortMessage>
      ) : !instanceName ? (
        buckets.length > 0 ? (
          <ChoiceChips
            title="Choose an instance"
            choices={[...instanceTotals].map(([value, count]) => ({ value, label: value, count }))}
            onChoose={(value) => updateParams({ instance: value })}
          />
        ) : (
          <CohortMessage>{bucketsQuery.isLoading || snapshotsQuery.isLoading ? "Loading…" : "This snapshot has no runs."}</CohortMessage>
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
