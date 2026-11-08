import { AIKeyQueryParam } from "@/api/typesGenerated";
import {
  AI_AVAILABLE_FEATURES,
  AI_PROMPTS,
  AI_TARGETS,
  DEFAULT_AI_TARGET,
  type AIPageType,
  type AIPromptFeature,
  type AIPromptValues,
  type AITarget,
  type AITargetId,
} from "./aiPrompts";

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * fillPrompt replaces `{name}` placeholders with page values. It returns null
 * when any placeholder has no value, so the caller hides that question.
 */
export function fillPrompt(text: string, values: AIPromptValues): string | null {
  let missing = false;
  const filled = text.replace(PLACEHOLDER, (_, name: string) => {
    const value = (values as Record<string, string | null | undefined>)[name]?.trim();
    if (!value) missing = true;
    return value ?? "";
  });
  return missing ? null : filled;
}

/**
 * suggestionsFor lists the filled questions for a page type. A question is
 * hidden when its `requires` feature isn't available or a placeholder can't
 * be filled.
 */
export function suggestionsFor(
  page: AIPageType,
  values: AIPromptValues,
  available: ReadonlySet<AIPromptFeature> = AI_AVAILABLE_FEATURES,
): string[] {
  const out: string[] = [];
  for (const prompt of AI_PROMPTS[page]) {
    if (prompt.requires && !available.has(prompt.requires)) continue;
    const filled = fillPrompt(prompt.text, values);
    if (filled) out.push(filled);
  }
  return out;
}

/** What the user pastes: the link alone, or the question then the link. */
export function buildAIText(link: string, question?: string | null): string {
  const q = question?.trim();
  return q ? `${q}\n\n${link}` : link;
}

export function aiTarget(id: AITargetId): AITarget {
  return AI_TARGETS.find((t) => t.id === id) ?? AI_TARGETS.find((t) => t.id === DEFAULT_AI_TARGET)!;
}

export function isAITargetId(value: unknown): value is AITargetId {
  return typeof value === "string" && AI_TARGETS.some((t) => t.id === value);
}

/** The prefill URL that opens the AI with text in its prompt, or null if copy-only. */
export function buildOpenURL(target: AITarget, text: string): string | null {
  if (!target.prefillURL) return null;
  return target.prefillURL.replace("{q}", encodeURIComponent(text));
}

function isAIKeyParam(part: string): boolean {
  const name = part.split("=", 1)[0];
  try {
    return decodeURIComponent(name.replace(/\+/g, " ")) === AIKeyQueryParam;
  } catch {
    return false;
  }
}

/**
 * stripAIKeyFromSearch removes every `ai_key` (also `ai%5Fkey`) from a query
 * string and leaves the other parameters exactly as written.
 */
export function stripAIKeyFromSearch(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return "";
  const kept = raw.split("&").filter((part) => part !== "" && !isAIKeyParam(part));
  return kept.length ? `?${kept.join("&")}` : "";
}

/**
 * withAIKey turns a page URL into the link to paste: any old key and the hash
 * are dropped and `ai_key=<secret>` is appended.
 */
export function withAIKey(pageURL: string, secret: string): string {
  const url = new URL(pageURL);
  const search = stripAIKeyFromSearch(url.search);
  const param = `${AIKeyQueryParam}=${encodeURIComponent(secret)}`;
  return `${url.origin}${url.pathname}${search ? `${search}&${param}` : `?${param}`}`;
}

/** "1 hour", "24 hours", "7 days" … for lifetime options. */
export function formatLifetime(hours: number): string {
  if (hours % 24 === 0 && hours >= 48) return `${hours / 24} days`;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

interface PromptEncounter {
  name: string;
  boss: boolean;
  kill_type: string;
}

/**
 * bossForPrompt picks {boss} for raid questions about wipes: the one boss
 * being viewed if it has wipes, else the boss with the most wipes. Null (the
 * question hides) when no boss was wiped on.
 */
export function bossForPrompt(encounters: readonly PromptEncounter[], selected: readonly PromptEncounter[] = []): string | null {
  const wipes = new Map<string, number>();
  for (const e of encounters) {
    if (e.boss && e.kill_type === "wipe") wipes.set(e.name, (wipes.get(e.name) ?? 0) + 1);
  }
  const selectedBosses = new Set(selected.filter((e) => e.boss).map((e) => e.name));
  if (selectedBosses.size === 1) {
    const [name] = selectedBosses;
    if (wipes.has(name)) return name;
  }
  let best: string | null = null;
  for (const [name, n] of wipes) if (!best || n > wipes.get(best)!) best = name;
  return best;
}

interface SearchNode {
  and?: readonly SearchNode[];
  any_player?: SearchNode;
  any_encounter?: SearchNode;
  field?: string;
  op?: string;
  value?: unknown;
}

/**
 * searchEqualsValue finds `field = "value"` in a search tree, looking only
 * through AND and "any player/encounter" (not OR or NOT), so the value is
 * something every result has. Used to fill {realm} and {class} on search.
 */
export function searchEqualsValue(node: SearchNode | null | undefined, field: string): string | null {
  if (!node) return null;
  if (node.field === field && node.op === "=" && typeof node.value === "string" && node.value) return node.value;
  for (const child of [...(node.and ?? []), node.any_player, node.any_encounter]) {
    const found = searchEqualsValue(child, field);
    if (found) return found;
  }
  return null;
}

// Which URLs to give the AI. Car 3 serves agent views only on
// /instances/{id}, /armory/{realm}/{character} and /g/{guild_id}; any other
// keyed page gets the browser app with the key stripped, which an AI reads
// as an empty page. Search goes to car 1's GET search, which returns keyed
// markdown with follow-on links.

/** instanceAIURL is the raid page link: no view state, slug if there is one. */
export function instanceAIURL(origin: string, idOrSlug: string): string {
  return `${origin}/instances/${encodeURIComponent(idOrSlug)}`;
}

/** characterAIURL is the armory link for a character on a realm. */
export function characterAIURL(origin: string, realm: string, character: string): string {
  return `${origin}/armory/${encodeURIComponent(realm)}/${encodeURIComponent(character)}`;
}

/** guildAIURL is the guild root, so a sub-tab still copies a page the AI can read. */
export function guildAIURL(origin: string, guildID: string): string {
  return `${origin}/g/${encodeURIComponent(guildID)}`;
}

interface SearchAIQuery {
  where?: unknown;
  sort?: { field: string; direction?: string };
}

/**
 * searchAIURL points at GET /api/external/v1/raidlogs/search with the same
 * where tree the POST search sends, as markdown, plus the sort if set.
 */
export function searchAIURL(origin: string, query: SearchAIQuery): string {
  const params: string[] = [];
  if (query.where) params.push(`where=${encodeURIComponent(JSON.stringify(query.where))}`);
  if (query.sort?.field) params.push(`sort=${encodeURIComponent(query.sort.field)}`);
  if (query.sort?.direction) params.push(`dir=${encodeURIComponent(query.sort.direction)}`);
  params.push("format=md");
  return `${origin}/api/external/v1/raidlogs/search?${params.join("&")}`;
}
