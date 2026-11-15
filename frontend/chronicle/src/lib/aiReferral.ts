// Tags sessions that arrive from AI assistants, for GA4.
//
// KEEP IN SYNC: frontend/landing/src/aiReferral.ts must stay byte-identical to this file
// (frontend/landing/test/aiReferral.test.mjs enforces it); the two projects share no code.

/** AI assistants we report, as the `ai_source` value. */
export type AISource = "chatgpt" | "perplexity" | "claude" | "gemini" | "copilot";

/** What identified the source: the document referrer, or an explicit utm_source. */
export type AISignal = "referrer" | "utm";

export interface AIReferral {
  source: AISource;
  signal: AISignal;
}

// Referrer hostnames. A host matches itself and its subdomains, so "perplexity.ai" also
// covers www.perplexity.ai, while "gemini.google.com" does not match the rest of google.com.
const REFERRER_HOSTS: ReadonlyArray<readonly [host: string, source: AISource]> = [
  ["chatgpt.com", "chatgpt"],
  ["chat.openai.com", "chatgpt"],
  ["perplexity.ai", "perplexity"],
  ["claude.ai", "claude"],
  ["gemini.google.com", "gemini"],
  ["copilot.microsoft.com", "copilot"],
];

// utm_source values (lowercased, "www." removed). ChatGPT appends utm_source=chatgpt.com
// to links it shows; its referrer is often stripped, so this is the more reliable signal.
const UTM_SOURCES: Readonly<Record<string, AISource>> = {
  "chatgpt.com": "chatgpt",
  chatgpt: "chatgpt",
  "chat.openai.com": "chatgpt",
  openai: "chatgpt",
  "perplexity.ai": "perplexity",
  perplexity: "perplexity",
  "claude.ai": "claude",
  claude: "claude",
  "gemini.google.com": "gemini",
  gemini: "gemini",
  "copilot.microsoft.com": "copilot",
  copilot: "copilot",
};

function sourceFromHost(hostname: string): AISource | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  for (const [suffix, source] of REFERRER_HOSTS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return source;
  }
  return null;
}

/**
 * The AI assistant a page view came from, or null. An explicit utm_source wins over the
 * referrer. `referrer` is document.referrer and `search` is location.search.
 */
export function aiReferral(referrer: string, search: string): AIReferral | null {
  const utm = new URLSearchParams(search).get("utm_source")?.trim().toLowerCase().replace(/^www\./, "");
  if (utm && Object.prototype.hasOwnProperty.call(UTM_SOURCES, utm)) {
    return { source: UTM_SOURCES[utm], signal: "utm" };
  }
  if (referrer) {
    let hostname: string;
    try {
      hostname = new URL(referrer).hostname;
    } catch {
      return null;
    }
    const source = sourceFromHost(hostname);
    if (source) return { source, signal: "referrer" };
  }
  return null;
}

export interface AIReferralEnv {
  gtag: ((...args: unknown[]) => void) | undefined;
  /** sessionStorage, or undefined when unavailable. */
  storage: Pick<Storage, "getItem" | "setItem"> | undefined;
  referrer: string;
  search: string;
}

const SESSION_KEY = "chronicle:ai-referral-checked";

/**
 * On the first page view of a browser session, sends an `ai_referral` event with `ai_source`
 * (and `ai_signal`: referrer or utm) and sets the `ai_source` user property, when the visit
 * came from an AI assistant. Returns the referral it reported, if any. Later page views in
 * the same session do nothing, whatever their referrer. Without gtag (no GA4 ID) it does nothing.
 */
export function trackAIReferral(env: AIReferralEnv): AIReferral | null {
  if (!env.gtag) return null;
  try {
    if (env.storage?.getItem(SESSION_KEY)) return null;
    env.storage?.setItem(SESSION_KEY, "1");
  } catch {
    // Storage can throw (private modes, blocked cookies); report once per page load instead.
  }
  const referral = aiReferral(env.referrer, env.search);
  if (!referral) return null;
  env.gtag("set", "user_properties", { ai_source: referral.source });
  env.gtag("event", "ai_referral", { ai_source: referral.source, ai_signal: referral.signal });
  return referral;
}
