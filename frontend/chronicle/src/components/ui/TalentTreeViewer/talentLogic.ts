// Pure talent tree logic and types, ported from chronicle-wiki.
// No React imports — safe for use in tests, workers, and components.

// ─── Types ────────────────────────────────────────────────────────

export interface TalentEntry {
  id: number;
  name: string;
  tierID: number;
  columnIndex: number;
  maxRank: number;
  tabIndex: number;
  spellRanks: number[];
  iconTexture: string;
  prereqTalent?: number[];
  prereqRank?: number[];
  description?: string;
  effect?: string;
  effects?: string[] | string;
  rankDescriptions?: string[];
  rankDescription?: string[];
}

export interface TalentTabData {
  id: number;
  name: string;
  backgroundFile: string;
  orderIndex: number;
  iconTexture: string;
  talents: TalentEntry[];
}

export interface ClassTalentData {
  id: number;
  name: string;
  tabs: TalentTabData[];
}

export interface TalentTreeJSON {
  classes: Record<string, ClassTalentData>;
  /** Resolved dataset for this data (tenant-aware). */
  dataset_id?: string;
  /** Icon CDN base for the resolved dataset. */
  icon_base_url?: string;
}

export type TalentRanks = Record<number, number>;

export type TalentPrereqArrow = {
  from: TalentEntry;
  to: TalentEntry;
  requiredRank: number;
};

export type TalentTooltipPosition = {
  left: number;
  top: number;
};

export type TalentRankDescriptionPart =
  | { type: "text"; text: string }
  | { type: "ladder"; values: string[]; activeIndex: number };

export type TalentVisualState = "locked" | "available" | "selected" | "maxed";

// ─── Constants ────────────────────────────────────────────────────

export const TALENT_BUTTON_SIZE = 44;
export const TALENT_GRID_COLUMNS = 4;
export const TALENT_CELL_WIDTH = 52;
export const TALENT_CELL_HEIGHT = 58;
export const TALENT_GRID_GAP = 16;
export const TALENT_ROW_STRIDE = TALENT_CELL_HEIGHT + TALENT_GRID_GAP;
export const TALENT_BUILD_PARAM = "build";
export const TALENT_LOCK_PARAM = "lock";
export const TALENT_ARROW_SOURCE_CLEARANCE = 0;
export const TALENT_ARROW_TARGET_CLEARANCE = 0;
export const TALENT_ARROW_ELBOW_CLEARANCE = 14;

export const TALENT_GRID_WIDTH = TALENT_GRID_COLUMNS * (TALENT_CELL_WIDTH + TALENT_GRID_GAP);
export const TALENT_TOOLTIP_WIDTH = 288;
export const TALENT_TOOLTIP_MARGIN = 16;
export const TALENT_TOOLTIP_GAP = 8;
export const TALENT_TOOLTIP_ESTIMATED_HEIGHT = 224;
export const TALENT_TOOLTIP_CLASS_NAME = "pointer-events-none fixed z-[100] w-[min(18rem,calc(100vw-2rem))] max-h-[min(24rem,calc(100vh-2rem))] overflow-y-auto rounded-lg border border-amber-400/25 bg-zinc-950 p-3 text-left text-xs text-zinc-200 shadow-2xl shadow-black/60";
export const TALENT_TOOLTIP_SSR_CLASS_NAME = `${TALENT_TOOLTIP_CLASS_NAME} hidden group-hover:block group-focus-visible:block`;

// ─── Grid helpers ─────────────────────────────────────────────────

export function talentGridRows(talents: TalentEntry[]) {
  return Math.max(...talents.map((talent) => talent.tierID), 0) + 1;
}

export function talentGridHeight(rows: number) {
  return rows * TALENT_ROW_STRIDE;
}

// ─── Prerequisite arrows ──────────────────────────────────────────

export function prerequisiteArrows(talents: TalentEntry[]): TalentPrereqArrow[] {
  const byId = new Map(talents.map((talent) => [talent.id, talent]));
  return talents.flatMap((talent) =>
    (talent.prereqTalent ?? []).flatMap((prereqId) => {
      const from = byId.get(prereqId);
      if (!from) return [];
      return [{ from, to: talent, requiredRank: from.maxRank }];
    }),
  );
}

// ─── Talent point requirements ────────────────────────────────────

export function rowPointRequirement(talent: Pick<TalentEntry, "tierID">) {
  return talent.tierID * 5;
}

function pointsSpentBeforeRow(talents: TalentEntry[], ranks: TalentRanks, tierID: number) {
  return talents.reduce((sum, talent) => {
    if (talent.tierID >= tierID) return sum;
    return sum + (ranks[talent.id] ?? 0);
  }, 0);
}

function prerequisitesMet(talent: TalentEntry, talents: TalentEntry[], ranks: TalentRanks) {
  const byId = new Map(talents.map((candidate) => [candidate.id, candidate]));
  return (talent.prereqTalent ?? []).every((prereqId) => {
    const prereq = byId.get(prereqId);
    if (!prereq) return true;
    return (ranks[prereq.id] ?? 0) >= prereq.maxRank;
  });
}

export function canUseTalent(talent: TalentEntry, talents: TalentEntry[], ranks: TalentRanks) {
  return pointsSpentBeforeRow(talents, ranks, talent.tierID) >= rowPointRequirement(talent) && prerequisitesMet(talent, talents, ranks);
}

function spentTalentsStillValid(talents: TalentEntry[], ranks: TalentRanks) {
  return talents.every((talent) => (ranks[talent.id] ?? 0) === 0 || canUseTalent(talent, talents, ranks));
}

export function totalTalentPoints(ranks: TalentRanks) {
  return Object.values(ranks).reduce((sum, rank) => sum + rank, 0);
}

// ─── Level calculation ────────────────────────────────────────────

export function calculateRequiredPlayerLevel(spentPoints: number, flavor: { maxLevel: number; maxTalentPoints: number }) {
  const cappedPoints = Math.max(0, Math.min(flavor.maxTalentPoints, spentPoints));
  if (cappedPoints === 0) return 1;
  const firstTalentLevel = flavor.maxLevel - flavor.maxTalentPoints + 1;
  return Math.min(flavor.maxLevel, firstTalentLevel + cappedPoints - 1);
}

// ─── Rank updates ─────────────────────────────────────────────────

function cleanRanks(ranks: TalentRanks): TalentRanks {
  return Object.fromEntries(Object.entries(ranks).filter(([, rank]) => rank > 0).map(([id, rank]) => [Number(id), rank]));
}

export function updateTalentRank(
  talent: TalentEntry,
  requestedRank: number,
  talents: TalentEntry[],
  ranks: TalentRanks,
  options: { maxPoints?: number } = {},
): TalentRanks {
  const currentRank = ranks[talent.id] ?? 0;
  let nextRank = Math.max(0, Math.min(talent.maxRank, requestedRank));
  // Clamp increases to the remaining point budget so a "dump points" request
  // (e.g. ctrl-click asking for maxRank) spends as many points as possible.
  if (nextRank > currentRank && options.maxPoints !== undefined) {
    const remaining = Math.max(0, options.maxPoints - totalTalentPoints(ranks));
    nextRank = Math.min(nextRank, currentRank + remaining);
  }
  if (nextRank === currentRank) return ranks;
  if (nextRank > currentRank && !canUseTalent(talent, talents, ranks)) return ranks;

  const nextRanks = { ...ranks, [talent.id]: nextRank };
  if (nextRank < currentRank && !spentTalentsStillValid(talents, nextRanks)) return ranks;
  return nextRanks;
}

// ─── Build encoding / decoding ────────────────────────────────────

// ─── Build encoding ───────────────────────────────────────────────
// WoWHead-style positional format: one digit per talent in tab order,
// tabs separated by dashes, trailing zeros trimmed.
// Example: "35003-05032-00000" → tab0 talents at ranks 3,5,0,0,3 etc.

export function encodeTalentBuild(ranks: TalentRanks, tabs: TalentEntry[][]) {
  const sections = tabs.map((talents) => {
    const digits = talents.map((t) => String(Math.min(ranks[t.id] ?? 0, 9)));
    // Trim trailing zeros from each tab section
    let last = digits.length;
    while (last > 0 && digits[last - 1] === "0") last--;
    return digits.slice(0, last).join("");
  });
  // Trim trailing empty tab sections
  let lastTab = sections.length;
  while (lastTab > 0 && sections[lastTab - 1] === "") lastTab--;
  if (lastTab === 0) return "";
  return sections.slice(0, lastTab).join("-");
}

export function decodeTalentBuild(value: string | null | undefined, tabs?: TalentEntry[][]): TalentRanks {
  if (!value) return {};

  // Legacy formats: "k.2_u.1" (base36 id.rank) or "20:2,30:1" (decimal id:rank)
  const isLegacy = value.includes(".") || value.includes(":") || value.includes(",");
  if (isLegacy) return decodeLegacyBuild(value);

  // Positional format: "35003-05032-00000"
  if (!tabs) return {};
  const ranks: TalentRanks = {};
  const sections = value.split("-");
  for (let tabIdx = 0; tabIdx < Math.min(sections.length, tabs.length); tabIdx++) {
    const digits = sections[tabIdx];
    const talents = tabs[tabIdx];
    for (let i = 0; i < Math.min(digits.length, talents.length); i++) {
      const rank = parseInt(digits[i], 10);
      if (rank > 0) ranks[talents[i].id] = rank;
    }
  }
  return ranks;
}

function decodeLegacyBuild(value: string): TalentRanks {
  const ranks: TalentRanks = {};
  const isColon = value.includes(":") || value.includes(",");
  const entries = isColon
    ? value.split(",").map((part) => part.split(":"))
    : value.split("_").map((part) => part.split("."));
  for (const [idText, rankText] of entries) {
    const radix = isColon ? 10 : 36;
    const id = decodeBuildNumber(idText ?? "", radix);
    const rank = decodeBuildNumber(rankText ?? "", radix);
    if (Number.isInteger(id) && Number.isInteger(rank) && id > 0 && rank > 0) ranks[id] = rank;
  }
  return ranks;
}

function decodeBuildNumber(value: string, radix: number) {
  if (!/^[0-9a-z]+$/i.test(value)) return Number.NaN;
  const number = Number.parseInt(value, radix);
  return Number.isFinite(number) ? number : Number.NaN;
}

// ─── Normalization and reset ──────────────────────────────────────

export function normalizeTalentRanks(tabs: TalentEntry[][], rawRanks: TalentRanks, maxPoints = Number.POSITIVE_INFINITY): TalentRanks {
  let ranks: TalentRanks = {};
  for (const talents of tabs) {
    const ordered = [...talents].sort((left, right) => left.tierID - right.tierID || left.columnIndex - right.columnIndex || left.id - right.id);
    // Multi-pass replay: a prerequisite can sit in the same tier at a higher
    // column (e.g. Turtle's Owlkin Frenzy ← Moonkin Form), so a single
    // ordered pass would reject the dependent talent before its prereq is
    // applied. Repeat until no talent gains a rank; each pass either makes
    // progress or terminates, so this is bounded by total ranks.
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const talent of ordered) {
        const requested = Math.min(rawRanks[talent.id] ?? 0, talent.maxRank);
        for (let rank = (ranks[talent.id] ?? 0) + 1; rank <= requested; rank += 1) {
          const next = updateTalentRank(talent, rank, talents, ranks, { maxPoints });
          if (next === ranks) break;
          ranks = next;
          progressed = true;
        }
      }
    }
  }
  return cleanRanks(ranks);
}

export function resetTalentTabRanks(tabs: TalentEntry[][], ranks: TalentRanks, resetTalents: TalentEntry[], maxPoints = Number.POSITIVE_INFINITY): TalentRanks {
  const resetIds = new Set(resetTalents.map((talent) => talent.id));
  const nextRanks = Object.fromEntries(Object.entries(ranks).filter(([id]) => !resetIds.has(Number(id))));
  return normalizeTalentRanks(tabs, nextRanks, maxPoints);
}

// ─── URL helpers ──────────────────────────────────────────────────

export function searchParamsWithTalentBuild(params: URLSearchParams, ranks: TalentRanks, tabs: TalentEntry[][]) {
  const next = new URLSearchParams(params);
  const build = encodeTalentBuild(ranks, tabs);
  if (build) next.set(TALENT_BUILD_PARAM, build);
  else next.delete(TALENT_BUILD_PARAM);
  return next;
}

export function searchParamsWithTalentLock(params: URLSearchParams, locked: boolean) {
  const next = new URLSearchParams(params);
  if (locked) next.set(TALENT_LOCK_PARAM, "1");
  else next.delete(TALENT_LOCK_PARAM);
  return next;
}

export function isTalentBuildLocked(params: URLSearchParams) {
  return params.get(TALENT_LOCK_PARAM) === "1";
}

export function canonicalTalentBuildUrl(href: string, ranks: TalentRanks, tabs: TalentEntry[][]) {
  const url = new URL(href);
  url.search = searchParamsWithTalentBuild(url.searchParams, ranks, tabs).toString();
  return url.toString();
}

type BuildUrlClipboard = Pick<Clipboard, "writeText">;

export async function copyTalentBuildUrl(clipboard: BuildUrlClipboard | undefined, href: string, ranks: TalentRanks, tabs: TalentEntry[][]) {
  if (!clipboard) return;
  await clipboard.writeText(canonicalTalentBuildUrl(href, ranks, tabs));
}

/**
 * Converts a rankings talent_layout ("05230}30200}0000", trees separated by
 * '}') into the calculator's positional build format ("0523-302", dashes,
 * trailing zeros trimmed). Returns "" for empty/absent layouts.
 */
export function rankingsLayoutToBuild(layout: string | null | undefined): string {
  if (!layout) return "";
  const sections = layout.split("}").map((section) => {
    let last = section.length;
    while (last > 0 && section[last - 1] === "0") last--;
    return section.slice(0, last);
  });
  let lastTab = sections.length;
  while (lastTab > 0 && sections[lastTab - 1] === "") lastTab--;
  return sections.slice(0, lastTab).join("-");
}

// ─── Build popularity (Top Builds "Show all") ─────────────────────

export interface TalentPopularity {
  /** Percent of builds with at least 1 point in this talent (0-100). */
  pct: number;
  /** Average rank among builds that took the talent. */
  avg: number;
  /** Number of builds aggregated (the "top N"). */
  sample: number;
}

/**
 * Aggregates multiple builds into per-talent popularity: what percent of
 * the builds put at least one point in each talent, and the average rank
 * among those that did.
 */
export function aggregateTalentPopularity(builds: TalentRanks[]): Record<number, TalentPopularity> {
  const out: Record<number, TalentPopularity> = {};
  if (builds.length === 0) return out;
  const counts = new Map<number, { takers: number; points: number }>();
  for (const build of builds) {
    for (const [id, rank] of Object.entries(build)) {
      if (rank <= 0) continue;
      const entry = counts.get(Number(id)) ?? { takers: 0, points: 0 };
      entry.takers += 1;
      entry.points += rank;
      counts.set(Number(id), entry);
    }
  }
  for (const [id, { takers, points }] of counts) {
    out[id] = {
      pct: Math.round((takers / builds.length) * 100),
      avg: points / takers,
      sample: builds.length,
    };
  }
  return out;
}

/** "1" or "1.5" — trims the trailing .0 for whole averages. */
export function formatPopularityAvg(avg: number): string {
  const rounded = Math.round(avg * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Per-tab point totals from a positional build string, e.g. "35003-0503" → "11/8". */
export function buildPointsSummary(build: string): string {
  if (!build) return "0";
  return build
    .split("-")
    .map((section) => section.split("").reduce((sum, digit) => sum + (parseInt(digit, 10) || 0), 0))
    .join("/");
}

// ─── Export filename ──────────────────────────────────────────────

/**
 * Filename for an exported build image: `<Spec>_<pts1>.<pts2>.<pts3>`,
 * e.g. "Retribution_0.34.17". Spec is the tab with the most points
 * (first tab wins ties); falls back to the given class name when no
 * points are spent.
 */
export function talentBuildExportName(tabs: TalentTabData[], ranks: TalentRanks, fallbackName: string) {
  const pointsPerTab = tabs.map((tab) => tab.talents.reduce((sum, talent) => sum + (ranks[talent.id] ?? 0), 0));
  const maxPoints = Math.max(...pointsPerTab, 0);
  const specTab = maxPoints > 0 ? tabs[pointsPerTab.indexOf(maxPoints)] : undefined;
  const spec = (specTab?.name || fallbackName).replace(/\s+/g, "-");
  return `${spec}_${pointsPerTab.join(".")}`;
}

// ─── Arrow path geometry ──────────────────────────────────────────

function talentCenter(talent: Pick<TalentEntry, "tierID" | "columnIndex">) {
  return {
    x: talent.columnIndex * (TALENT_CELL_WIDTH + TALENT_GRID_GAP) + TALENT_BUTTON_SIZE / 2,
    y: talent.tierID * TALENT_ROW_STRIDE + TALENT_BUTTON_SIZE / 2,
  };
}

function talentButtonBounds(talent: Pick<TalentEntry, "tierID" | "columnIndex">) {
  const center = talentCenter(talent);
  const buttonEdge = TALENT_BUTTON_SIZE / 2;
  return {
    left: center.x - buttonEdge,
    right: center.x + buttonEdge,
    top: center.y - buttonEdge,
    bottom: center.y + buttonEdge,
  };
}

function verticalSegmentCrossesTalent(x: number, startY: number, endY: number, talent: Pick<TalentEntry, "tierID" | "columnIndex">) {
  const bounds = talentButtonBounds(talent);
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);
  return x >= bounds.left && x <= bounds.right && bottom >= bounds.top && top <= bounds.bottom;
}

function horizontalSegmentCrossesTalent(y: number, startX: number, endX: number, talent: Pick<TalentEntry, "tierID" | "columnIndex">) {
  const bounds = talentButtonBounds(talent);
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);
  return y >= bounds.top && y <= bounds.bottom && right >= bounds.left && left <= bounds.right;
}

export function prerequisiteArrowPolylinePoints(
  from: Pick<TalentEntry, "tierID" | "columnIndex">,
  to: Pick<TalentEntry, "tierID" | "columnIndex">,
  talents: Array<Pick<TalentEntry, "id" | "tierID" | "columnIndex">> = [],
) {
  const fromPoint = talentCenter(from);
  const toPoint = talentCenter(to);
  const buttonEdge = TALENT_BUTTON_SIZE / 2;

  if (from.tierID === to.tierID) {
    const direction = toPoint.x >= fromPoint.x ? 1 : -1;
    return `${fromPoint.x + direction * (buttonEdge + TALENT_ARROW_SOURCE_CLEARANCE)},${fromPoint.y} ${toPoint.x - direction * (buttonEdge + TALENT_ARROW_TARGET_CLEARANCE)},${toPoint.y}`;
  }

  const endY = toPoint.y - buttonEdge - TALENT_ARROW_TARGET_CLEARANCE;

  // Same column: straight vertical line.
  if (fromPoint.x === toPoint.x) {
    const startY = fromPoint.y + buttonEdge + TALENT_ARROW_SOURCE_CLEARANCE;
    return `${fromPoint.x},${startY} ${toPoint.x},${endY}`;
  }

  const others = talents.filter((talent) => talent !== from && talent !== to);
  const direction = toPoint.x >= fromPoint.x ? 1 : -1;

  // Horizontal-first: exit from the side of source, go horizontal to target's column, then down.
  const startX = fromPoint.x + direction * (buttonEdge + TALENT_ARROW_SOURCE_CLEARANCE);
  const hBlockers = others.filter((t) => horizontalSegmentCrossesTalent(fromPoint.y, startX, toPoint.x, t));
  const vBlockers = others.filter((t) => verticalSegmentCrossesTalent(toPoint.x, fromPoint.y, endY, t));

  if (hBlockers.length === 0 && vBlockers.length === 0) {
    return `${startX},${fromPoint.y} ${toPoint.x},${fromPoint.y} ${toPoint.x},${endY}`;
  }

  // Fallback: exit bottom, go down near target row, then horizontal, then down to target.
  const startY = fromPoint.y + buttonEdge + TALENT_ARROW_SOURCE_CLEARANCE;
  const elbowY = endY > startY ? endY - TALENT_ARROW_ELBOW_CLEARANCE : startY + TALENT_ARROW_ELBOW_CLEARANCE;
  const downBlockers = others.filter((t) => verticalSegmentCrossesTalent(fromPoint.x, startY, elbowY, t));
  if (downBlockers.length === 0) {
    return `${fromPoint.x},${startY} ${fromPoint.x},${elbowY} ${toPoint.x},${elbowY} ${toPoint.x},${endY}`;
  }

  // Detour: route around vertical blockers.
  const detourX = direction > 0
    ? Math.max(...downBlockers.map((t) => talentButtonBounds(t).right)) + TALENT_ARROW_ELBOW_CLEARANCE + TALENT_ARROW_SOURCE_CLEARANCE
    : Math.min(...downBlockers.map((t) => talentButtonBounds(t).left)) - TALENT_ARROW_ELBOW_CLEARANCE - TALENT_ARROW_SOURCE_CLEARANCE;
  return `${fromPoint.x},${startY} ${detourX},${startY} ${detourX},${elbowY} ${toPoint.x},${elbowY} ${toPoint.x},${endY}`;
}

function parseArrowPoint(point: string) {
  const [x = "0", y = "0"] = point.split(",");
  return { x: Number(x), y: Number(y) };
}

function formatArrowPoint(point: { x: number; y: number }) {
  return `${point.x} ${point.y}`;
}

export function prerequisiteArrowPathData(points: string) {
  const parsed = points.split(" ").map(parseArrowPoint);
  if (parsed.length <= 1) return "";
  if (parsed.length === 2) return `M ${formatArrowPoint(parsed[0])} L ${formatArrowPoint(parsed[1])}`;

  const commands = [`M ${formatArrowPoint(parsed[0])}`];
  for (let index = 1; index < parsed.length - 1; index += 1) {
    const previous = parsed[index - 1];
    const corner = parsed[index];
    const next = parsed[index + 1];
    const incomingLength = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoingLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(6, incomingLength / 2, outgoingLength / 2);
    const incoming = {
      x: corner.x - ((corner.x - previous.x) / incomingLength) * radius,
      y: corner.y - ((corner.y - previous.y) / incomingLength) * radius,
    };
    const outgoing = {
      x: corner.x + ((next.x - corner.x) / outgoingLength) * radius,
      y: corner.y + ((next.y - corner.y) / outgoingLength) * radius,
    };
    commands.push(`L ${formatArrowPoint(incoming)}`);
    commands.push(`Q ${formatArrowPoint(corner)} ${formatArrowPoint(outgoing)}`);
  }
  commands.push(`L ${formatArrowPoint(parsed[parsed.length - 1])}`);
  return commands.join(" ");
}

// ─── Tooltip positioning ──────────────────────────────────────────

export function talentTooltipPosition(rect: Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width" | "height">, viewport: Pick<Window, "innerWidth" | "innerHeight"> = window): TalentTooltipPosition {
  const viewportWidth = viewport.innerWidth;
  const viewportHeight = viewport.innerHeight;
  const tooltipHeight = Math.min(TALENT_TOOLTIP_ESTIMATED_HEIGHT, Math.max(0, viewportHeight - TALENT_TOOLTIP_MARGIN * 2));
  const maxTop = Math.max(TALENT_TOOLTIP_MARGIN, viewportHeight - tooltipHeight - TALENT_TOOLTIP_MARGIN);
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - TALENT_TOOLTIP_WIDTH / 2, TALENT_TOOLTIP_MARGIN),
    Math.max(TALENT_TOOLTIP_MARGIN, viewportWidth - TALENT_TOOLTIP_WIDTH - TALENT_TOOLTIP_MARGIN),
  );
  const belowTop = rect.bottom + TALENT_TOOLTIP_GAP;
  const aboveTop = rect.top - TALENT_TOOLTIP_GAP - TALENT_TOOLTIP_ESTIMATED_HEIGHT;
  const preferredTop = belowTop + TALENT_TOOLTIP_ESTIMATED_HEIGHT > viewportHeight - TALENT_TOOLTIP_MARGIN && aboveTop > TALENT_TOOLTIP_MARGIN
    ? aboveTop
    : belowTop;
  const top = Math.min(Math.max(preferredTop, TALENT_TOOLTIP_MARGIN), maxTop);
  return { left, top };
}

// ─── Tooltip text helpers ─────────────────────────────────────────

export function talentDescription(talent: TalentEntry) {
  if (talent.description) return talent.description;
  if (talent.effect) return talent.effect;
  if (typeof talent.effects === "string") return talent.effects;
  return "Talent details unavailable.";
}

export function talentRankTexts(talent: TalentEntry) {
  if (talent.rankDescriptions) return talent.rankDescriptions;
  if (talent.rankDescription) return talent.rankDescription;
  if (Array.isArray(talent.effects)) return talent.effects;
  return [];
}

function tokenizeRankDescription(description: string) {
  const tokens: Array<{ type: "text" | "number"; value: string }> = [];
  const numberPattern = /\d+(?:\.\d+)?/g;
  let lastIndex = 0;
  for (const match of description.matchAll(numberPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ type: "text", value: description.slice(lastIndex, index) });
    tokens.push({ type: "number", value: match[0] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < description.length) tokens.push({ type: "text", value: description.slice(lastIndex) });
  return tokens;
}

// Strip Blizzard boilerplate like "(More effective than Rank 1)." appended to higher ranks.
// Restores the trailing period so the cleaned text ends consistently.
const RANK_COMPARISON_SUFFIX = /\s*\(More effective than Rank \d+\)\.?\s*$/i;
function stripRankBoilerplate(text: string): string {
  const cleaned = text.trim().replace(RANK_COMPARISON_SUFFIX, "");
  if (cleaned === text.trim()) return text.trim();
  // Restore trailing period if the original had one and the cleaned text doesn't
  return cleaned.endsWith(".") ? cleaned : cleaned + ".";
}

export function mergeTalentRankDescriptions(descriptions: string[], activeRank: number): TalentRankDescriptionPart[] | null {
  const usableDescriptions = descriptions
    .map(stripRankBoilerplate)
    .filter(Boolean);
  if (usableDescriptions.length < 2) return null;

  const tokenizedDescriptions = usableDescriptions.map(tokenizeRankDescription);
  const [firstTokens] = tokenizedDescriptions;
  if (firstTokens.length === 0 || !firstTokens.some((token) => token.type === "number")) return null;

  // Require same token count and types, but allow text tokens to differ
  // slightly (e.g. "rage point." vs "rage points." singular/plural).
  const compatibleTemplate = tokenizedDescriptions.every((tokens) =>
    tokens.length === firstTokens.length
    && tokens.every((token, index) => token.type === firstTokens[index].type),
  );
  if (!compatibleTemplate) return null;

  const changingNumberIndexes = firstTokens
    .map((token, index) => ({ token, index }))
    .filter(({ token, index }) => token.type === "number" && new Set(tokenizedDescriptions.map((tokens) => tokens[index].value)).size > 1)
    .map(({ index }) => index);
  if (changingNumberIndexes.length === 0) return null;

  // Use the active rank's text tokens so singular/plural matches the highlighted value.
  const activeIndex = activeRank > 0 && activeRank <= usableDescriptions.length ? activeRank - 1 : -1;
  const templateTokens = activeIndex >= 0 ? tokenizedDescriptions[activeIndex] : firstTokens;
  return templateTokens.reduce<TalentRankDescriptionPart[]>((parts, token, index) => {
    const nextPart = token.type === "number" && changingNumberIndexes.includes(index)
      ? { type: "ladder" as const, values: tokenizedDescriptions.map((tokens) => tokens[index].value), activeIndex }
      : { type: "text" as const, text: token.value };
    const previousPart = parts.at(-1);
    if (previousPart?.type === "text" && nextPart.type === "text") previousPart.text += nextPart.text;
    else parts.push(nextPart);
    return parts;
  }, []);
}

export function rankDescriptionsForTooltip(rankTexts: string[], rank: number, currentRankText?: string, nextRankText?: string, fetchedRankTexts: string[] = []) {
  const descriptions = [...(fetchedRankTexts.some((description) => description.trim()) ? fetchedRankTexts : rankTexts)];
  if (rank > 0 && currentRankText) descriptions[rank - 1] = currentRankText;
  if (rank < descriptions.length && nextRankText) descriptions[rank] = nextRankText;
  return descriptions;
}

// ─── Visual state ─────────────────────────────────────────────────

export function talentVisualState(rank: number, maxRank: number, locked: boolean): TalentVisualState {
  if (locked) return "locked";
  if (rank >= maxRank) return "maxed";
  if (rank > 0) return "selected";
  return "available";
}

export function isTalentBackgroundVisible(backgroundUrl: string | null, failedBackgroundUrl: string | null) {
  return Boolean(backgroundUrl && backgroundUrl !== failedBackgroundUrl);
}

// ─── Lock reasons (for tooltip) ───────────────────────────────────

export function lockedTalentReasons(talent: TalentEntry, talents: TalentEntry[], ranks: TalentRanks, pointsExhausted = false) {
  const reasons: string[] = [];
  if (pointsExhausted) {
    reasons.push("No talent points remaining.");
  }
  const requiredPoints = rowPointRequirement(talent);
  if (pointsSpentBeforeRow(talents, ranks, talent.tierID) < requiredPoints) {
    reasons.push(`Spend ${requiredPoints} points in this tree to unlock this row.`);
  }

  const byId = new Map(talents.map((candidate) => [candidate.id, candidate]));
  for (const prereqId of talent.prereqTalent ?? []) {
    const prereq = byId.get(prereqId);
    if (!prereq) continue;
    if ((ranks[prereq.id] ?? 0) < prereq.maxRank) {
      reasons.push(`Requires ${prereq.name} at rank ${prereq.maxRank}/${prereq.maxRank}.`);
    }
  }

  return reasons.length > 0 ? reasons : ["Complete prerequisite requirements to unlock this talent."];
}
