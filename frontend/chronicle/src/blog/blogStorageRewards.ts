import type { BlogStorageReward } from "@/api/typesGenerated";
export type { BlogStorageReward } from "@/api/typesGenerated";

type Category = "vote" | "feedback";
const amount = (category: Category) => category === "vote" ? 2 : 5;

function active(reward: BlogStorageReward, now: number): boolean {
  return !!reward.expires_at && Date.parse(reward.expires_at) > now;
}

export function blogRewardDescription(reward: BlogStorageReward, category: Category, canEarn: boolean, now: number): string {
  const label = category === "vote" ? "Vote" : "Feedback";
  const mb = amount(category);
  const isActive = active(reward, now);
  const expiry = reward.expires_at && Number.isFinite(Date.parse(reward.expires_at))
    ? new Date(reward.expires_at).toLocaleString() : undefined;
  const status = isActive ? `${label}: +${mb} MB active. Expires ${expiry}.` : expiry ? `${label}: +${mb} MB expired ${expiry}.` : `${label}: +${mb} MB storage reward.`;
  if (reward.eligible && canEarn) {
    return `${status} ${isActive ? "Refresh" : "Earn"} it for 60 days by ${category === "vote" ? "voting either way" : "sending feedback, private or public"} on this post.`;
  }
  return `${status} ${reward.eligible ? "Feedback rewards are unavailable for this post." : "Already earned on this post. Interact with a different eligible post to refresh it."}`;
}

/** Only a first qualifying interaction earns or refreshes a category, never toggles or edits. */
export function blogRewardSuccessMessage(reward: BlogStorageReward | undefined, category: Category, qualifying: boolean, now = Date.now()): string | undefined {
  if (!qualifying || !reward?.eligible) return undefined;
  return `${category === "vote" ? "Vote" : "Feedback"} storage reward ${active(reward, now) ? "refreshed" : "earned"}: +${amount(category)} MB for 60 days. This reward does not stack across posts.`;
}
