// Copy for AI data: starter questions per page type and the chat AIs the
// "Open in …" picker knows. Adding a question, flipping a `requires` flag or
// fixing a broken prefill URL is an edit to this file only.

export type AIPageType = "raid" | "character" | "guild" | "search";

/** Placeholders a question may use. A page fills the ones it knows. */
export type AIPromptPlaceholder = "character" | "guild" | "raid" | "boss" | "realm" | "class";

export type AIPromptValues = Partial<Record<AIPromptPlaceholder, string | null | undefined>>;

/**
 * Server data a question needs beyond search and the page text views.
 * A question whose feature isn't in AI_AVAILABLE_FEATURES stays hidden.
 */
export type AIPromptFeature = "deaths-summary" | "consumes-summary";

/** Features the AI can read through a keyed link today. */
export const AI_AVAILABLE_FEATURES: ReadonlySet<AIPromptFeature> = new Set<AIPromptFeature>([
  // #1677 (car 5) serves /raidlogs/instances/{id}/deaths.
  "deaths-summary",
  // #1677 (car 5) serves /raidlogs/instances/{id}/consumables.
  "consumes-summary",
]);

export interface AIPrompt {
  /** Question text. `{name}` placeholders come from the page. */
  text: string;
  requires?: AIPromptFeature;
}

export const AI_PROMPTS: Record<AIPageType, readonly AIPrompt[]> = {
  raid: [
    { text: "Which boss did we lose the most time on tonight, and how many attempts did each boss take?" },
    { text: "Compare this clear to {guild}'s last few {raid} runs. Where did the time go: bosses, trash or idle?" },
    { text: "Which phase did we wipe in on each attempt at {boss}?" },
    { text: "Who died first on each wipe, and to what?", requires: "deaths-summary" },
    { text: "Who had no flask or elixirs on boss pulls?", requires: "consumes-summary" },
  ],
  character: [
    { text: "Is {character} consistently good, or was their best parse a one-off? Do they die on mechanics-heavy bosses?" },
    { text: "Can {character} really play their role? Which bosses have they tanked or healed on kills?" },
    { text: "Is {character} improving? Show their parse on each boss across their last 10 kills." },
    { text: "Which guilds has {character} raided with, and how recently?" },
  ],
  guild: [
    { text: "Which boss is {guild}'s wipe sink, and are we getting better at it week over week?" },
    { text: "Is our {raid} clear getting faster, and which boss improved the most?" },
    { text: "What do the fastest guilds on {realm} do differently from us (comp, deaths, clear time)?" },
    { text: "When did {guild} first kill each boss in Karazhan (40) and Emerald Sanctum?" },
  ],
  search: [
    { text: "Summarise these runs: which guilds, comps and clear times show up most?" },
    { text: "Who killed Mephistroth first on {realm}, and how many wipes did they need?" },
    { text: "Can a druid bear-tank trash and still top cat DPS on bosses? Find runs where that happened." },
    { text: "Is it gear or play? Find low-item-level {class} players who still parse 90+." },
    { text: "How many healers do raids actually bring to Emerald Sanctum and Karazhan (40) kills?" },
  ],
};

export type AITargetId = "chatgpt" | "claude" | "grok" | "perplexity" | "gemini" | "other";

export interface AITarget {
  id: AITargetId;
  label: string;
  /**
   * Prefill URL with `{q}` where the encoded text goes. These are unofficial;
   * a target without one is copy-only.
   */
  prefillURL?: string;
  /** One-line tip shown under the picker. */
  tip: string;
}

// Prefill URLs checked by hand on 2026-11-07; see the PR (#1660) for results.
export const AI_TARGETS: readonly AITarget[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    prefillURL: "https://chatgpt.com/?q={q}",
    tip: "ChatGPT opens Chronicle links you give it and links it finds on those pages, but won't build new search URLs. Ask it to follow the links in the answer.",
  },
  {
    id: "claude",
    label: "Claude",
    prefillURL: "https://claude.ai/new?q={q}",
    tip: "Claude opens links pasted into the chat. If it says it can't, check that web search is on.",
  },
  {
    id: "grok",
    label: "Grok",
    prefillURL: "https://grok.com/?q={q}",
    tip: "Grok follows links and can build its own search URLs, so you can ask open-ended questions.",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    prefillURL: "https://www.perplexity.ai/search?q={q}",
    tip: "Ask follow-ups in the same thread, so Perplexity keeps using the link.",
  },
  {
    id: "gemini",
    label: "Gemini",
    tip: "Gemini has no prefill link. We copy the text; paste it into Gemini.",
  },
  {
    id: "other",
    label: "Other",
    tip: "Copies the link. Paste it into any chat AI that can open web pages.",
  },
];

export const DEFAULT_AI_TARGET: AITargetId = "other";

/** Shown in the one-time warning before the first key. `{expiry}` is filled in. */
export const AI_KEY_WARNING =
  "This link is a key to your Chronicle account. Paste it only into your own AI chat. Anyone with it can search as you until {expiry}. Don't post it in Discord or share the chat. Revoke anytime in Settings → AI access.";

export const AI_KEY_OPEN_IN_WARNING = "Open in … puts your AI key in that site's address bar and browser history.";
