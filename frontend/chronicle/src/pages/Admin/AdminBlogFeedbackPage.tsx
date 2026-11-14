import { useState } from "react";
import { useAdminBlogInteractions, useAdminBlogMutation } from "@/api/blogInteractions";
import { Button } from "@/components/ui/button";

export function AdminBlogFeedbackPage() {
  const query = useAdminBlogInteractions();
  const mutation = useAdminBlogMutation();
  const [status, setStatus] = useState("pending");
  const feedback = query.data?.feedback.filter((item) => status === "all" || item.status === status) ?? [];
  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <header><p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Journal moderation</p><h1 className="mt-2 text-2xl font-bold">Blog feedback</h1><p className="mt-2 text-sm text-muted-foreground">Author identities are redacted. Only approved responses with publication permission appear publicly.</p></header>
    {query.isLoading && <p role="status">Loading moderation queue…</p>}
    {query.error && <p role="alert">{query.error.message} <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></p>}
    {mutation.error && <p role="alert" className="text-destructive">{mutation.error.message}</p>}
    {query.data && <>
      <section aria-label="Post voting statistics" className="overflow-x-auto styled-scrollbar rounded-lg border border-border">
        <table className="w-full text-left text-sm"><caption className="p-3 text-left font-semibold">Voting, moderator view</caption><thead><tr className="border-b border-border"><th className="p-3">Post</th><th className="p-3">Upvotes</th><th className="p-3">Downvotes</th></tr></thead><tbody>{query.data.posts.map((post) => <tr key={post.post_id} className="border-b border-border last:border-0"><td className="p-3"><a href={`/blog/${encodeURIComponent(post.post_id)}`} className="text-primary hover:underline">{post.post_id}</a></td><td className="p-3 tabular-nums">{post.upvotes}</td><td className="p-3 tabular-nums">{post.downvotes}</td></tr>)}</tbody></table>
      </section>
      <div className="flex items-center gap-3"><label htmlFor="feedback-status" className="text-sm font-medium">Review status</label><select id="feedback-status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">{["pending", "approved", "rejected", "all"].map((value) => <option key={value} value={value}>{value}</option>)}</select><span className="text-sm text-muted-foreground">{feedback.length} responses</span></div>
      {feedback.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No feedback in this queue.</p>}
      {feedback.map((item) => <article key={item.id} className="space-y-4 rounded-lg border border-border bg-card p-5">
        <header className="flex flex-wrap justify-between gap-2"><div><a href={`/blog/${encodeURIComponent(item.post_id)}`} className="font-semibold text-primary hover:underline">{item.post_id}</a><p className="mt-1 text-xs text-muted-foreground">{item.author_label} · {new Date(item.created_at).toLocaleString()}</p></div><p className="text-xs text-muted-foreground">{item.status} · {item.publication_consent ? "Publication allowed" : "Private feedback"}{item.banned ? " · Author banned" : ""}</p></header>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={mutation.isPending || !item.publication_consent || item.banned || item.status === "approved"} onClick={() => mutation.mutate({ path: `feedback/${item.id}`, method: "PATCH", body: { status: "approved", expected_updated_at: item.updated_at } })}>Approve publication</Button>
          <Button variant="outline" disabled={mutation.isPending || item.status === "rejected"} onClick={() => mutation.mutate({ path: `feedback/${item.id}`, method: "PATCH", body: { status: "rejected", expected_updated_at: item.updated_at } })}>Reject</Button>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => { if (window.confirm("Delete this feedback permanently?")) mutation.mutate({ path: `feedback/${item.id}`, method: "DELETE" }); }}>Delete</Button>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => { if (window.confirm(item.banned ? "Restore this author's ability to submit votes and feedback?" : "Ban this author from blog interactions?")) mutation.mutate({ path: `users/${encodeURIComponent(item.user_id)}/ban`, method: "PUT", body: { banned: !item.banned } }); }}>{item.banned ? "Unban author" : "Ban author"}</Button>
        </div>
      </article>)}
    </>}
  </div>;
}
