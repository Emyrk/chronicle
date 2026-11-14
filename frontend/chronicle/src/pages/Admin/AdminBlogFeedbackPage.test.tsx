import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import type { AdminBlogInteractions } from "@/api/blogInteractions";
import { AdminBlogFeedbackPage } from "./AdminBlogFeedbackPage";

it("shows redacted review labels and moderator-only downvote totals", () => {
  const client = new QueryClient();
  const data: AdminBlogInteractions = {
    posts: [{ post_id: "test", upvotes: 12, downvotes: 7 }],
    feedback: [{ id: "feedback-1", post_id: "test", user_id: "private-user-id", author_label: "Reader a1b2", body: "<script>bad()</script>", status: "pending", publication_consent: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", banned: false }],
  };
  client.setQueryData(["admin", "blogInteractions"], data);
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><AdminBlogFeedbackPage /></MemoryRouter></QueryClientProvider>);
  expect(markup).toContain("Reader a1b2");
  expect(markup).not.toContain("private-user-id");
  expect(markup).toContain("Downvotes");
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Approve publication<\/button>/);
  expect(markup).toContain("&lt;script&gt;");
  expect(markup).not.toContain("<script>");
  expect(markup).toContain("Ban author");
  client.clear();
});
