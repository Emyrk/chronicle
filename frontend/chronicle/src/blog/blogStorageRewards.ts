import type { BlogStorageReward } from "@/api/typesGenerated";
export type { BlogStorageReward } from "@/api/typesGenerated";

type Category = "vote" | "feedback";
const amount = (category: Category) => category === "vote" ? 2 : 5;

function active(reward: BlogStorageReward, now: number): boolean {
  return !!reward.expires_at && Date.parse(reward.expires_at) > now;
}

/** Only a first qualifying interaction earns or refreshes a category, never toggles or edits. */
export function blogRewardSuccessMessage(reward: BlogStorageReward | undefined, category: Category, qualifying: boolean, now = Date.now()): string | undefined {
  if (!qualifying || !reward?.eligible) return undefined;
  return `${category === "vote" ? "Vote" : "Feedback"} storage reward ${active(reward, now) ? "refreshed" : "earned"}: +${amount(category)} MB for 60 days. This reward does not stack across posts.`;
}
