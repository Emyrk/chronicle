import { expect, it } from "vitest";
import { BLOG_POSTS } from "./blogRegistry";
import { blogManifest } from "./prerender";

it("emits independent fail-closed interaction eligibility for every post", () => {
  const manifest = blogManifest();
  expect(manifest.posts).toHaveLength(BLOG_POSTS.length);
  for (const post of manifest.posts) {
    const source = BLOG_POSTS.find((candidate) => candidate.id === post.id)!;
    expect(post.voting_enabled).toBe(source.votingEnabled === true);
    expect(post.feedback_enabled).toBe(source.feedbackEnabled === true);
  }
});
