# Blog interactions

This constructed service owns eligibility, validation, admission and interaction rules.
HTTP adapters own authentication, user-admin authorization and anonymous response projection.
The SQL adapter owns atomic global account/post uniqueness and immutable submission provenance.

## Enabling a post

Voting is enabled by default for every known, flavor-accessible blog post.
Set `votingEnabled: false` on a post in `assets/turtle/generated/blog-posts.json`
to disable voting explicitly. Feedback remains opt-in: only `feedbackEnabled: true`
enables collection, and omission defaults to false. For example,
`"votingEnabled": false, "feedbackEnabled": true` collects feedback without votes.

Run `pnpm -C frontend/chronicle build` after changing metadata. The blog prerender
step emits the independent `voting_enabled` and `feedback_enabled` flags into
`blog-manifest.json`; the server uses that built manifest as its authority.
Deploy the matching frontend build and backend together. Missing posts, missing
manifests, explicitly disabled features and inaccessible flavor variants deny direct mutations.
A known post in an older manifest without `voting_enabled` also defaults to voting
on; `feedback_enabled` still defaults to false.
The client cannot authorize interactions itself.

The public interaction endpoint is `GET /api/v1/blog/{slug}/interactions`.
Authenticated vote and feedback mutations use `PUT` on `/vote` and `/feedback`
under that post path. A vote of zero removes the account's vote.
The moderation UI is `/admin/blog-feedback`; its APIs under `/api/v1/admin/blog`
require the global user-administration permission. Approval and rejection require
`expected_updated_at` from the reviewed record, so stale reviews cannot publish edits.

Votes and feedback use separate PostgreSQL buckets, `blog_vote` and `blog_feedback`.
Each is keyed by `ratelimit.UserSubject(userID.String())`, with no post or tenant
component. Each starts with five tokens and refills one token per twenty minutes.
Limiter failures deny writes. Validation and eligibility checks precede consumption.
Moderation and feedback bans are administrative operations and do not consume tokens.

Feedback is plain text, trimmed to 1 through 300 Unicode code points. Private submissions do not require consent. Public consent
and moderator approval are both required for public display. Edits reset approval.
Deletion leaves a reservation so the same account cannot submit another record for
that post. Submission tenant never changes when the author edits from another site.
Public responses expose only feedback ID, body and a same/different-server label.

## Optional feedback-created hook

`Options.FeedbackCreated` defaults to nil and production wiring leaves it inactive.
It runs after a successful first database insert only. Edits, moderation, deletion,
conflicting inserts and failed requests do not invoke it. Delivery is best effort:
a crash between persistence and invocation can lose the event. There is no durable
outbox, retry or exactly-once guarantee. Hook errors are logged and do not fail the
already persisted submission. Consumers must use the feedback ID as an
idempotency key. This hook does not grant rewards or entitlements.

Root-site submissions store a null original tenant. Root requests are eligible under
the same build-manifest rules as tenant requests. Public labels say `This server`
only when both tenant IDs are non-null and equal; otherwise they say `Another server`.
Own-feedback responses include consent so edits preserve the author's publication choice.

Administrative listing traverses all SQL pages in a repeatable-read snapshot,
including tombstones. Public feedback currently returns at most 1,000 approved,
consenting records per post.
