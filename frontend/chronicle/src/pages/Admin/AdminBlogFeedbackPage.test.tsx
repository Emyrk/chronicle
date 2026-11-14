import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import type { AdminBlogInteractions } from "@/api/blogInteractions";
import { AdminBlogFeedbackPage } from "./AdminBlogFeedbackPage";

it("shows redacted review labels and moderator-only downvote totals", () => {
  const client = new QueryClient();
  const data: AdminBlogInteractions = [{ id: "feedback-1", post_slug: "test", user_id: "opaque-user-id", tenant_id: "opaque-tenant-id", body: "<script>bad()</script>", status: "pending", consent: false, deleted: false }];
  client.setQueryData(["admin", "blogInteractions"], data);
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><AdminBlogFeedbackPage /></MemoryRouter></QueryClientProvider>);
  expect(markup).toContain("opaque-user-id");
  expect(markup).not.toContain("opaque-tenant-id");
  expect(markup).toContain("Downvotes");
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Approve publication<\/button>/);
  expect(markup).toContain("&lt;script&gt;");
  expect(markup).not.toContain("<script>");
  expect(markup).toContain("Ban author");
  client.clear();
});
