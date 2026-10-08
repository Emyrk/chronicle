---
name: whats-new
description: Maintains Chronicle's authenticated What's New notification, append-only release ID list, per-user seen state, account-menu indicator, and custom release preview. Use when announcing a new Chronicle feature, changing the What's New modal or badge, modifying read-state persistence, or updating signup initialization.
metadata:
  type: workflow
  binding: advisory
---

# What's New

Chronicle's What's New system is a binary unread notification backed by an append-only Go ID list. The backend decides whether the current release ID is unread; the frontend owns the fully custom presentation.

## Sources of truth

| Concern | File |
| --- | --- |
| Ordered release IDs and unread semantics | `internal/services/servicewhatsnew/service.go` |
| User state schema | `database/migrations/000226_add_whats_new_state.up.sql` |
| sqlc queries | `database/queries/whats_new.sql` |
| Authenticated API | `api/whats_new.go`, `api/chroniclesdk/whats_new.go` |
| Service registration | `cmd/chronicled/cli/server.go`, `internal/services/serviceapi/serviceapi.go` |
| Account indicator and menu entry | `frontend/chronicle/src/components/NavBar/NavBar.tsx` |
| Custom preview content | `frontend/chronicle/src/components/WhatsNew/WhatsNewDialog.tsx` |
| React Query and local cache | `frontend/chronicle/src/api/queries.ts` |
| OAuth and password signup initialization | `api/chronauth/signup.go`, `api/chronauth/password.go` |

## Data model

The release list is compiled into Go:

```go
var releaseIDs = []string{
    "custom-panels",
}
```

The list is append-only and ordered. `CurrentID()` returns the final ID. PostgreSQL stores only the user's last-seen ID:

```text
user_whats_new_state
  user_id UUID PRIMARY KEY
  seen_id TEXT NOT NULL
  seen_at TIMESTAMPTZ NOT NULL
```

Unread rules:

- `seen_id == CurrentID()` means current/read.
- A missing state row means unread for an existing user.
- An older, renamed, removed, or otherwise unknown `seen_id` means unread.
- An empty release list means there is nothing unread.
- Opening the What's New dialog records `CurrentID()` and clears the indicator.
- The menu entry remains visible after it is read; only its dot disappears.

New OAuth and password accounts must initialize `seen_id` to `CurrentID()` inside the same account-creation transaction. New users should not be alerted about features that predate their account.

## Announce a new feature

1. Append a stable kebab-case ID to `releaseIDs`. Never reorder, rename, or reuse an existing ID.
2. Update `WhatsNewDialog.tsx` with the desired static React content. This UI may use custom layouts, screenshots, videos, buttons, and links.
3. Keep the Account-menu entry below **Settings** and immediately before **Sign Out** on desktop and mobile.
4. Link detailed release material to `/blog/<post-id>` and retain a route to the `/blog` archive when useful.
5. Update the service tests so `CurrentID()` expects the new final ID and stale-ID behavior remains covered.
6. Regenerate TypeScript API types only if the API contract changed; appending an ID alone requires no generation or migration.

Example:

```go
var releaseIDs = []string{
    "custom-panels",
    "new-feature-id",
}
```

Existing users whose `seen_id` is `custom-panels` become unread after deploying the new binary. Self-hosted users become unread when they update to that binary. Newly created users start at `new-feature-id`.

## API and caching

Authenticated endpoints:

```text
GET /api/v1/me/whats-new
PUT /api/v1/me/whats-new/read
```

The status response contains `current_id` and `has_unread`. The frontend caches status in local storage for 24 hours under a user-scoped key. Marking the dialog read updates React Query and local storage optimistically.

Do not add a database catalog or a migration for each release. The compiled ID list is the release source of truth; the database only remembers each user's last-seen ID.

## Gotchas

- Do not replace string IDs with numeric positions. Persisted IDs must remain meaningful across versions and deployments.
- Do not treat an unknown persisted ID as current. Unknown means stale and should show the indicator.
- Do not restore a database trigger for signup initialization. The trigger cannot read the Go release list; initialize both production signup paths explicitly.
- Do not hide the What's New menu entry after reading. Hide only the unread indicator.
- Do not mark the release read when the account dropdown opens. Mark it when the What's New dialog actually opens.
- Keep read writes idempotent. `MarkWhatsNewRead` may safely overwrite `seen_id` with the current ID.

## Validation

For an ID-only release addition:

```bash
go test ./internal/services/servicewhatsnew
pnpm -C frontend/chronicle exec eslint src/components/WhatsNew/WhatsNewDialog.tsx src/components/NavBar/NavBar.tsx
pnpm -C frontend/chronicle exec tsc -b --pretty false
```

When changing persistence, API contracts, or signup behavior:

```bash
make gen/db
go run -C ./scripts/apitypings main.go > frontend/chronicle/src/api/typesGenerated.ts
go test ./database -run 'WhatsNew'
go test ./internal/services/servicewhatsnew ./api/chronauth ./api ./cmd/chronicled/cli
go test ./...
pnpm -C frontend/chronicle test
pnpm -C frontend/chronicle build
```

## Self-check

- [ ] New IDs were appended, not reordered or renamed.
- [ ] Existing users become unread after deployment.
- [ ] New OAuth and password users start at the current ID.
- [ ] Missing and unknown IDs are treated as stale.
- [ ] The menu item remains visible after reading.
- [ ] The unread dot clears only after opening What's New.
- [ ] The preview and blog links match the release being announced.
