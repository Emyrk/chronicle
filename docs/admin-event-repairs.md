# Admin event repairs

All endpoints require authenticated global `admin_users`. Operations run across
subdomains using their explicit stored tenant, not the request's current tenant.

## API

Base: `/api/v1/admin/event-repairs`

| Method/path | Result |
| --- | --- |
| GET | `{ "operations": EventRepairOperation[] }`, latest 100 |
| POST | 202, new dry-run operation |
| GET `/{id}` | operation with up to 1000 instance reports |
| POST `/{id}/apply` | 202, explicitly authorize apply after preview; also retry applying |
| POST `/{id}/retry` | 202, resume dry_running/applying checkpoints only |
| POST `/{id}/cancel` | stop future instances; prior committed repairs remain |

Create body:

```json
{"operation":"razorgore-phase-two","instance":"instance UUID, slug, or Chronicle /instances/... URL"}
```

Or a finite sweep:

```json
{"operation":"razorgore-phase-two","tenant_id":"UUID","limit":100,"realm_id":"optional UUID","after":"optional RFC3339 timestamp","before":"optional RFC3339 timestamp"}
```

Sweep limit must be 1..1000. The tenant is mandatory for sweeps; for a single
instance it is optional and, when supplied, constrains resolution. Sweep dates
filter encounter-instance start time, inclusive `after`, exclusive `before`.
The Razorgore operation selects Blackwing Lair instances only. Single-instance
requests cannot also specify sweep filters.

SDK contracts live in `api/chroniclesdk/event_repairs.go`. Operation states are
`dry_running`, `ready`, `applying`, `completed`, `cancelled`. Item states are
`pending`, `ready`, `skipped`, `applied`, `stale`. `processed` counts dry-run
reports, `applied` counts committed applies, and `skipped` includes stale items.
Errors use 400 for invalid input, 404 for unknown IDs, and 409 for state conflicts.

## Execution guarantees

- Additive audit tables only; migrations never rewrite historical source data.
- Operation creation and apply authorization enqueue a River job in the same
  transaction as the corresponding state change.
- A job handles at most 25 instances before durably snoozing for another page.
  River retries transient failures up to ten times; the retry endpoint resumes
  exhausted work without resetting checkpoints or authorizing a new apply.
- Each instance is a separate SERIALIZABLE transaction. Cancellation and instance
  processing serialize on the operation lock; cancel does not undo earlier work.
- Apply reevaluates current evidence and compares its hash with the approved dry
  run. Changed evidence becomes stale, requiring a new preview. The original
  approved report/hash remains in the audit table.
- Every successful apply, including a verified no-op, atomically preserves old
  ratings obligations and enqueues canonical membership refresh. Queue failure
  rolls back source changes and the checkpoint. Dry runs and skips enqueue no ratings.
- Original event blobs and public immutable `damage.Unranked` flags never change.

## Version 1 support and limits

The named operation is `razorgore-phase-two`, version 1. Its currently supported
mutation is a conservative **pre-threshold false-kill correction**, not general
phase-two damage reconstruction. It requires one complete persisted P1, an
explicit terminal Razorgore death, unambiguous hostile activity, and no surviving
other boss kill. It corrects the encounter outcome/ranking window, hostile end
state and phase outcome; removes false encounter ranking rows; and removes the
invalid speedrun source/proof when no boss kills remain. Original encounter and
instance boundaries stay unchanged. A fully matching repaired state is a no-op
but still enqueues ratings on apply.

Other cases are skipped with diagnostic reasons. In particular, phase-two player
DPS/HPS reconstruction requires event-time possession/owner attribution that is
not generally recoverable from stored protobuf streams and final owner snapshots.
Those cases require original-log reparse. Missing persisted phases are not inferred
from potentially truncated egg casts. The implementation does not fabricate
approximate ranking totals or claim successful duration-only repair.
