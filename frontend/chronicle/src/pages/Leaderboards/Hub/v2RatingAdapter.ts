import type {
  LeaderboardConfiguration,
  LeaderboardV2Cohort,
  LeaderboardV2Entry,
  LeaderboardV2Response,
} from "@/api/typesGenerated";
import type {
  RatingEntry,
  RatingMetric,
  RatingScope,
} from "../Ratings/ratingBoards.fixtures";
import type { RatingLivePage } from "../Ratings/ratingLiveData";
import { hubJSON } from "./resolvedHubAdapter";

export interface V2RatingContext {
  configuration: LeaderboardConfiguration;
  cohorts: readonly LeaderboardV2Cohort[];
  instance: string;
  difficulty: string;
  size: number;
  subject: "player" | "guild";
  performance: "dps" | "hps";
  selected: readonly string[];
  realmIDs?: readonly string[];
}
export function v2RatingParams(
  context: V2RatingContext,
  scope: RatingScope,
  metric: RatingMetric,
  search = "",
) {
  const p = new URLSearchParams({
    instance: context.instance,
    difficulty: context.difficulty,
    max_players: String(context.size),
    subject: context.subject,
    kind: metric === "renown" ? "renown" : "boss",
    score: metric,
  });
  if ((context.realmIDs?.length ?? 0) > 1)
    throw new Error("Choose one realm or All realms.");
  if (context.realmIDs?.[0]) p.set("realm", context.realmIDs[0]);
  if (search.trim()) p.set("search", search.trim());
  if (metric === "renown" && context.subject === "player") {
    p.set("companion_metric", context.performance);
    if (scope.cls) p.set("companion_class", scope.cls);
    if (scope.spec) p.set("companion_spec", scope.spec);
    if (scope.subSpec !== undefined) p.set("companion_sub_spec", scope.subSpec);
  }
  const rows = context.configuration.rows.filter(
    (row) => row.instance_name === context.instance,
  );
  const selected = scope.boss ? [scope.boss] : context.selected;
  if (selected.length === 1) p.set("boss", selected[0]);
  else if (selected.length > 1) {
    for (const name of [...new Set(selected)].sort()) p.append("bosses", name);
  } else {
    const set = rows.find(
      (row) => row.kind === "set" && row.set_key === "default",
    );
    if (!set) throw new Error("No default encounter set is configured.");
    p.set("set", set.set_key);
  }
  if (context.subject === "player" && metric !== "renown") {
    p.set("metric", context.performance);
    if (scope.cls) p.set("class", scope.cls);
    if (scope.spec) p.set("spec", scope.spec);
    if (scope.subSpec !== undefined) p.set("sub_spec", scope.subSpec);
  }

  return p;
}
export function v2PlayerEntry(
  row: LeaderboardV2Entry,
  params: URLSearchParams,
  metric: RatingMetric,
): RatingEntry {
  return {
    id: JSON.stringify([
      row.realm_id,
      row.subject_id,
      row.player_class,
      row.player_spec,
      row.player_sub_spec,
    ]),
    name: row.name,
    guild: row.guild_name || undefined,
    logo: row.logo_url || undefined,
    realm: row.realm_id,
    realmLabel: row.realm_name?.trim() || "Unknown realm",
    guid: row.subject_id,
    // Renown rows have no cohort class; the character's class still colors the name and picks the icon.
    cls: row.player_class || row.subject_class || "",
    spec: row.player_spec,
    subSpec: row.player_sub_spec,
    score:
      metric === "peak"
        ? row.peak
        : metric === "mastery"
          ? row.mastery
          : row.renown,
    detail: row.realm_id,
    raw: row.bosses?.length === 1 ? row.bosses[0].raw_peak ?? undefined : undefined,
    rawMetric: params.get("metric") === "hps" ? "HPS" : "DPS",
    durationMs: row.bosses?.length === 1 ? row.bosses[0].duration_ms ?? undefined : undefined,
    publishedMastery: metric !== "renown" ? { peak: row.peak, form: row.form, floor: row.floor } : undefined,
    bossCounts: row.bosses?.map((boss) => ({ encounter_name: boss.encounter_name, count: boss.observation_count })),
  };
}
export function v2BoardURL(params: URLSearchParams) {
  return `/api/v1/leaderboards-v2?${params}`;
}

/** Translate existing Previous/Next page controls into request-bound cursor history.
 * Never invent a total or global rank, replay all observations, or request offsets.
 */
/** A one-boss row's peak kill, dated for the Peak board's Date column; undefined without a date. */
export function v2PeakRun(row: LeaderboardV2Entry): { ms: number; date: string; log?: string } | undefined {
  const boss = row.bosses?.length === 1 ? row.bosses[0] : undefined;
  if (!boss?.killed_at) return undefined;
  const date = new Date(boss.killed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return { ms: boss.duration_ms ?? 0, date, log: boss.peak_log || undefined };
}

export function createV2Pager(context: V2RatingContext) {
  const cursors = new Map<string, Map<number, string>>();
  return async ({
    scope,
    metric,
    query,
    page,
  }: {
    scope: RatingScope;
    metric: RatingMetric;
    query: string;
    page: number;
  }): Promise<RatingLivePage> => {
    const params = v2RatingParams(context, scope, metric, query);
    const key = params.toString();
    let history = cursors.get(key);
    if (!history) {
      history = new Map([[0, ""]]);
      cursors.set(key, history);
    }
    const cursor = history.get(page);
    if (cursor === undefined)
      throw new Error("Restart from the first page for this selection.");
    if (cursor) params.set("cursor", cursor);
    const response = await hubJSON<LeaderboardV2Response>(v2BoardURL(params));
    if (response.next_cursor) history.set(page + 1, response.next_cursor);
    else history.delete(page + 1);
    return {
      page,
      hasPreviousPage: page > 0,
      hasNextPage: !!response.next_cursor,
      rows: response.entries.map((row) => ({
        rank: 0,
        peakComponents: row.bosses?.map((boss) => ({ encounter_name: boss.encounter_name, score: boss.peak })),
        peakRun: v2PeakRun(row),
        entry: v2PlayerEntry(row, params, metric),
        scores:
          metric === "renown"
            ? {
                renown: v2PlayerEntry(row, params, "renown"),
                ...(row.peak_companion ? { peak: { ...v2PlayerEntry(row, params, "peak"), score: row.peak_companion.score, cohortLabel: [row.peak_companion.player_class, row.peak_companion.player_spec, row.peak_companion.player_sub_spec].filter(Boolean).join(" · ") } } : {}),
                ...(row.mastery_companion ? { mastery: { ...v2PlayerEntry(row, params, "mastery"), score: row.mastery_companion.score, cohortLabel: [row.mastery_companion.player_class, row.mastery_companion.player_spec, row.mastery_companion.player_sub_spec].filter(Boolean).join(" · ") } } : {}),
              }
            : {
                renown: v2PlayerEntry(row, params, "renown"),
                peak: v2PlayerEntry(row, params, "peak"),
                mastery: v2PlayerEntry(row, params, "mastery"),
              },
      })),
    };
  };
}
