import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import type { AdminBlogInteractions } from "@/api/blogInteractions";
import { AdminBlogFeedbackPage } from "./AdminBlogFeedbackPage";

it("shows author identity, private approval, and moderator-only downvote totals", () => {
  const client = new QueryClient();
  const data: AdminBlogInteractions = [{ id: "feedback-1", updated_at: "2026-01-01T00:00:00Z", post_slug: "test", user_id: "opaque-user-id", tenant_id: "opaque-tenant-id", body: "<script>bad()</script>", status: "pending", consent: false, deleted: false, author_username: "Raidleader", author_discord_id: "123456789012345678" }];
  client.setQueryData(["admin", "blogInteractions"], data);
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><AdminBlogFeedbackPage /></MemoryRouter></QueryClientProvider>);
  expect(markup).toContain("opaque-user-id");
  expect(markup).toContain("Raidleader");
  expect(markup).toContain("https://discord.com/users/123456789012345678");
  expect(markup).not.toContain("opaque-tenant-id");
  expect(markup).toContain("Downvotes");
  // Private feedback can still be approved so it leaves the pending queue.
  expect(markup).toMatch(/<button(?![^>]*disabled="")[^>]*>Approve \(stays private\)<\/button>/);
  expect(markup).not.toContain("Approve publication");
  expect(markup).toContain("&lt;script&gt;");
  expect(markup).not.toContain("<script>");
  expect(markup).toContain("Ban author");
  client.clear();
});

it("labels approval of publishable feedback and missing author details", () => {
  const client = new QueryClient();
  const data: AdminBlogInteractions = [{ id: "feedback-2", updated_at: "2026-01-01T00:00:00Z", post_slug: "test", user_id: "u", tenant_id: "t", body: "public please", status: "pending", consent: true, deleted: false, author_username: "", author_discord_id: "" }];
  client.setQueryData(["admin", "blogInteractions"], data);
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><AdminBlogFeedbackPage /></MemoryRouter></QueryClientProvider>);
  expect(markup).toMatch(/<button(?![^>]*disabled="")[^>]*>Approve publication<\/button>/);
  expect(markup).not.toContain("stays private");
  expect(markup).toContain("Unknown account");
  expect(markup).toContain("Not linked");
  client.clear();
});
