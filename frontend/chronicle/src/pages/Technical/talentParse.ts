import type { TalentAllocation } from "@/components/ui/TalentTreeViewer/TalentTreeViewer";

/** Result of parsing any supported talent format. */
export interface ParsedTalents {
  playerName: string;
  /** GUID hex string, if present (WotLK companion format). */
  guid?: string;
  /** Per-group allocations. Usually one group; WotLK dual-spec may have two. */
  groups: TalentAllocation[][];
  /** 1-based index of the active talent group (WotLK companion). Defaults to 1. */
  activeGroup: number;
  /** Which format was detected. */
  format: "combatant_talents" | "wotlk_companion" | "bare_tabs";
}

// ─── WotLK Companion format parsing ──────────────────────────────────────────

/**
 * Strip transport framing: `[N<message>]` wrapper and `~` continuation joins.
 * Returns the inner logical message.
 */
function stripTransportFraming(raw: string): string {
  let s = raw.trim();

  // Join ~-continuation fragments (split lines rejoined into one string)
  s = s.replace(/~\s*/g, "");

  // Unwrap `[N<message>]` – N is a single rotating digit
  const bracketMatch = s.match(/^\[(\d)(.+)\]$/s);
  if (bracketMatch) {
    s = bracketMatch[2];
  }

  return s.trim();
}

/**
 * Parse a single rank string of the form `<tab1>}<tab2>}<tab3>`.
 * Each tab is a sequence of digits 0-5.
 * Returns three tab rank-digit strings, or null if invalid.
 */
function parseWotlkRankString(rankStr: string): string[] | null {
  const tabs = rankStr.split("}");
  if (tabs.length !== 3) return null;
  for (const tab of tabs) {
    if (!/^[0-5]+$/.test(tab)) return null;
  }
  return tabs;
}

/**
 * Try to parse the WotLK ChronicleCompanion format:
 *   P<guid>;T<activeGroup>,<numGroups>,<rankString1>[,<rankString2>]
 *
 * Also accepts bare variants:
 *   - Just the T portion: T<activeGroup>,<numGroups>,<rankStr1>[,<rankStr2>]
 *   - Just a single rank string: <tab1>}<tab2>}<tab3>
 */
function parseWotlkCompanion(raw: string): ParsedTalents | null {
  const stripped = stripTransportFraming(raw);

  // Try full P<guid>;T... format
  const fullMatch = stripped.match(
    /^P(0x[0-9A-Fa-f]+);T(\d+),(\d+),(.+)$/
  );
  if (fullMatch) {
    const guid = fullMatch[1];
    const activeGroup = parseInt(fullMatch[2], 10);
    const numGroups = parseInt(fullMatch[3], 10);
    const ranksPart = fullMatch[4];
    return parseWotlkRanksPart(ranksPart, numGroups, activeGroup, guid);
  }

  // Try bare T... format (no P<guid>; prefix)
  const tMatch = stripped.match(/^T(\d+),(\d+),(.+)$/);
  if (tMatch) {
    const activeGroup = parseInt(tMatch[1], 10);
    const numGroups = parseInt(tMatch[2], 10);
    const ranksPart = tMatch[3];
    return parseWotlkRanksPart(ranksPart, numGroups, activeGroup);
  }

  // Try bare rank string: tab1}tab2}tab3
  if (stripped.includes("}") && !stripped.includes("|") && !stripped.includes(";")) {
    const tabs = parseWotlkRankString(stripped);
    if (tabs) {
      const allocs = tabs.map((rankDigits) => ({
        tabName: "",
        pointsSpent: sumDigits(rankDigits),
        rankDigits,
      }));
      return {
        playerName: "",
        groups: [allocs],
        activeGroup: 1,
        format: "wotlk_companion",
      };
    }
  }

  return null;
}

/**
 * Parse the ranks portion after the header fields:
 *   <rankString1>[,<rankString2>,...]
 *
 * Rank strings are `}` separated (tab1}tab2}tab3), and groups are `,` separated.
 * Stock WotLK dual spec has at most 2 groups, but some private servers allow
 * more, so any number of groups is accepted.
 */
function parseWotlkRanksPart(
  ranksPart: string,
  numGroups: number,
  activeGroup: number,
  guid?: string,
): ParsedTalents | null {
  if (numGroups < 1 || activeGroup < 1 || activeGroup > numGroups) return null;

  // Each rank string has exactly 2 `}` separators.
  const totalBraces = (ranksPart.match(/}/g) || []).length;
  if (totalBraces !== numGroups * 2) return null;

  // Split into rank strings: a group boundary is a `,` after the current
  // segment has accumulated exactly 2 `}` characters.
  const rankStrings: string[] = [];
  let segStart = 0;
  let braceCount = 0;
  for (let i = 0; i < ranksPart.length; i++) {
    if (ranksPart[i] === "}") braceCount++;
    if (ranksPart[i] === "," && braceCount === 2) {
      rankStrings.push(ranksPart.slice(segStart, i));
      segStart = i + 1;
      braceCount = 0;
    }
  }
  rankStrings.push(ranksPart.slice(segStart));
  if (rankStrings.length !== numGroups) return null;

  const groups: TalentAllocation[][] = [];
  for (const rs of rankStrings) {
    const tabs = parseWotlkRankString(rs);
    if (!tabs) return null;
    groups.push(
      tabs.map((rankDigits) => ({
        tabName: "",
        pointsSpent: sumDigits(rankDigits),
        rankDigits,
      }))
    );
  }

  return {
    playerName: "",
    guid,
    groups,
    activeGroup,
    format: "wotlk_companion",
  };
}

function sumDigits(s: string): number {
  let total = 0;
  for (const ch of s) total += parseInt(ch, 10) || 0;
  return total;
}

// ─── COMBATANT_TALENTS format parsing ────────────────────────────────────────

/**
 * Parse a COMBATANT_TALENTS log line into tab allocations.
 * Returns null if the string doesn't look valid.
 */
function parseCombatantTalents(raw: string): ParsedTalents | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parts = trimmed.split("|");

  let tabFields: string[];
  let playerName = "";

  if (parts.length >= 7 && parts[1] === "COMBATANT_TALENTS") {
    playerName = parts[3];
    tabFields = parts.slice(4, 7);
  } else if (parts.length === 3 && parts[0].includes(";")) {
    tabFields = parts;
  } else {
    return null;
  }

  const allocations: TalentAllocation[] = [];
  for (const field of tabFields) {
    const semi = field.split(";");
    if (semi.length < 3) return null;
    allocations.push({
      tabName: semi[0],
      pointsSpent: parseInt(semi[1], 10) || 0,
      rankDigits: semi[2],
    });
  }

  return {
    playerName,
    groups: [allocations],
    activeGroup: 1,
    format: parts.length >= 7 ? "combatant_talents" : "bare_tabs",
  };
}

// ─── Unified parser ──────────────────────────────────────────────────────────

/**
 * Try all supported formats in order and return the first successful parse.
 */
export function parseTalentString(raw: string): ParsedTalents | null {
  if (!raw.trim()) return null;
  return parseCombatantTalents(raw) ?? parseWotlkCompanion(raw) ?? null;
}
