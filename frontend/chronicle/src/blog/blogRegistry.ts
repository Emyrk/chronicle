import type { ComponentType } from "react";
import { BlogLaunchPost } from "./posts/BlogLaunchPost";
import { ReplayMapPost } from "./posts/ReplayMapPost";

export type BlogFlavorSet = readonly string[];

export interface BlogPostDefinition {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  flavorSets?: readonly BlogFlavorSet[];
  component: ComponentType;
}

export const BLOG_POSTS: readonly BlogPostDefinition[] = [
  {
    id: "welcome-to-the-chronicle-blog",
    title: "A home for what is new in Chronicle",
    description: "Release notes, feature tours, and the stories behind improvements to Chronicle.",
    publishedAt: "2026-10-08",
    component: BlogLaunchPost,
  },
  {
    id: "replay-map-panel",
    title: "Follow the fight with the replay map",
    description: "A new replay-aware panel puts movement, positioning, and encounter geography beside the combat log.",
    publishedAt: "2026-10-08",
    component: ReplayMapPost,
  },
] as const;

export function blogPostPath(postID: string): string {
  return `/blog/${postID}`;
}

export function findBlogPost(postID: string | undefined): BlogPostDefinition | undefined {
  return BLOG_POSTS.find((post) => post.id === postID);
}

export function blogPostMatchesFlavor(post: BlogPostDefinition, flavor: readonly string[]): boolean {
  if (!post.flavorSets || post.flavorSets.length === 0) {
    return true;
  }

  const available = new Set(flavor.map((tag) => tag.toLowerCase()));
  return post.flavorSets.some((required) => required.every((tag) => available.has(tag.toLowerCase())));
}

export function blogPostsForFlavor(flavor: readonly string[]): BlogPostDefinition[] {
  return [...BLOG_POSTS]
    .filter((post) => blogPostMatchesFlavor(post, flavor))
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}
