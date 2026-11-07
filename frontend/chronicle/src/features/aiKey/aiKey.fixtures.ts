import type { AIKey, AIKeyBenefits, AIKeyUsage } from "@/api/typesGenerated";

// Mirrors internal/aikey/tiers.go for stories.
export const AI_KEY_TIERS: AIKeyBenefits[] = [
  { tier: "free", lifetime_hours: [1, 24], views_per_minute: 30, views_per_day: 1_000, results_per_search: 25, private_data: true },
  { tier: "honored", lifetime_hours: [1, 24, 168], views_per_minute: 60, views_per_day: 3_000, results_per_search: 100, private_data: true },
  { tier: "revered", lifetime_hours: [1, 24, 168, 720], views_per_minute: 120, views_per_day: 10_000, results_per_search: 100, private_data: true },
  { tier: "exalted", lifetime_hours: [1, 24, 168, 720, 2160], views_per_minute: 240, views_per_day: 25_000, results_per_search: 100, private_data: true },
];

const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

export const activeAIKey: AIKey = {
  id: "5b0c6f8e-1f7e-4d55-9a0c-2b8f8d1e0001",
  created_at: at(-5 * HOUR),
  expires_at: at(19 * HOUR),
  expired: false,
  private_data: false,
  last_used_at: at(-0.2 * HOUR),
  last_user_agent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  request_count: 42,
};

export const expiredAIKey: AIKey = {
  ...activeAIKey,
  created_at: at(-30 * HOUR),
  expires_at: at(-6 * HOUR),
  expired: true,
};

export function aiKeyUsage(tier: string, key?: AIKey): AIKeyUsage {
  const benefits = AI_KEY_TIERS.find((t) => t.tier === tier) ?? AI_KEY_TIERS[0];
  return { key, views_remaining_today: key ? benefits.views_per_day - key.request_count : benefits.views_per_day, benefits, tiers: AI_KEY_TIERS };
}
