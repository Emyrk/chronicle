import { expect, it } from "vitest";
import { BLOG_POSTS } from "./blogRegistry";
import { blogManifest } from "./prerender";

it("emits independent interaction eligibility for every post", () => {
  const manifest = blogManifest();
  expect(manifest.posts).toHaveLength(BLOG_POSTS.length);
  for (const post of manifest.posts) {
    const source = BLOG_POSTS.find((candidate) => candidate.id === post.id)!;
    expect(post.voting_enabled).toBe(source.votingEnabled !== false);
    expect(post.feedback_enabled).toBe(source.feedbackEnabled !== false);
  }
});

it("serializes voting defaults and independent feature overrides", () => {
  const base = BLOG_POSTS[0];
  const manifest = JSON.parse(JSON.stringify(blogManifest([
    { ...base, id: "vote-only", votingEnabled: true, feedbackEnabled: false },
    { ...base, id: "feedback-only", votingEnabled: false, feedbackEnabled: true },
    { ...base, id: "omitted", votingEnabled: undefined, feedbackEnabled: undefined },
  ])));
  expect(manifest.posts).toEqual([
    expect.objectContaining({ id: "vote-only", voting_enabled: true, feedback_enabled: false }),
    expect.objectContaining({ id: "feedback-only", voting_enabled: false, feedback_enabled: true }),
    expect.objectContaining({ id: "omitted", voting_enabled: true, feedback_enabled: true }),
  ]);
});
