import type { BlogPostDefinition } from "../blogRegistry";
import { RatingsLaunchPost } from "./ratings";

/**
 * Launch-day metadata. The post is not registered yet; on launch, add this to blog-posts.json (with
 * the real date), map "ratings" to RatingsLaunchPost in BLOG_COMPONENTS, and the video in BLOG_VIDEOS.
 */
export const RATINGS_LAUNCH_POST: BlogPostDefinition = {
  id: "ratings",
  title: "Ratings: Peak, Ranked Mastery, and Renown",
  description:
    "Three ratings built from all of your kills: your best (Peak), what you reliably deliver (Ranked Mastery), and your raiding career (Renown). Plus rebuilt leaderboards, guild ratings, and a realm picker.",
  publishedAt: "2026-11-15",
  rarity: "legendary",
  tag: "Feature",
  icon: "inv_misc_head_dragon_01",
  flavor: "Bragging rights, with receipts.",
  // On launch, register the same video in BLOG_VIDEOS.
  video: {
    load: () => import("@/pages/Instance/videos/RatingsLaunch.video"),
    durationInFrames: 1110,
    fps: 30,
    width: 1280,
    height: 720,
  },
  component: RatingsLaunchPost,
};
