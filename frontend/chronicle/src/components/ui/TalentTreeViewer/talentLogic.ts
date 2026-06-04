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
export const TALENT_ARROW_SOURCE_CLEARANCE = 4;
export const TALENT_ARROW_TARGET_CLEARANCE = 6;
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
  const nextRank = Math.max(0, Math.min(talent.maxRank, requestedRank));
  if (nextRank === currentRank) return ranks;
  if (nextRank > currentRank && !canUseTalent(talent, talents, ranks)) return ranks;

  const nextRanks = { ...ranks, [talent.id]: nextRank };
  if (options.maxPoints !== undefined && totalTalentPoints(nextRanks) > options.maxPoints) return ranks;
  if (nextRank < currentRank && !spentTalentsStillValid(talents, nextRanks)) return ranks;
  return nextRanks;
}

// ─── Build encoding / decoding ────────────────────────────────────

function decodeTalentBuildNumber(value: string, radix: number) {
  if (!/^[0-9a-z]+$/i.test(value)) return Number.NaN;
  const number = Number.parseInt(value, radix);
  return Number.isFinite(number) ? number : Number.NaN;
}

export function encodeTalentBuild(ranks: TalentRanks) {
  return Object.entries(ranks)
    .map(([id, rank]) => [Number(id), rank] as const)
    .filter(([id, rank]) => Number.isFinite(id) && rank > 0)
    .sort(([left], [right]) => left - right)
    .map(([id, rank]) => `${id.toString(36)}.${rank.toString(36)}`)
    .join("_");
}

export function decodeTalentBuild(value: string | null | undefined): TalentRanks {
  if (!value) return {};
  const ranks: TalentRanks = {};
  const isLegacyBuild = value.includes(":") || value.includes(",");
  const entries = isLegacyBuild ? value.split(",").map((part) => part.split(":")) : value.split("_").map((part) => part.split("."));

  for (const [idText, rankText] of entries) {
    const id = decodeTalentBuildNumber(idText ?? "", isLegacyBuild ? 10 : 36);
    const rank = decodeTalentBuildNumber(rankText ?? "", isLegacyBuild ? 10 : 36);
    if (Number.isInteger(id) && Number.isInteger(rank) && id > 0 && rank > 0) ranks[id] = rank;
  }
  return ranks;
}

// ─── Normalization and reset ──────────────────────────────────────

export function normalizeTalentRanks(tabs: TalentEntry[][], rawRanks: TalentRanks, maxPoints = Number.POSITIVE_INFINITY): TalentRanks {
  let ranks: TalentRanks = {};
  for (const talents of tabs) {
    const ordered = [...talents].sort((left, right) => left.tierID - right.tierID || left.columnIndex - right.columnIndex || left.id - right.id);
    for (const talent of ordered) {
      const requested = Math.min(rawRanks[talent.id] ?? 0, talent.maxRank);
      for (let rank = 1; rank <= requested; rank += 1) {
        ranks = updateTalentRank(talent, rank, talents, ranks, { maxPoints });
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

export function searchParamsWithTalentBuild(params: URLSearchParams, ranks: TalentRanks) {
  const next = new URLSearchParams(params);
  const build = encodeTalentBuild(ranks);
  if (build) next.set(TALENT_BUILD_PARAM, build);
  else next.delete(TALENT_BUILD_PARAM);
  return next;
}

export function canonicalTalentBuildUrl(href: string, ranks: TalentRanks) {
  const url = new URL(href);
  url.search = searchParamsWithTalentBuild(url.searchParams, ranks).toString();
  return url.toString();
}

type BuildUrlClipboard = Pick<Clipboard, "writeText">;

export async function copyTalentBuildUrl(clipboard: BuildUrlClipboard | undefined, href: string, ranks: TalentRanks) {
  if (!clipboard) return;
  await clipboard.writeText(canonicalTalentBuildUrl(href, ranks));
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

  const startY = fromPoint.y + buttonEdge + TALENT_ARROW_SOURCE_CLEARANCE;
  const endY = toPoint.y - buttonEdge - TALENT_ARROW_TARGET_CLEARANCE;
  if (fromPoint.x === toPoint.x) return `${fromPoint.x},${startY} ${toPoint.x},${endY}`;

  const elbowY = endY > startY ? endY - TALENT_ARROW_ELBOW_CLEARANCE : startY + TALENT_ARROW_ELBOW_CLEARANCE;
  const blockers = talents.filter((talent) => talent !== from && talent !== to && verticalSegmentCrossesTalent(fromPoint.x, startY, elbowY, talent));
  if (blockers.length > 0) {
    const direction = toPoint.x >= fromPoint.x ? 1 : -1;
    const detourX = direction > 0
      ? Math.max(...blockers.map((talent) => talentButtonBounds(talent).right)) + TALENT_ARROW_ELBOW_CLEARANCE + TALENT_ARROW_SOURCE_CLEARANCE
      : Math.min(...blockers.map((talent) => talentButtonBounds(talent).left)) - TALENT_ARROW_ELBOW_CLEARANCE - TALENT_ARROW_SOURCE_CLEARANCE;
    return `${fromPoint.x},${startY} ${detourX},${startY} ${detourX},${elbowY} ${toPoint.x},${elbowY} ${toPoint.x},${endY}`;
  }

  return `${fromPoint.x},${startY} ${fromPoint.x},${elbowY} ${toPoint.x},${elbowY} ${toPoint.x},${endY}`;
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

export function lockedTalentReasons(talent: TalentEntry, talents: TalentEntry[], ranks: TalentRanks) {
  const reasons: string[] = [];
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
