import type { AIKeyBenefits } from "@/api/typesGenerated";

export function formatExpiry(date: Date): string {
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** pickLifetime keeps a remembered lifetime only if the tier still offers it. */
export function pickLifetime(benefits: AIKeyBenefits | undefined, remembered: number | null): number {
  const options = benefits?.lifetime_hours ?? [];
  if (remembered && options.includes(remembered)) return remembered;
  if (options.includes(24)) return 24;
  return options[0] ?? 24;
}

export type AIKeyBannerKind = "owner" | "other";

/** owner: this browser made the key in the link. other: someone else's key, or this user's from another device. */
export function aiKeyBannerKind(key: string | null, storedSecret: string | null | undefined): AIKeyBannerKind | null {
  if (key === null) return null;
  return storedSecret && storedSecret === key ? "owner" : "other";
}

/** clientName names the chat AI from the fetcher's user-agent. */
export function clientName(userAgent: string | undefined): string {
  if (!userAgent) return "None yet";
  const known: [RegExp, string][] = [
    [/ChatGPT-User|OpenAI/i, "ChatGPT"],
    [/Claude-User|Claude/i, "Claude"],
    [/Perplexity/i, "Perplexity"],
    [/Grok|xAI/i, "Grok"],
    [/Google-Extended|Gemini/i, "Gemini"],
  ];
  return known.find(([re]) => re.test(userAgent))?.[1] ?? userAgent;
}
