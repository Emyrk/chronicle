import type {
  KillTimeLeaderboardEntry,
  RankingsBoxPlotStats,
  RankingsEntry,
  RankingsKillTimeStats,
  RankingsSuccessRate,
  SpeedrunLeaderboardEntry,
} from "@/api/typesGenerated";
import type {
  RatingMetric,
  RatingScope,
} from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures";
import type {
  HubGuildRatingEntry,
  HubPlayerRatingEntry,
  HubSummary,
} from "./hubSummaryAdapter";
import type { LiveBossSummary, OverviewData } from "./LeaderboardHub";
import type {
  Cohort,
  GuildRating,
  GuildRow,
  HubPlayer,
  HubRole,
  HubSubject,
  RatingLeader,
  SpecSpread,
  ThroughputRow,
} from "./hub.fixtures";

/** Published responses behind one Overview. Undefined means not fetched for this scope. */
export interface LiveOverviewSources {
  summary: HubSummary;
  /** Configured raid roster, in encounter order. */
  bosses: readonly string[];
  scope: RatingScope;
  role: HubRole;
  subject: HubSubject;
  /** Box plot per spec in the current role, then the other role (class view only). */
  stats?: readonly RankingsBoxPlotStats[];
  offRoleStats?: readonly RankingsBoxPlotStats[];
  successRates?: readonly RankingsSuccessRate[];
  killTimes?: readonly RankingsKillTimeStats[];
  /** Fastest kills of the chosen boss. */
  bossKills?: readonly KillTimeLeaderboardEntry[];
  /** Encounter totals ignore realm and class filters; only show them unfiltered. */
  unfiltered: boolean;
  pending?: boolean;
}

const RATING_KEYS: Record<RatingMetric, "peak" | "ranked_mastery" | "renown"> =
  { peak: "peak", mastery: "ranked_mastery", renown: "renown" };
const LEADERS = 5;

function player(
  entry: Pick<
    HubPlayerRatingEntry,
    | "player_guid"
    | "player_name"
    | "realm_name"
    | "player_class"
    | "player_spec"
    | "player_sub_spec"
  >,
  role: HubRole,
  guild = "",
): HubPlayer {
  return {
    id: entry.player_guid,
    name: entry.player_name || entry.player_guid,
    realm: entry.realm_name,
    guild,
    cls: entry.player_class,
    spec: entry.player_spec,
    subSpec: entry.player_sub_spec || undefined,
    role,
    skill: 0,
  };
}

function leaders(
  board: Record<
    "peak" | "ranked_mastery" | "renown",
    readonly HubPlayerRatingEntry[]
  >,
  role: HubRole,
): Record<RatingMetric, RatingLeader[]> {
  const pick = (m: RatingMetric) =>
    board[RATING_KEYS[m]]
      .slice(0, LEADERS)
      .map((e) => ({ player: player(e, role), score: e.score, raw: m === "peak" ? e.peak_raw : undefined }));
  return {
    peak: pick("peak"),
    mastery: pick("mastery"),
    renown: pick("renown"),
  };
}

function guildLeaders(
  board: Record<
    "peak" | "ranked_mastery" | "renown",
    readonly HubGuildRatingEntry[]
  >,
): Record<RatingMetric, GuildRating[]> {
  const pick = (m: RatingMetric) =>
    board[RATING_KEYS[m]]
      .slice(0, LEADERS)
      .map((e) => ({
        guild: e.guild_name || "Unknown guild",
        guildId: e.guild_id,
        score: e.score,
        detail: "",
      }));
  return {
    peak: pick("peak"),
    mastery: pick("mastery"),
    renown: pick("renown"),
  };
}

function throughput(entry: RankingsEntry, role: HubRole): ThroughputRow {
  return {
    player: player(
      {
        player_guid: entry.player_guid,
        player_name: entry.player_name,
        realm_name: entry.realm_name,
        player_class: entry.player_class,
        player_spec: entry.player_spec,
        player_sub_spec: entry.sub_spec ?? "",
      },
      role,
      entry.guild_name,
    ),
    value: Math.round(role === "healing" ? entry.hps : entry.dps),
  };
}

/** Box plot rows as spec spreads, best median first. */
export function specSpreadsFromStats(
  stats: readonly RankingsBoxPlotStats[],
): SpecSpread[] {
  // Unknown classes or specs are hidden, as on the Statistics box plot by default.
  return stats
    .filter((s) => s.player_class !== "Unknown" && s.player_spec !== "Unknown")
    .map((s) => ({
      cls: s.player_class,
      spec: s.player_spec,
      subSpec: s.player_sub_spec || undefined,
      min: Math.round(s.min_dps),
      q1: Math.round(s.q1_dps),
      median: Math.round(s.median_dps),
      q3: Math.round(s.q3_dps),
      max: Math.round(s.max_dps),
    }))
    .sort((a, b) => b.median - a.median);
}

function sameSpec(
  a: { spec: string; subSpec?: string },
  b: { spec: string; subSpec?: string },
) {
  return a.spec === b.spec && (a.subSpec ?? "") === (b.subSpec ?? "");
}

/** The class's specs in one role, ranked among every spec in it, with that spec's leaders when published. */
function cohortsInRole(
  stats: readonly RankingsBoxPlotStats[],
  scope: RatingScope,
  role: HubRole,
  peaks: readonly RatingLeader[],
  best: readonly ThroughputRow[],
): Cohort[] {
  const all = specSpreadsFromStats(stats);
  return all.flatMap((s, i): Cohort[] => {
    if (s.cls !== scope.cls || (scope.spec && s.spec !== scope.spec)) return [];
    const row = stats.find(
      (x) =>
        x.player_class === s.cls &&
        sameSpec(
          { spec: x.player_spec, subSpec: x.player_sub_spec || undefined },
          s,
        ),
    );
    return [
      {
        cls: s.cls,
        spec: s.spec,
        subSpec: s.subSpec,
        median: s.median,
        rank: i + 1,
        of: all.length,
        role,
        characters: row?.count ?? 0,
        charactersLabel: "ranked parses",
        peak: peaks.find(
          (p) => p.player.cls === s.cls && sameSpec(p.player, s),
        ),
        best: best.find((p) => p.player.cls === s.cls && sameSpec(p.player, s)),
      },
    ];
  });
}

function bossSummaries(src: LiveOverviewSources): LiveBossSummary[] {
  const { summary, role, unfiltered } = src;
  return src.bosses.map((boss) => {
    const board = summary.ratings.bosses.find(
      (b) => b.encounter_name === boss,
    )?.player;
    const top = (m: RatingMetric) => {
      const e = board?.[RATING_KEYS[m]][0];
      return e ? { player: player(e, role), score: e.score, raw: m === "peak" ? e.peak_raw : undefined } : undefined;
    };
    const rate = src.successRates?.find((r) => r.encounter_name === boss);
    const time = src.killTimes?.find((r) => r.encounter_name === boss);
    const encounter = summary.encounters.find((r) => r.encounter_name === boss);
    return {
      boss,
      kills: rate?.kills ?? (unfiltered ? encounter?.total_kills : undefined),
      attempts: rate?.total,
      medianKillMs: time ? Math.round(time.median_secs * 1000) : undefined,
      ratings: {
        peak: top("peak"),
        mastery: top("mastery"),
        renown: top("renown"),
      },
      topDps:
        unfiltered && role === "dps"
          ? encounter?.top_dps || undefined
          : undefined,
    };
  });
}

function killsAsRuns(
  kills: readonly KillTimeLeaderboardEntry[],
): SpeedrunLeaderboardEntry[] {
  return kills.map((k) => ({
    instance_id: k.instance_id,
    slug: k.log_hashed_slug,
    difficulty_name: "",
    duration_ms: Math.round(k.duration_secs * 1000),
    guild_id: k.guild_id ?? "",
    guild_name: k.guild_name,
    realm_name: k.realm_name,
    start_time: k.killed_at,
    completion_time: k.killed_at,
    player_count: 0,
    parser_version: "",
    addon_version: "",
  }));
}

/** Maps the published boards onto the Overview's slots. Slots without a published source stay empty. */
export function liveOverviewData(src: LiveOverviewSources): OverviewData {
  const { summary, scope, role, subject } = src;
  const board = scope.boss
    ? summary.ratings.bosses.find((b) => b.encounter_name === scope.boss)
    : summary.ratings.raid;
  const ratings = board ? leaders(board.player, role) : undefined;
  const performances = summary.performances.map((e) => throughput(e, role));
  const offRole: HubRole = role === "dps" ? "healing" : "dps";
  const bosses = bossSummaries(src);
  const bossKills = src.bossKills ? killsAsRuns(src.bossKills) : undefined;
  return {
    speedruns: scope.boss ? bossKills : summary.speedruns,
    speedrunsAreClears: !scope.boss,
    ratings,
    guildRatings:
      board && subject === "guilds" ? guildLeaders(board.guild) : undefined,
    guildRenown: board?.guild.renown
      .slice(0, LEADERS)
      .map(
        (e): GuildRow => ({
          guild: e.guild_name || "Unknown guild",
          guildId: e.guild_id,
          value: Math.round(e.score),
          detail: "",
        }),
      ),
    performances,
    specSpreads: src.stats ? specSpreadsFromStats(src.stats) : undefined,
    cohorts: scope.cls
      ? [
          ...(src.stats
            ? cohortsInRole(
                src.stats,
                scope,
                role,
                ratings?.peak ?? [],
                performances,
              )
            : []),
          ...(src.offRoleStats
            ? cohortsInRole(src.offRoleStats, scope, offRole, [], [])
            : []),
        ]
      : undefined,
    boss: scope.boss
      ? {
          ...(bosses.find((b) => b.boss === scope.boss) ?? {
            boss: scope.boss,
          }),
          best: bossKills?.[0] && {
            guild: bossKills[0].guild_name,
            ms: bossKills[0].duration_ms,
          },
        }
      : undefined,
    bosses,
    pending: src.pending,
  };
}
