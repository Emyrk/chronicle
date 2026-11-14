import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { BlogAdminFeedback, BlogAdminVotes, BlogInteractions, BlogOwnFeedback, BlogVoteRequest, BlogFeedbackRequest, BlogModerationRequest } from "./typesGenerated";
export type OwnFeedback = BlogOwnFeedback;
export type AdminBlogInteractions = readonly BlogAdminFeedback[];

export async function blogRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || `Request failed (${response.status}). Please try again.`);
  }
  return response.status === 204 ? undefined as T : response.json();
}
const base = (id: string) => `/api/v1/blog/${encodeURIComponent(id)}`;
export function useBlogInteractions(id: string, userID: string | undefined, authLoading: boolean) {
  return useQuery({
    queryKey: ["blogInteractions", id, userID ?? "anonymous"],
    queryFn: () => blogRequest<BlogInteractions>(`${base(id)}/interactions`),
    enabled: !authLoading,
    retry: false,
  });
}
export function useAdminBlogVotes(id: string) {
  return useQuery({ queryKey: ["admin", "blogVotes", id], queryFn: () => blogRequest<BlogAdminVotes>(`/api/v1/admin/blog/${encodeURIComponent(id)}/votes`), retry: false });
}
export function useBlogMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ resource, method, body }: { resource: "vote"; method: "PUT"; body: BlogVoteRequest } | { resource: "feedback"; method: "PUT"; body: BlogFeedbackRequest }) => blogRequest(`${base(id)}/${resource}`, method, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["blogInteractions", id] }),
  });
}
export function useAdminBlogInteractions() {
  return useQuery({ queryKey: ["admin", "blogInteractions"], queryFn: () => blogRequest<AdminBlogInteractions>("/api/v1/admin/blog/feedback"), retry: false });
}
export function useAdminBlogMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: "POST"; body?: unknown }) => blogRequest(`/api/v1/admin/blog/${path}`, method, body),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["admin", "blogInteractions"] }), client.invalidateQueries({ queryKey: ["blogInteractions"] })]);
    },
  });
}

export function blogFeedbackMutation(body: string, consent: boolean) {
  return { resource: "feedback" as const, method: "PUT" as const, body: { body: body.trim(), consent } satisfies BlogFeedbackRequest };
}

export function blogModerationMutation(id: string, action: "approve" | "reject", updatedAt: string) {
  return { path: `feedback/${encodeURIComponent(id)}/${action}`, method: "POST" as const, body: { expected_updated_at: updatedAt } satisfies BlogModerationRequest };
}
