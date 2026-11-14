import { useState, useSyncExternalStore } from "react";
import { MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import { useBlogMutation, useBlogInteractions, useBlogSummaries, blogFeedbackMutation, type OwnFeedback } from "@/api/blogInteractions";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { BlogPostMetadata } from "./blogRegistry";

const subscribe = () => () => {};
const FEEDBACK_SECTION_ID = "feedback";

/** Scrolls to the feedback section and focuses the editor when the reader can write. */
function jumpToFeedback() {
  document.getElementById(FEEDBACK_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => document.getElementById("blog-feedback")?.focus({ preventScroll: true }), 450);
}

function serverRelationLabel(relation: string): string {
  if (relation === "same server") return "This server";
  if (relation === "different server") return "Another server";
  return relation;
}

function feedbackStatusLabel(feedback: OwnFeedback): string {
  if (feedback.status === "approved") return feedback.consent ? "Published" : "Approved · private";
  if (feedback.status === "rejected") return "Not published";
  return feedback.consent ? "In review" : "Private";
}
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
  const signInHref = `/login?from=${encodeURIComponent(`/blog/${post.id}`)}`;
  const publicFeedback = publicQuery.data?.feedback ?? [];
  return (
    <>
    {(votingEnabled || feedbackEnabled) && <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div role="group" aria-label="Vote on this post" className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/15 bg-neutral-700 px-3 py-2 shadow-xl shadow-black/50">
        {votingEnabled && <>
          <Button size="sm" className="rounded-full" variant={own.data?.own_vote === 1 ? "default" : "outline"} aria-pressed={own.data?.own_vote === 1} disabled={disabled} onClick={() => mutation.mutate({ resource: "vote", method: "PUT", body: { vote: own.data?.own_vote === 1 ? 0 : 1 } })}>
            <ThumbsUp className="mr-2 h-4 w-4" /> Helpful{publicQuery.data ? ` · ${publicQuery.data.up_votes}` : ""}
          </Button>
          <Button size="sm" className="rounded-full" variant={own.data?.own_vote === -1 ? "default" : "outline"} aria-pressed={own.data?.own_vote === -1} disabled={disabled} onClick={() => mutation.mutate({ resource: "vote", method: "PUT", body: { vote: own.data?.own_vote === -1 ? 0 : -1 } })}>
            <ThumbsDown className="h-4 w-4 sm:mr-2" /><span className="sr-only sm:not-sr-only">Not for me</span>
          </Button>
        </>}
        {votingEnabled && feedbackEnabled && <span aria-hidden className="mx-0.5 h-5 w-px bg-white/15" />}
        {feedbackEnabled && <Button size="sm" className="rounded-full" variant="outline" onClick={jumpToFeedback}>
          <MessageSquare className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Feedback</span>{publicFeedback.length > 0 && <span><span className="hidden sm:inline">· </span>{publicFeedback.length}</span>}
        </Button>}
        {votingEnabled && !authLoading && !session && <a href={signInHref} className="px-1 text-xs text-primary underline">Sign in to vote</a>}
        {own.data?.own_vote !== 0 && own.data?.own_vote !== undefined && <span className="hidden px-1 text-xs text-muted-foreground lg:inline">Select your vote again to remove it.</span>}
      </div>
    </div>}
    {(feedbackEnabled || publicQuery.error || mutation.error) && <section id={FEEDBACK_SECTION_ID} aria-label="Post feedback" className="mx-auto mb-12 w-full max-w-3xl scroll-mt-8 px-4 sm:px-10">
      <div className="space-y-6 border-t border-border pt-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">From the community</p>
            <h2 className="mt-2 font-wow text-2xl">Help shape the next update</h2>
          </div>
          {feedbackEnabled && publicQuery.data && <span className="font-mono text-xs text-muted-foreground">{publicFeedback.length} public {publicFeedback.length === 1 ? "response" : "responses"}</span>}
        </header>
        {publicQuery.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading feedback…</p>}
        {publicQuery.error && <p role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">{publicQuery.error.message} <Button size="sm" variant="outline" onClick={() => void publicQuery.refetch()}>Retry</Button></p>}
        {feedbackEnabled && publicQuery.data && <div className="space-y-3">
          <h3 className="sr-only">Community feedback</h3>
          {publicFeedback.length === 0 && <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No public feedback yet. Approved feedback shared with permission appears here.</p>}
          {publicFeedback.map((feedback) => <article key={feedback.id} className="rounded-lg border border-border bg-card px-4 py-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">Anonymous reader</span>
              <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{serverRelationLabel(feedback.server_relation)}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-foreground">{feedback.body}</p>
          </article>)}
        </div>}
        {feedbackEnabled && !authLoading && !session && <p className="rounded-lg border border-border bg-card px-4 py-4 text-sm text-muted-foreground"><a href={signInHref} className="font-medium text-primary underline">Sign in</a> to leave feedback. Public feedback is anonymous.</p>}
        {own.data?.feedback_banned && <p role="status" className="text-sm text-muted-foreground">Your account cannot submit feedback. You can still vote.</p>}
        {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
        {feedbackEnabled && session && own.data && !own.data.feedback_banned && !own.data.own_feedback?.deleted && <FeedbackEditor key={`${session.user_id}:${own.data.own_feedback?.body ?? "new"}:${own.data.own_feedback?.consent ?? false}`} postID={post.id} feedback={own.data.own_feedback ?? null} />}
        {feedbackEnabled && own.data?.own_feedback?.deleted && <p className="text-sm text-muted-foreground">Your feedback was removed by a moderator. This response cannot be recreated.</p>}
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
  const length = Array.from(body.trim()).length;
  const tooLong = length > 300;
  return <form className="space-y-4 rounded-lg border border-border bg-card p-5" onSubmit={(event) => {
    event.preventDefault();
    mutation.mutate(blogFeedbackMutation(body, consent));
  }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor="blog-feedback" className="text-sm font-semibold">Your feedback</label>
      {feedback && <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{feedbackStatusLabel(feedback)}</span>}
    </div>
    <textarea id="blog-feedback" value={body} onChange={(event) => setBody(event.target.value)} maxLength={600} required rows={4} placeholder="What worked, what was confusing, what should come next?" className="styled-scrollbar w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary" />
      <span>Allow Chronicle to publish this anonymously after moderation.<span className="mt-0.5 block text-xs text-muted-foreground">Leave unchecked to keep it private. Uncheck and save to withdraw permission.</span></span>
    </label>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-xs leading-5 text-muted-foreground">One response per post. Your name is never shown. Edits go back to review.</p>
      <div className="ml-auto flex items-center gap-3">
        <span className={`font-mono text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}>{length}/300</span>
        <Button type="submit" disabled={mutation.isPending || !body.trim() || tooLong}>{mutation.isPending ? "Saving…" : feedback ? "Save feedback" : "Send feedback"}</Button>
      </div>
    </div>
    {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    {mutation.isSuccess && <p role="status" className="text-sm text-muted-foreground">Feedback saved.</p>}
  </form>;
}
