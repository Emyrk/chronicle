import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { BlogCardStats, BlogInteractions, BlogScore } from "./BlogInteractions";
import type { BlogPostMetadata } from "./blogRegistry";

const state = vi.hoisted(() => ({ authenticated: false, banned: false, vote: 0, feedback: null as null | { id: string; body: string; status: string; deleted: boolean; consent: boolean } }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useSyncExternalStore: () => true }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: state.authenticated ? { user_id: "secret-user" } : undefined, isLoading: false }) }));
vi.mock("@/api/blogInteractions", () => ({
  useBlogInteractions: () => ({ data: { voting_enabled: true, feedback_enabled: true, own_feedback: state.feedback, up_votes: 12, down_votes: 987654, own_vote: state.vote, feedback_banned: state.banned, feedback: [{ id: "public", body: "Good <script>alert(1)</script>", server_relation: "This server" }] } }),
  useBlogMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useBlogSummaries: () => ({ data: new Map([["test", { slug: "test", up_votes: 7, public_feedback: 3 }]]) }),
}));
const post: BlogPostMetadata = { id: "test", title: "Test", description: "", publishedAt: "2026-01-01", rarity: "common", tag: "Docs", icon: "book", votingEnabled: true, feedbackEnabled: true };
beforeEach(() => { state.authenticated = false; state.banned = false; state.vote = 0; state.feedback = null; });
it("shows anonymous approved feedback and upvotes but never downvote totals", () => {
  const markup = renderToStaticMarkup(<BlogInteractions post={post} />);
  expect(markup).toContain("Anonymous reader · This server");
  expect(markup).toContain("Helpful · 12");
  expect(markup).not.toContain("987654");
  expect(markup).toContain("&lt;script&gt;");
  expect(markup).toContain('/login?from=%2Fblog%2Ftest');
  expect(markup).not.toContain("Your feedback");
});
it("defaults to voting only and honors explicit voting opt-out", () => {
  const defaults = renderToStaticMarkup(<BlogInteractions post={{ ...post, votingEnabled: undefined, feedbackEnabled: undefined }} />);
  expect(defaults).toContain("Helpful · 12");
  expect(defaults).not.toContain("Community feedback");
  expect(renderToStaticMarkup(<BlogInteractions post={{ ...post, votingEnabled: false, feedbackEnabled: false }} />)).toBe("");
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

it("allows saving existing private feedback without publication consent", () => {
  state.authenticated = true;
  state.feedback = { id: "own", body: "Private suggestion", status: "pending", deleted: false, consent: false };
  const markup = renderToStaticMarkup(<BlogInteractions post={post} />);
  expect(markup).toContain("Private suggestion");
  expect(markup).not.toMatch(/<input[^>]*type="checkbox"[^>]*required/);
  expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Save feedback<\/button>/);
  expect(markup).not.toContain('checked=""');
  expect(markup).toContain("withdraw permission");
});
it("restores existing publication consent when editing", () => {
  state.authenticated = true;
  state.feedback = { id: "own", body: "Published suggestion", status: "approved", deleted: false, consent: true };
  const markup = renderToStaticMarkup(<BlogInteractions post={post} />);
  expect(markup).toContain('checked=""');
  expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Save feedback<\/button>/);
});

it("shows the upvote score for the title and hides it when voting is off", () => {
  expect(renderToStaticMarkup(<BlogScore post={post} />)).toContain("+12");
  expect(renderToStaticMarkup(<BlogScore post={{ ...post, votingEnabled: false }} />)).toBe("");
});

it("shows index card counts only for enabled interactions", () => {
  const both = renderToStaticMarkup(<BlogCardStats post={post} />);
  expect(both).toContain("+7");
  expect(both).toContain("3 public responses");
  const voteOnly = renderToStaticMarkup(<BlogCardStats post={{ ...post, feedbackEnabled: false }} />);
  expect(voteOnly).toContain("+7");
  expect(voteOnly).not.toContain("public responses");
  expect(renderToStaticMarkup(<BlogCardStats post={{ ...post, id: "other" }} />)).toBe("");
});
