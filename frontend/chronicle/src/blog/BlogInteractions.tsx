import { useState, useSyncExternalStore } from "react";
import { MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import { useBlogMutation, useBlogInteractions, useBlogSummaries, blogFeedbackMutation, type OwnFeedback } from "@/api/blogInteractions";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { BlogPostMetadata } from "./blogRegistry";
import { rarityColor } from "./blogFormat";

const subscribe = () => () => {};
/** Interactions are live only. Keep prerendering and the first hydration render identical. */
export function BlogInteractions({ post }: { post: BlogPostMetadata }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  if (!hydrated || (post.votingEnabled === false && post.feedbackEnabled === false)) return null;
  return <LiveInteractions post={post} />;
}

function LiveInteractions({ post }: { post: BlogPostMetadata }) {
  const { session, isLoading: authLoading } = useAuth();
  const publicQuery = useBlogInteractions(post.id, session?.user_id, authLoading);
  const own = publicQuery;
  const mutation = useBlogMutation(post.id);
  if (publicQuery.data && !publicQuery.data.voting_enabled && !publicQuery.data.feedback_enabled) return null;
  const votingEnabled = post.votingEnabled !== false && publicQuery.data?.voting_enabled;
  const feedbackEnabled = post.feedbackEnabled !== false && publicQuery.data?.feedback_enabled;
  const disabled = mutation.isPending || own.isLoading || !session || !own.data || !own.data.voting_enabled;
  const accent = rarityColor(post.rarity);
  const signInHref = `/login?from=${encodeURIComponent(`/blog/${post.id}`)}`;
  return (
    <>
    {votingEnabled && <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div role="group" aria-label="Vote on this post" className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-2 gap-y-2 rounded-2xl sm:gap-x-3 border-2 bg-card px-3 py-2 sm:rounded-full sm:px-4 sm:py-2.5" style={{ borderColor: accent, boxShadow: `0 8px 32px -4px color-mix(in srgb, ${accent} 60%, transparent)` }}>
        <span className="text-sm font-semibold sm:text-base" style={{ color: accent }}>{own.data?.own_vote ? "Thanks!" : <>Was this<span className="hidden sm:inline"> post</span> helpful?</>}</span>
        <Button className="rounded-full px-3 sm:px-4" variant={own.data?.own_vote === 1 ? "default" : "outline"} aria-pressed={own.data?.own_vote === 1} disabled={disabled} onClick={() => mutation.mutate({ resource: "vote", method: "PUT", body: { vote: own.data?.own_vote === 1 ? 0 : 1 } })}>
          <ThumbsUp className="mr-2 h-4 w-4" /> Helpful{publicQuery.data ? ` · ${publicQuery.data.up_votes}` : ""}
        </Button>
        <Button className="rounded-full px-3 sm:px-4" variant={own.data?.own_vote === -1 ? "default" : "outline"} aria-pressed={own.data?.own_vote === -1} disabled={disabled} onClick={() => mutation.mutate({ resource: "vote", method: "PUT", body: { vote: own.data?.own_vote === -1 ? 0 : -1 } })}>
          <ThumbsDown className="h-4 w-4 sm:mr-2" /><span className="sr-only sm:not-sr-only">Not for me</span>
        </Button>
        {!authLoading && !session && <a href={signInHref} className="px-1 text-xs text-primary underline">Sign in to vote</a>}
        {own.data?.own_vote !== 0 && own.data?.own_vote !== undefined && <span className="hidden px-1 text-xs text-muted-foreground sm:inline">Select your vote again to remove it.</span>}
      </div>
    </div>}
    {(feedbackEnabled || publicQuery.error || mutation.error) && <section aria-label="Post feedback" className="mx-auto mb-12 w-full max-w-3xl px-4 sm:px-10">
      <div className="space-y-6 border-t border-border pt-8">
        <header>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">From the community</p>
          <h2 className="mt-2 font-wow text-2xl">Help shape the next update</h2>
        </header>
        {publicQuery.isLoading && <p role="status">Loading feedback…</p>}
        {publicQuery.error && <p role="alert">{publicQuery.error.message} <Button variant="outline" onClick={() => void publicQuery.refetch()}>Retry</Button></p>}
        {feedbackEnabled && !authLoading && !session && <p className="text-sm text-muted-foreground"><a href={signInHref} className="text-primary underline">Sign in</a> to leave feedback. Public feedback is anonymous.</p>}
        {own.data?.feedback_banned && <p role="status" className="text-sm text-muted-foreground">Your account cannot submit feedback. You can still vote.</p>}
        {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
        {feedbackEnabled && session && own.data && !own.data.feedback_banned && !own.data.own_feedback?.deleted && <FeedbackEditor key={`${session.user_id}:${own.data.own_feedback?.body ?? "new"}:${own.data.own_feedback?.consent ?? false}`} postID={post.id} feedback={own.data.own_feedback ?? null} />}
        {feedbackEnabled && own.data?.own_feedback?.deleted && <p className="text-sm text-muted-foreground">Your feedback was removed by a moderator. This response cannot be recreated.</p>}
        {feedbackEnabled && publicQuery.data && <div className="space-y-4">
          <h3 className="text-sm font-semibold">Community feedback</h3>
          {publicQuery.data.feedback.length === 0 && <p className="text-sm text-muted-foreground">No public feedback yet. Only approved feedback shared with permission appears here.</p>}
          {publicQuery.data.feedback.map((feedback) => <article key={feedback.id} className="border-l-2 border-primary/40 bg-muted/30 px-4 py-3">
            <p className="mb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">Anonymous reader · {feedback.server_relation === "same server" ? "This server" : feedback.server_relation === "different server" ? "Another server" : feedback.server_relation}</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">{feedback.body}</p>
          </article>)}
        </div>}
      </div>
    </section>}
    </>
  );
}

/** Upvote total shown beside the post title. Live only, like the vote bar. */
export function BlogScore({ post }: { post: BlogPostMetadata }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  if (!hydrated || post.votingEnabled === false) return null;
  return <LiveScore postID={post.id} />;
}

function LiveScore({ postID }: { postID: string }) {
  const { session, isLoading: authLoading } = useAuth();
  const { data } = useBlogInteractions(postID, session?.user_id, authLoading);
  if (!data?.voting_enabled || data.up_votes <= 0) return null;
  return <span title={`${data.up_votes} ${data.up_votes === 1 ? "reader" : "readers"} found this helpful`} className="ml-3 inline-flex translate-y-[-0.2em] items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 align-middle font-mono text-sm text-foreground"><ThumbsUp className="h-3.5 w-3.5" aria-hidden />+{data.up_votes}</span>;
}

/** Upvote and public feedback counts for a blog index card. Live only. */
export function BlogCardStats({ post }: { post: BlogPostMetadata }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  if (!hydrated) return null;
  return <LiveCardStats post={post} />;
}

function LiveCardStats({ post }: { post: BlogPostMetadata }) {
  const summary = useBlogSummaries().data?.get(post.id);
  const upVotes = post.votingEnabled === false ? 0 : summary?.up_votes ?? 0;
  const feedback = post.feedbackEnabled !== false ? summary?.public_feedback ?? 0 : 0;
  if (upVotes <= 0 && feedback <= 0) return null;
  return <span className="relative z-10 inline-flex items-center gap-3 font-mono text-xs text-muted-foreground">
    {upVotes > 0 && <span title={`${upVotes} ${upVotes === 1 ? "reader" : "readers"} found this helpful`} className="inline-flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" aria-hidden />+{upVotes}</span>}
    {feedback > 0 && <span title={`${feedback} public ${feedback === 1 ? "response" : "responses"}`} className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" aria-hidden />{feedback}</span>}
  </span>;
}

function FeedbackEditor({ postID, feedback }: { postID: string; feedback: OwnFeedback | null }) {
  const [body, setBody] = useState(feedback?.body ?? "");
  const [consent, setConsent] = useState(feedback?.consent ?? false);
  const mutation = useBlogMutation(postID);
  return <form className="space-y-3 rounded-lg border border-border bg-card p-5" onSubmit={(event) => {
    event.preventDefault();
    mutation.mutate(blogFeedbackMutation(body, consent));
  }}>
    <label htmlFor="blog-feedback" className="block text-sm font-semibold">Your feedback</label>
    <p className="text-xs leading-5 text-muted-foreground">One response per post. Moderators can read it. Your account name is never shown publicly. Editing a published response sends it back for review.</p>
    {feedback && <p className="text-xs text-muted-foreground">Status: {feedback.status}{feedback.consent ? "" : " · private"}</p>}
    <textarea id="blog-feedback" value={body} onChange={(event) => setBody(event.target.value)} maxLength={600} required rows={5} className="styled-scrollbar w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />Allow Chronicle to publish this feedback anonymously after moderation.</label>
    <p className="text-xs text-muted-foreground">{Array.from(body.trim()).length}/300 characters. Leave permission unchecked to keep feedback private. Uncheck and save to withdraw permission.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={mutation.isPending || !body.trim() || Array.from(body.trim()).length > 300}>{mutation.isPending ? "Saving…" : feedback ? "Save feedback" : "Send feedback"}</Button>
    </div>
    {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    {mutation.isSuccess && <p role="status" className="text-sm text-muted-foreground">Feedback saved.</p>}
  </form>;
}
