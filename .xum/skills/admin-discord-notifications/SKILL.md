---
name: admin-discord-notifications
description: Adds and maintains Chronicle admin Discord alerts through the shared River job and configured admin channel. Use when announcing a new admin-review event, changing the notification embed, channel configuration, or Discord delivery behavior.
metadata:
  type: workflow
  binding: advisory
---

# Admin Discord Notifications

Use the shared `chroniclebot.ArgsNotifyAdmin` job for short admin alerts. Feature code supplies a title, review URL, and embed fields; the helper selects the configured private channel. Do not create a feature-specific Discord worker or channel setting for each alert.

## Add an alert

1. Identify the successful business operation and its commit boundary. For optional alerts, enqueue **after** the operation commits so River or Discord failures cannot roll it back. If notification delivery must be guaranteed, clarify that requirement before changing transaction semantics.
2. Build `chroniclebot.ArgsNotifyAdmin{Title, URL, Fields}`. Keep `Fields` to short, relevant review context. Link to an authenticated admin page, not directly to private evidence. Do not put screenshots, secrets, or private evidence in the job args or Discord message.
3. Call `chroniclebot.EnqueueAdminNotification(ctx, queue, bot, args)`. It fills `ChannelID` from the bot configuration, skips disabled bots or empty channels, and returns queue insertion errors. In best-effort request paths, log errors and leave the business response unchanged. Bound synchronous enqueue work when it follows a user request; photo proofs use a five-second `context.WithTimeout(context.WithoutCancel(ctx), ...)` so a disconnected client does not cancel the attempt.
4. Add tests for the caller's title, URL, fields, and non-fatal insertion failure. Reuse the shared worker unless the message requires genuinely different delivery semantics.

Example from `api/linkedapi/proofs.go` (inside its best-effort notifier, after the proof commits):

```go
err := chroniclebot.EnqueueAdminNotification(ctx, queue, bot, chroniclebot.ArgsNotifyAdmin{
    Title: "New character-link photo proof",
    URL:   reviewURL,
    Fields: []chroniclebot.AdminNotificationField{
        {Name: "Applicant", Value: applicantName, Inline: true},
        {Name: "Characters", Value: characterSummary},
    },
})
if err != nil {
    slog.ErrorContext(ctx, "failed to enqueue admin notification", "error", err)
}
```

## Sources of truth

| Concern | File |
| --- | --- |
| Job args, enqueue helper, embed, delivery worker | `chroniclebot/job_notify_admin.go` |
| Bot channel configuration accessor | `chroniclebot/bot.go` |
| Config option and default | `internal/services/servicebot/servicebot.go` |
| River queue and worker registration | `internal/services/serviceriver/serviceriver.go` |
| Photo-proof example and tests | `api/linkedapi/proofs.go`, `api/linkedapi/proofs_test.go` |
| Shared job/worker tests | `chroniclebot/job_notify_admin_test.go` |

`CHRONICLE_DISCORD_ADMIN_NOTIFICATIONS_CHANNEL_ID` defaults to `1563754609921622016` for the deployment using `CHRONICLE_DISCORD_GUILD_ID`. Set it to another private channel ID or explicitly empty to disable alerts. A disabled bot also skips enqueueing. The job runs on `QueueDiscordAnnouncements` with up to three attempts. Worker failures retry the River job; they never change a previously committed application. Delivery can be at least once if Discord accepts a message but the job retries, so do not promise exactly-once delivery.

## Gotchas

- The shared worker renders a Discord embed with mentions disabled. Do not bypass it with direct Discord sends from a request handler.
- `EnqueueAdminNotification` does not log insertion errors for callers. Log them at a best-effort call site; do not turn them into an HTTP error after commit.
- A missing queue with an enabled bot returns an error. A disabled bot or empty channel returns nil without inserting a job.
- Keep Discord embed limits in mind, especially field values (1024 characters). Prefer a concise summary and an authorized review link over copying full application text.
- The job carries the destination channel in its args, set by the helper at enqueue time. A changed channel setting does not reroute already queued jobs.

## Validate

Run `go test ./api/linkedapi ./chroniclebot ./internal/services/servicebot ./internal/services/serviceriver` and `golangci-lint run --build-tags azerothcore ./api/linkedapi ./chroniclebot ./internal/services/servicebot ./internal/services/serviceriver`. Check three scenarios: configured bot inserts the expected fields into the configured channel, disabled bot or empty channel skips cleanly, and queue or Discord failure does not fail the underlying business operation.
