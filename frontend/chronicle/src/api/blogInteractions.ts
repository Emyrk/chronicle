import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Wire contracts are replaced by generated SDK imports when the API lands.
export interface PublicFeedback { id: string; body: string; created_at: string }
export interface OwnFeedback extends PublicFeedback { publication_consent: boolean; status: string; updated_at: string }
export interface BlogPublicInteractions { upvotes: number; feedback: PublicFeedback[] }
export interface BlogOwnInteractions { vote: number; feedback: OwnFeedback | null; banned: boolean }
export interface AdminBlogFeedback extends OwnFeedback { post_id: string; user_id: string; author_label: string; banned: boolean }
export interface AdminBlogInteractions { feedback: AdminBlogFeedback[]; posts: { post_id: string; upvotes: number; downvotes: number }[] }

export async function blogRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || `Request failed (${response.status}). Please try again.`);
  }
  return response.status === 204 ? undefined as T : response.json();
}
const base = (id: string) => `/api/v1/blog/posts/${encodeURIComponent(id)}/interactions`;
export function useBlogPublic(id: string) {
  return useQuery({ queryKey: ["blogInteractions", id, "public"], queryFn: () => blogRequest<BlogPublicInteractions>(base(id)), retry: false });
}
export function useBlogOwn(id: string, userID: string | undefined) {
  return useQuery({ queryKey: ["blogInteractions", id, "me", userID], queryFn: () => blogRequest<BlogOwnInteractions>(`${base(id)}/me`), enabled: !!userID, retry: false });
}
export function useBlogMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ resource, method, body }: { resource: "vote" | "feedback"; method: "PUT" | "DELETE"; body?: unknown }) => blogRequest(`${base(id)}/${resource}`, method, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["blogInteractions", id] }),
  });
}
export function useAdminBlogInteractions() {
  return useQuery({ queryKey: ["admin", "blogInteractions"], queryFn: () => blogRequest<AdminBlogInteractions>("/api/v1/admin/blog/feedback"), retry: false });
}
export function useAdminBlogMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: "PATCH" | "PUT" | "DELETE"; body?: unknown }) => blogRequest(`/api/v1/admin/blog/${path}`, method, body),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["admin", "blogInteractions"] }), client.invalidateQueries({ queryKey: ["blogInteractions"] })]);
    },
  });
}
