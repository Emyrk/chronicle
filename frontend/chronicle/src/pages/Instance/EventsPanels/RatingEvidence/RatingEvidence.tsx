import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, Loader2 } from "lucide-react";
import type {
  InstanceRatingEvidenceResponse,
  InstanceRatingGuildBossObservation,
  InstanceRatingGuildClearObservation,
  InstanceRatingGuildRenownFact,
  InstanceRatingPlayerObservation,
  InstanceRatingPlayerRenownFact,
} from "@/api/typesGenerated";
import { instanceEntityAttributes } from "@/components/ui/PlayerMetricChart/instanceEntity";
import { cn } from "@/lib/utils";
import type { ProcessorEvent } from "../processorTypes";
import type { PanelContext, PanelDefinition, PanelRenderProps } from "../types";
import { shouldLoadPublicRankingData } from "../panelAvailability";
import { ratingEvidenceProcessor, type RatingEvidenceResult } from "./ratingEvidence.processor";
import {
  countRatingEvidence,
  formatDifficultyCohort,
  formatDurationMs,
  formatMetricName,
  formatMetricValue,
  formatPlayerCohort,
} from "./ratingEvidenceModel";

type EvidenceTab = "players" | "guild";

// eslint-disable-next-line react-refresh/only-export-components
export function createRatingEvidencePanel(): PanelDefinition<RatingEvidenceResult, ProcessorEvent> {
  return {
    ...ratingEvidenceProcessor,
    label: "Rating Evidence",
    icon: <ClipboardList className="h-4 w-4" />,
    keybinds: [],
    supportsPerSecond: false,
    selfManagesAggregation: true,
    syncDataMode: "full",
    render: (props: PanelRenderProps<RatingEvidenceResult>) => <RatingEvidenceContent {...props} />,
  };
}

export function RatingEvidenceContent({ context }: PanelRenderProps<RatingEvidenceResult>) {
  const instanceID = context.instance.id;
  const unlisted = context.instance.unlisted;
  const [tab, setTab] = useState<EvidenceTab>("players");
  const query = useQuery({
    queryKey: ["instance-rating-evidence", instanceID],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/rankings/instances/${encodeURIComponent(instanceID)}/rating-evidence`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch rating evidence (${response.status})`);
      }
      return response.json() as Promise<InstanceRatingEvidenceResponse>;
    },
    staleTime: Infinity,
    retry: false,
    enabled: shouldLoadPublicRankingData(unlisted),
  });

  const counts = useMemo(
    () => query.data ? countRatingEvidence(query.data) : null,
    [query.data],
  );

  if (unlisted) {
    return <PanelState>No rating evidence is available for unlisted instances.</PanelState>;
  }
  if (query.isLoading) {
    return (
      <PanelState icon={<Loader2 className="h-4 w-4 animate-spin" />}>
        Loading persisted rating evidence…
      </PanelState>
    );
  }
  if (query.error) {
    return (
      <PanelState icon={<AlertTriangle className="h-4 w-4" />} tone="error">
        {query.error.message}
      </PanelState>
    );
  }
  if (!query.data) {
    return <PanelState>Rating evidence could not be loaded.</PanelState>;
  }
  if (!query.data.available) {
    return <UnavailableState reason={query.data.reason} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-xs">
      <div className="rounded border border-border bg-muted/20 px-2 py-1.5 text-muted-foreground">
        These are persisted V2 rating inputs. They are not parse scores or final normalized ratings.
      </div>
      <div role="tablist" aria-label="Rating evidence subject" className="flex shrink-0 gap-1">
        <EvidenceTabButton
          active={tab === "players"}
          count={counts?.player ?? 0}
          label="Players"
          onClick={() => setTab("players")}
        />
        <EvidenceTabButton
          active={tab === "guild"}
          count={counts?.guild ?? 0}
          label="Guild"
          onClick={() => setTab("guild")}
        />
      </div>
      <div className="styled-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {tab === "players"
          ? <PlayerEvidence context={context} evidence={query.data} />
          : <GuildEvidence context={context} evidence={query.data} />}
      </div>
    </div>
  );
}

function EvidenceTabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs",
        active
          ? "border-primary-darker bg-primary-darker text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span className="rounded-full bg-background/50 px-1.5 py-px text-[10px] tabular-nums">{count}</span>
    </button>
  );
}

function PlayerEvidence({
  context,
  evidence,
}: {
  context: PanelContext;
  evidence: InstanceRatingEvidenceResponse;
}) {
  const { observations, renown } = evidence.player;
  if (observations.length === 0 && renown.length === 0) {
    return <EmptyTab>No persisted player evidence was recorded for this run.</EmptyTab>;
  }

  return (
    <div className="space-y-3 pb-2">
      <p className="text-muted-foreground">
        One positive DPS or HPS metric per player and fight feeds Peak and Mastery history. Each kill credit feeds Renown.
      </p>
      <EvidenceSection
        count={observations.length}
        empty="No positive DPS or HPS observations were persisted."
        title="Performance observations"
      >
        {observations.length > 0 && <PlayerObservationTable context={context} rows={observations} />}
      </EvidenceSection>
      <EvidenceSection
        count={renown.length}
        empty="No player Renown kill credits were persisted."
        title="Renown credits"
      >
        {renown.length > 0 && <PlayerRenownTable context={context} rows={renown} />}
      </EvidenceSection>
    </div>
  );
}

function PlayerObservationTable({ context, rows }: { context: PanelContext; rows: readonly InstanceRatingPlayerObservation[] }) {
  return (
    <EvidenceTable minWidth="min-w-[720px]" headers={["Encounter", "Player", "Cohort", "Metric", "Value"]}>
      {rows.map((row, index) => (
        <tr key={`${row.source_ranking_id}-${index}`} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
          <td className="whitespace-nowrap px-2 py-1.5 font-medium">{row.encounter_name}<span className="ml-2 text-muted-foreground">{formatDifficultyCohort(row)}</span></td>
          <td className="px-2 py-1.5">
            <PlayerName context={context} guid={row.player_guid} fallback={row.player_name} />
          </td>
          <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{formatPlayerCohort(row) || "—"}</td>
          <td className="whitespace-nowrap px-2 py-1.5 font-medium">{formatMetricName(row.metric)}</td>
          <td className="px-2 py-1.5 text-right tabular-nums">{formatMetricValue(row.metric_value)}</td>
        </tr>
      ))}
    </EvidenceTable>
  );
}

function PlayerRenownTable({ context, rows }: { context: PanelContext; rows: readonly InstanceRatingPlayerRenownFact[] }) {
  return (
    <EvidenceTable minWidth="min-w-[480px]" headers={["Encounter", "Player", "Credit"]}>
      {rows.map((row, index) => (
        <tr key={`${row.source_encounter_id}-${row.player_guid}-${index}`} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
          <td className="whitespace-nowrap px-2 py-1.5 font-medium">{row.encounter_name}<span className="ml-2 text-muted-foreground">{formatDifficultyCohort(row)}</span></td>
          <td className="px-2 py-1.5"><PlayerName context={context} guid={row.player_guid} fallback={row.player_name} /></td>
          <td className="px-2 py-1.5 text-right text-muted-foreground">1 kill</td>
        </tr>
      ))}
    </EvidenceTable>
  );
}

function GuildEvidence({
  context,
  evidence,
}: {
  context: PanelContext;
  evidence: InstanceRatingEvidenceResponse;
}) {
  const { boss_times: bossTimes, clear_times: clearTimes, renown } = evidence.guild;
  if (bossTimes.length === 0 && clearTimes.length === 0 && renown.length === 0) {
    return <EmptyTab>No persisted guild evidence was recorded for this run.</EmptyTab>;
  }

  return (
    <div className="space-y-3 pb-2">
      <p className="text-muted-foreground">
        Persisted clear and boss times feed guild Peak and Mastery history. Each boss kill credit feeds guild Renown.
      </p>
      <EvidenceSection count={clearTimes.length} empty="No clear-time evidence was persisted." title="Clear-time evidence">
        {clearTimes.length > 0 && <GuildClearTable context={context} rows={clearTimes} />}
      </EvidenceSection>
      <EvidenceSection count={bossTimes.length} empty="No boss-time evidence was persisted." title="Boss-time evidence">
        {bossTimes.length > 0 && <GuildBossTable context={context} rows={bossTimes} />}
      </EvidenceSection>
      <EvidenceSection count={renown.length} empty="No guild Renown kill credits were persisted." title="Renown credits">
        {renown.length > 0 && <GuildRenownTable context={context} rows={renown} />}
      </EvidenceSection>
    </div>
  );
}

function GuildClearTable({ context, rows }: { context: PanelContext; rows: readonly InstanceRatingGuildClearObservation[] }) {
  return (
    <EvidenceTable minWidth="min-w-[420px]" headers={["Guild", "Difficulty", "Clear time"]}>
      {rows.map((row, index) => (
        <tr key={`${row.source_time_parse_score_id}-${index}`} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
          <td className="px-2 py-1.5 font-medium">{guildName(context, row.guild_name)}</td>
          <td className="px-2 py-1.5 text-muted-foreground">{formatDifficultyCohort(row)}</td>
          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatDurationMs(row.duration_ms)}</td>
        </tr>
      ))}
    </EvidenceTable>
  );
}

function GuildBossTable({ context, rows }: { context: PanelContext; rows: readonly InstanceRatingGuildBossObservation[] }) {
  return (
    <EvidenceTable minWidth="min-w-[560px]" headers={["Encounter", "Guild", "Boss time"]}>
      {rows.map((row, index) => (
        <tr key={`${row.source_time_parse_score_id}-${index}`} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
          <td className="whitespace-nowrap px-2 py-1.5 font-medium">{row.encounter_name}<span className="ml-2 text-muted-foreground">{formatDifficultyCohort(row)}</span></td>
          <td className="px-2 py-1.5">{guildName(context, row.guild_name)}</td>
          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatDurationMs(row.duration_ms)}</td>
        </tr>
      ))}
    </EvidenceTable>
  );
}

function GuildRenownTable({ context, rows }: { context: PanelContext; rows: readonly InstanceRatingGuildRenownFact[] }) {
  return (
    <EvidenceTable minWidth="min-w-[480px]" headers={["Encounter", "Guild", "Credit"]}>
      {rows.map((row, index) => (
        <tr key={`${row.source_encounter_id}-${row.guild_id}-${index}`} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
          <td className="whitespace-nowrap px-2 py-1.5 font-medium">{row.encounter_name}<span className="ml-2 text-muted-foreground">{formatDifficultyCohort(row)}</span></td>
          <td className="px-2 py-1.5">{guildName(context, row.guild_name)}</td>
          <td className="px-2 py-1.5 text-right text-muted-foreground">1 kill</td>
        </tr>
      ))}
    </EvidenceTable>
  );
}

function PlayerName({ context, guid, fallback }: { context: PanelContext; guid: string; fallback?: string }) {
  const player = context.instance.players?.[guid];
  return (
    <div {...instanceEntityAttributes(context.instance, guid)}>
      <div className="font-medium">{player?.name ?? fallback ?? "Unknown player"}</div>
      {(player?.class || !fallback) && (
        <div className="text-[10px] text-muted-foreground">{player?.class ?? "Unknown class"}</div>
      )}
    </div>
  );
}

function guildName(context: PanelContext, fallback?: string): string {
  return context.instance.guild?.name ?? fallback ?? "Unknown guild";
}

function EvidenceSection({
  children,
  count,
  empty,
  title,
}: {
  children: React.ReactNode;
  count: number;
  empty: string;
  title: string;
}) {
  return (
    <section className="space-y-1">
      <div className="flex items-center gap-1.5 font-medium">
        <h3>{title}</h3>
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground tabular-nums">{count}</span>
      </div>
      {count === 0
        ? <div className="rounded border border-dashed border-border px-2 py-3 text-center text-muted-foreground">{empty}</div>
        : children}
    </section>
  );
}

function EvidenceTable({
  children,
  headers,
  minWidth,
}: {
  children: React.ReactNode;
  headers: readonly string[];
  minWidth: string;
}) {
  return (
    <div className="styled-scrollbar overflow-x-auto rounded border border-border">
      <table className={cn("w-full border-collapse text-left", minWidth)}>
        <thead className="bg-card text-muted-foreground">
          <tr className="border-b border-border">
            {headers.map((header, index) => (
              <th key={header} className={cn("px-2 py-1.5 font-medium", index === headers.length - 1 && "text-right")}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function PanelState({
  children,
  icon,
  tone = "muted",
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div className={cn(
      "flex items-center justify-center gap-2 py-6 text-center text-sm",
      tone === "error" ? "text-red-400" : "text-muted-foreground",
    )}>
      {icon}
      {children}
    </div>
  );
}

function UnavailableState({ reason }: { reason?: string }) {
  const message = reason === "invalid"
    ? "This raid is invalid, so no V2 rating evidence is published."
    : reason === "not_projected"
      ? "This raid has not been projected into the persisted V2 rating evidence tables yet."
      : reason === "no_evidence"
        ? "This projected raid has no persisted V2 rating inputs."
        : "No persisted V2 rating evidence is available for this raid.";
  return <PanelState>{message}</PanelState>;
}

function EmptyTab({ children }: { children: React.ReactNode }) {
  return <div className="rounded border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{children}</div>;
}
