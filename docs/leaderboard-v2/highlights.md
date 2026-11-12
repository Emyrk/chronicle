# Persisted landing highlights

Migration 354 creates an empty snapshot table only. No historical source rewrite,
startup backfill, populated-source index build, or live pilot is performed.

## Scope and existing calculations

Each row is one tenant/server, configured raid+exact difficulty+size, and either
all tenant realms or one specific realm UUID. All-realms uses a nonnull zero UUID
inside the primary key, so duplicate null-scope rows are impossible. RLS and an
explicit tenant predicate protect reads/writes; specific realms are validated
against the tenant's server realms. Optional exact realm-ID filters were added to
legacy rankings/statistics/speedrun queries; name collisions cannot broaden scope.
The landing realm selector is single/all. Multiple realm selections in URLs return
`unsupported_scope` with no previews, never a substituted all-realm result.

No class/spec filter is applied. Ratings use the existing `leaderboardread.Select`
and `ListLeaderboardV2` calculations over the configured default encounter set.
Player landing boards are DPS; guild boards use existing guild boss/default-set
ratings. Peak/mastery/Renown each retain at most 3 leaders. Realm filtering changes
subjects, **not tenant-wide benchmarks**. Raw Peak presentation uses existing
per-boss raw peaks divided by the selected-set denominator, matching the Hub's
mean-of-best-per-boss presentation.

Performance highlights are intentionally omitted because Peak already summarizes
player output on the compact landing cards; users open the raid to view the full
performance board. Statistics top 3 uses `RankingsBoxPlotStatsNoJIT` (existing
median-DPS ordering by spec). Full-clear top 3 uses `SpeedrunLeaderboard` with full
timing and exact cohort. These are the same SQL calculations used by the existing
tabs, not new scoring formulas. Parsing/rulesets have no highlight body in the
current Hub.
Guild leaders remain in the existing preview contract used by Overview.

## Persistence and refresh

One successful refresh builds the complete cohort/scope payload, then atomically
upserts it. Any query/encoding failure preserves the previous row and timestamp.
An older-started refresh cannot overwrite a newer-started publication. Arrays are
bounded to 3 and serialized JSON is capped at 256KiB both in code and the database.
At most 256 configured cohorts are accepted; larger configurations fail explicitly
rather than silently truncate. Calculation jobs have a 1-minute deadline and one
attempt; a later stale-snapshot sweep is the retry mechanism.

Hourly River dispatch pages tenants and examines at most 100 cohort/scope pairs per
continuation. It queues only missing snapshots, snapshots older than two hours, or
snapshots whose configuration fingerprint changed. There is no run-on-start
historical task. Completed backfill/repair jobs best-effort nudge a tenant refresh
after commit; failures remain recoverable by hourly refresh. Admins can explicitly
request a tenant refresh.

A configuration fingerprint hashes the resolved instance policy (default-set
membership, awards, variants) plus snapshot algorithm version. Public reads resolve
current policy and suppress snapshots whose fingerprint differs, returning `rebuilding`
metadata and nudging refresh. This covers configuration changes regardless of
whether they arrive through seed/SQL tooling or tenant flavor/dataset changes.
There is no separate mutable configuration API in this code path; changed policy
is detected on the next highlights read or hourly reconciliation. Notification
is not the correctness mechanism. Removed cohorts are not returned even if old
snapshot rows remain stored. Ordinary evidence changes can remain stale until the
next hourly refresh; `refreshed_at` is exposed honestly.

## API / frontend integration

- `GET /api/v1/leaderboards-v2/highlights?realm=<uuid>`; omit realm for all.
- `POST /api/v1/admin/leaderboard-highlights/refresh` body `{tenant_id}`;
  existing admin-users permission, returns 202 when queued.

Public response: `{status,landing_previews,snapshots}`. Root is rejected. Top-level
status is `ready`, `partial`, or `unsupported_scope`. Snapshot metadata contains
instance/difficulty/size, configuration fingerprint, optional refreshed_at and
`not_prepared`, `rebuilding`, `stale`, `ready`, or `empty` status. `empty` means a successful
calculation with no highlights; absence is not an empty calculation. Configuration-mismatched (`rebuilding`) payload is never served. Same-fingerprint
snapshots older than two hours are marked `stale` but may still be displayed. Failed refresh with unchanged configuration continues
serving the old successful payload and its old timestamp, marked `stale` after
two hours. Refresh nudges use stable River args and active-job uniqueness; GET
requests do not calculate highlights. Repeated singular/plural realm parameters
are unsupported, not silently reduced to the first value.

`landing_previews` matches the existing `HubLandingPreview` card contract. The
parent/frontend integration should merge this response into the adapter currently
returning `landing_previews: []`; this backend change does not edit components.

Tests run against isolated dbtestutil databases; deployment/pilot measurements and
any actual dev server interaction remain operator actions, not automated validation.
