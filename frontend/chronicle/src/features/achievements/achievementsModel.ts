import type {
  Achievement,
  AchievementCategory,
  AchievementCompletionRate,
  AchievementProgress,
  AchievementSeries,
  AchievementsResponse,
} from "@/api/typesGenerated";

/** Feats of Strength are listed in their own pseudo-category after they are earned. */
export const FEATS_CATEGORY_ID = "feats-of-strength";

export type AchievementState = "earned" | "in_progress" | "not_started" | "locked";

export interface SetMember {
  id: string;
  name: string;
  earned: boolean;
}

/** One achievement joined with the viewer's progress, ready to render. */
export interface AchievementView {
  achievement: Achievement;
  progress?: AchievementProgress;
  state: AchievementState;
  /** Hidden and not earned: name and criteria are withheld. */
  concealed: boolean;
  /** Set achievements only. */
  setMembers?: SetMember[];
}

export interface SeriesView {
  series: AchievementSeries;
  tiers: AchievementView[];
  earnedCount: number;
  earnedPoints: number;
  totalPoints: number;
}

export type CategoryEntry =
  | { kind: "achievement"; view: AchievementView }
  | { kind: "series"; view: SeriesView };

export interface CategoryView {
  category: AchievementCategory;
  entries: CategoryEntry[];
  earnedCount: number;
  totalCount: number;
  earnedPoints: number;
  totalPoints: number;
}

export interface AchievementsModel {
  signedIn: boolean;
  categories: CategoryView[];
  earnedPoints: number;
  totalPoints: number;
  earnedCount: number;
  totalCount: number;
  /** Most recently earned first. */
  recent: AchievementView[];
  byId: Map<string, AchievementView>;
}

function stateFor(achievement: Achievement, progress: AchievementProgress | undefined, setMembers?: SetMember[]): AchievementState {
  if (progress?.earned_at) return "earned";
  if (achievement.requirements.some((requirement) => !requirement.met)) return "locked";
  if (progress && progress.current > 0) return "in_progress";
  if (setMembers?.some((member) => member.earned)) return "in_progress";
  return "not_started";
}

/** Joins the catalog with the viewer's progress and groups it for the browser. */
export function buildAchievementsModel(response: AchievementsResponse): AchievementsModel {
  const progressById = new Map((response.viewer?.progress ?? []).map((progress) => [progress.achievement_id, progress]));
  const nameById = new Map(response.achievements.map((achievement) => [achievement.id, achievement.name]));

  const byId = new Map<string, AchievementView>();
  for (const achievement of response.achievements) {
    const progress = progressById.get(achievement.id);
    const setMembers = achievement.required_achievement_ids?.map((id) => ({
      id,
      name: nameById.get(id) ?? id,
      earned: !!progressById.get(id)?.earned_at,
    }));
    const state = stateFor(achievement, progress, setMembers);
    byId.set(achievement.id, {
      achievement,
      progress,
      state,
      concealed: achievement.visibility === "hidden" && state !== "earned",
      setMembers,
    });
  }

  const listed = [...byId.values()].filter(
    (view) => view.achievement.visibility !== "feat_of_strength" || view.state === "earned",
  );

  const categories: CategoryView[] = [];
  const featCategory: AchievementCategory = {
    id: FEATS_CATEGORY_ID,
    name: "Feats of Strength",
    description: "Rare, retired, and time-limited moments. They award no points.",
    icon: "star",
  };
  for (const category of [...response.categories, featCategory]) {
    const inCategory = listed.filter((view) =>
      category.id === FEATS_CATEGORY_ID
        ? view.achievement.visibility === "feat_of_strength"
        : view.achievement.category_id === category.id && view.achievement.visibility !== "feat_of_strength",
    );
    if (inCategory.length === 0) continue;

    const entries: CategoryEntry[] = [];
    const seenSeries = new Set<string>();
    for (const view of inCategory) {
      const seriesID = view.achievement.series_id;
      if (!seriesID) {
        entries.push({ kind: "achievement", view });
        continue;
      }
      if (seenSeries.has(seriesID)) continue;
      seenSeries.add(seriesID);
      const series = response.series.find((candidate) => candidate.id === seriesID);
      const tiers = inCategory
        .filter((candidate) => candidate.achievement.series_id === seriesID)
        .sort((a, b) => a.achievement.tier - b.achievement.tier);
      if (!series) {
        entries.push(...tiers.map((tier): CategoryEntry => ({ kind: "achievement", view: tier })));
        continue;
      }
      entries.push({
        kind: "series",
        view: {
          series,
          tiers,
          earnedCount: tiers.filter((tier) => tier.state === "earned").length,
          earnedPoints: sumPoints(tiers.filter((tier) => tier.state === "earned")),
          totalPoints: sumPoints(tiers),
        },
      });
    }

    const earned = inCategory.filter((view) => view.state === "earned");
    categories.push({
      category,
      entries,
      earnedCount: earned.length,
      totalCount: inCategory.length,
      earnedPoints: sumPoints(earned),
      totalPoints: sumPoints(inCategory),
    });
  }

  const core = listed.filter((view) => view.achievement.visibility !== "feat_of_strength");
  const earnedCore = core.filter((view) => view.state === "earned");
  const recent = listed
    .filter((view) => view.state === "earned")
    .sort((a, b) => Date.parse(b.progress!.earned_at!) - Date.parse(a.progress!.earned_at!));

  return {
    signedIn: !!response.viewer,
    categories,
    earnedPoints: response.viewer?.earned_points ?? 0,
    totalPoints: response.total_points,
    earnedCount: earnedCore.length,
    totalCount: core.length,
    recent,
    byId,
  };
}

function sumPoints(views: readonly AchievementView[]) {
  return views.reduce((total, view) => total + view.achievement.points, 0);
}

export type AchievementFilter = "all" | "earned" | "incomplete" | "rewards";

function matchesView(view: AchievementView, filter: AchievementFilter, search: string) {
  if (filter === "earned" && view.state !== "earned") return false;
  if (filter === "incomplete" && view.state === "earned") return false;
  if (filter === "rewards" && view.achievement.rewards.length === 0) return false;
  if (!search) return true;
  if (view.concealed) return false;
  const haystack = `${view.achievement.name} ${view.achievement.description}`.toLowerCase();
  return haystack.includes(search.toLowerCase());
}

/** Filters a category's entries. A series stays when any tier matches, showing only matching tiers. */
export function filterEntries(entries: readonly CategoryEntry[], filter: AchievementFilter, search: string): CategoryEntry[] {
  const query = search.trim();
  const result: CategoryEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "achievement") {
      if (matchesView(entry.view, filter, query)) result.push(entry);
      continue;
    }
    const tiers = entry.view.tiers.filter((tier) => matchesView(tier, filter, query));
    if (tiers.length === 0) continue;
    result.push(filter === "all" && !query ? entry : { kind: "series", view: { ...entry.view, tiers } });
  }
  return result;
}

/** Spec display rules: one decimal from 0.1% to 99.9%, "Less than 0.1%" below that, exact 0% and 100%. */
export function formatCompletionRate(rate: AchievementCompletionRate): string {
  const { earned_account_count: earned, eligible_account_count: eligible } = rate;
  if (eligible <= 0 || earned <= 0) return "0%";
  if (earned >= eligible) return "100%";
  const percent = (earned / eligible) * 100;
  if (percent < 0.1) return "Less than 0.1%";
  return `${Math.min(99.9, Math.max(0.1, Math.round(percent * 10) / 10)).toFixed(1)}%`;
}

export function completionRateLabel(rate: AchievementCompletionRate): string {
  return `${formatCompletionRate(rate)} of users have this achievement`;
}

export function completionPercent(rate: AchievementCompletionRate): number {
  if (rate.eligible_account_count <= 0) return 0;
  return (rate.earned_account_count / rate.eligible_account_count) * 100;
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export function tierNumeral(tier: number): string {
  return ROMAN[tier] ?? String(tier);
}

/** Splits a keybind like "Shift+E" or "Alt+Click" into platform-aware keys. */
export function keybindKeys(keybind: string, isMac: boolean): string[] {
  return keybind.split("+").map((key) => {
    const trimmed = key.trim();
    if (!isMac) return trimmed;
    if (trimmed === "Alt") return "Option";
    if (trimmed === "Ctrl") return "Cmd";
    return trimmed;
  });
}

export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

export function formatEarnedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
