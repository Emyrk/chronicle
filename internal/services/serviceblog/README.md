# Blog interactions

This constructed service owns eligibility, validation, admission and interaction rules.
HTTP adapters own authentication, user-admin authorization and anonymous response projection.
The SQL adapter owns atomic global account/post uniqueness and immutable submission provenance.

Each manifest post must explicitly set `voting_enabled: true` or
`feedback_enabled: true` independently for the respective feature. Missing posts,
missing metadata, disabled posts and inaccessible flavor variants deny mutations.
Current posts remain disabled. The client cannot authorize interactions itself.

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
