import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { BlogInteractions } from "./BlogInteractions";
import type { BlogPostMetadata } from "./blogRegistry";

const state = vi.hoisted(() => ({ authenticated: false, banned: false, vote: 0 }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useSyncExternalStore: () => true }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: state.authenticated ? { user_id: "secret-user" } : undefined, isLoading: false }) }));
vi.mock("@/api/blogInteractions", () => ({
  useBlogInteractions: () => ({ data: { enabled: true, up_votes: 12, down_votes: 987654, own_vote: state.vote, feedback_banned: state.banned, feedback: [{ id: "public", body: "Good <script>alert(1)</script>", server_relation: "This server" }] } }),
  useBlogMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
const post: BlogPostMetadata = { id: "test", title: "Test", description: "", publishedAt: "2026-01-01", rarity: "common", tag: "Docs", icon: "book", votingEnabled: true, feedbackEnabled: true };
beforeEach(() => { state.authenticated = false; state.banned = false; state.vote = 0; });
it("shows anonymous approved feedback and upvotes but never downvote totals", () => {
  const markup = renderToStaticMarkup(<BlogInteractions post={post} />);
  expect(markup).toContain("Anonymous reader · This server");
  expect(markup).toContain("Helpful · 12");
  expect(markup).not.toContain("987654");
  expect(markup).toContain("&lt;script&gt;");
  expect(markup).toContain('/login?from=%2Fblog%2Ftest');
  expect(markup).not.toContain("Your feedback");
});
it("keeps omitted features absent without requiring interaction data", () => {
  expect(renderToStaticMarkup(<BlogInteractions post={{ ...post, votingEnabled: undefined, feedbackEnabled: undefined }} />)).toBe("");
  const markup = renderToStaticMarkup(<BlogInteractions post={{ ...post, votingEnabled: false }} />);
  expect(markup).not.toContain("Helpful");
  expect(markup).toContain("Community feedback");
});
it("starts publication permission unchecked and offers reversible votes", () => {
  state.authenticated = true;
  state.vote = -1;
  const markup = renderToStaticMarkup(<BlogInteractions post={post} />);
  expect(markup).toContain("Your feedback");
  expect(markup).toContain("Select your vote again to remove it.");
  expect(markup).not.toContain('checked=""');
  expect(markup).not.toContain("secret-user");
});
it("hides submission form for banned users", () => {
  state.authenticated = true;
  state.banned = true;
  const markup = renderToStaticMarkup(<BlogInteractions post={post} />);
  expect(markup).toContain("Your account cannot submit");
  expect(markup).not.toContain("Send feedback");
});
