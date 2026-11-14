import { useState } from "react";
import { blogModerationMutation, useAdminBlogInteractions, useAdminBlogMutation, useAdminBlogVotes } from "@/api/blogInteractions";
import { BLOG_POSTS } from "@/blog/blogRegistry";
import { Button } from "@/components/ui/button";

function PostVotes({ slug }: { slug: string }) {
  const query = useAdminBlogVotes(slug);
  return <tr className="border-b border-border last:border-0">
    <td className="p-3"><a href={`/blog/${encodeURIComponent(slug)}`} className="text-primary hover:underline">{slug}</a></td>
    <td className="p-3 tabular-nums">{query.data?.up_votes ?? (query.isError ? "Unavailable" : "…")}</td>
    <td className="p-3 tabular-nums">{query.data?.down_votes ?? (query.isError ? "Unavailable" : "…")}</td>
  </tr>;
}

export function AdminBlogFeedbackPage() {
  const query = useAdminBlogInteractions();
  const mutation = useAdminBlogMutation();
  const [status, setStatus] = useState("pending");
  const feedback = query.data?.filter((item) => status === "all" || (status === "deleted" ? item.deleted : !item.deleted && item.status === status)) ?? [];
  const postIDs = [...new Set([...BLOG_POSTS.filter((post) => post.votingEnabled).map((post) => post.id), ...(query.data ?? []).map((item) => item.post_slug)])];
  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <header>
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Journal moderation</p>
      <h1 className="mt-2 text-2xl font-bold">Blog feedback</h1>
      <p className="mt-2 text-sm text-muted-foreground">Author names are redacted. Only approved responses with publication permission appear publicly.</p>
    </header>
    {query.isLoading && <p role="status">Loading moderation queue…</p>}
    {query.error && <p role="alert">{query.error.message} <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></p>}
    {mutation.error && <p role="alert" className="text-destructive">{mutation.error.message}</p>}
    {query.data && <>
      <section aria-label="Post voting statistics" className="overflow-x-auto styled-scrollbar rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <caption className="p-3 text-left font-semibold">Voting, moderator view</caption>
          <thead><tr className="border-b border-border"><th className="p-3">Post</th><th className="p-3">Upvotes</th><th className="p-3">Downvotes</th></tr></thead>
          <tbody>{postIDs.map((slug) => <PostVotes key={slug} slug={slug} />)}</tbody>
        </table>
      </section>
      <div className="flex items-center gap-3">
        <label htmlFor="feedback-status" className="text-sm font-medium">Review status</label>
        <select id="feedback-status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          {["pending", "approved", "rejected", "deleted", "all"].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{feedback.length} responses</span>
      </div>
      {feedback.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No feedback in this queue.</p>}
      {feedback.map((item) => <article key={item.id} className="space-y-4 rounded-lg border border-border bg-card p-5">
        <header className="flex flex-wrap justify-between gap-2">
          <div><a href={`/blog/${encodeURIComponent(item.post_slug)}`} className="font-semibold text-primary hover:underline">{item.post_slug}</a><p className="mt-1 break-all font-mono text-xs text-muted-foreground">User {item.user_id}</p></div>
          <p className="text-xs text-muted-foreground">{item.deleted ? "Deleted" : item.status} · {item.consent ? "Publication allowed" : "Private feedback"}</p>
        </header>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={mutation.isPending || !item.consent || item.deleted || item.status === "approved"} onClick={() => mutation.mutate(blogModerationMutation(item.id, "approve", item.updated_at))}>Approve publication</Button>
          <Button variant="outline" disabled={mutation.isPending || item.deleted || item.status === "rejected"} onClick={() => mutation.mutate(blogModerationMutation(item.id, "reject", item.updated_at))}>Reject</Button>
          <Button variant="outline" disabled={mutation.isPending || item.deleted} onClick={() => { if (window.confirm("Soft-delete this feedback? The response slot remains reserved.")) mutation.mutate({ path: `feedback/${item.id}/delete`, method: "POST" }); }}>Delete</Button>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => { if (window.confirm("Ban this author from submitting blog feedback?")) mutation.mutate({ path: `users/${encodeURIComponent(item.user_id)}/ban`, method: "POST" }); }}>Ban author</Button>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => { if (window.confirm("Restore this author's ability to submit blog feedback?")) mutation.mutate({ path: `users/${encodeURIComponent(item.user_id)}/unban`, method: "POST" }); }}>Unban author</Button>
        </div>
      </article>)}
    </>}
  </div>;
}
