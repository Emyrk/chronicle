# Repair job verification

## Contents

1. Evidence capture
2. Independent replay comparison
3. Required regression matrix
4. Commands and completion gate
5. Lessons from the Razorgore repair

## 1. Evidence capture

Use a read-only instance investigation before changing eligibility or relaxing a guard.

- Fetch metadata, affected event streams, ranking source exports, and speedrun proof
  if relevant. Inspect current routes in `api/api.go`; instance routes are under
  `/api/v1/raidlogs/instances/{uuid-or-slug}`.
- Useful GET suffixes are `/events/{type}`, `/ranking-records`, and `/speedrun`.
  Metadata is the instance route itself. Preserve the exact tenant host. Remote
  browser-only deployments may require matching Origin/Referer headers. Use the
  operator's authorized access; do not bypass private-instance permissions.
- Put artifacts in a unique scratch directory per instance/investigation, for
  example one created with `mktemp -d`. Record instance/encounter IDs, host, format,
  flavor, parser version, and hashes. Do not reuse generic `/tmp/instance.json` or
  `/tmp/damage.bin`; concurrent agents can overwrite them with unrelated logs.
- Check HTTP status and file contents before decoding. A JSON error body is not an
  empty protobuf stream. The historical resurrection event type is spelled
  **`ressurection`**, not `resurrection`. Confirm schema enums before declaring an
  event stream absent.
- Keep real logs, player data, decoded records, credentials, and temporary probes
  out of commits. Use synthetic equivalents for durable regression fixtures.

Stored events are gzipped, framed protobuf, not a flat message list. Reuse or
inspect `razorgore_events.go` and `razorgore_numeric.go`: validate encounter IDs,
frame timestamp origins, declared counts/lengths, duplicate indices, and message
metadata. Merge relevant streams by global `EventMeta.Index`, not timestamps alone.
Do not assume all synthetic events are invalid: inferred resurrection and estimated
absorbs can be legitimate parser metric inputs.

## 2. Independent replay comparison

### If the original raw log is available

Run the ordinary parser with **explicit format and flavor parse context**. Missing
parse context can silently produce wrong spell events or phase results. Confirm
that the expected egg/cast events appear before treating that parse as a reference.
Use historical/current code deliberately and record which version generated each
result; a newly corrected parse is not the historical source state.

Use the same domain trackers and aggregation semantics as production:
- Player ownership, possession start/end and lazy expiry.
- Pet/totem rollup into the owner captured by the parser at fight end.
- Effective damage, overhealing, absorbs, ranking-window denominators.
- Deaths, resurrections, alive percentage, and inferred roles where changed.
- Spec/talent identities and unaffected encounter metrics preserved.
- Full encounter timing versus ranked-window timing versus speedrun timing.

Compare every affected player, not only top players or raid-wide totals. Offsetting
per-player errors can make aggregates appear correct.

### Whether or not raw data is available

Feed the repair **actual historical source rows and stored events**, not expected
fresh-parser outputs. Load every relevant proof/timing field, not only the proof
JSON. Run the complete evaluator, not merely its numerical helper.

For each claimed match, identify the independent input. If a helper computes
`unranked = persisted_total - repaired_ranked`, seeding `persisted_total` from the
expected reference makes unranked parity circular. Public ranking exports may
omit columns. Obtain the actual column when possible; otherwise disclose the
missing field and any separately verified reconstruction from historical code.
Do not label that an exact database-state comparison.

Assert at least:
- Eligibility and explicit skip/omission reasons.
- Per-encounter proposed outcomes/windows/reconstructed rows.
- Every affected player's changed metrics and retained identities.
- Omission count and effective amount, not raw amount including overheal.
- Unaffected sources and original event blobs unchanged.
- Proof consistency and full-duration timing where relevant.

A real-log local probe should invoke pure evaluation against captured data. A mock
apply recorder may check the planned writes. Neither proves a real database commit;
cover atomic persistence separately in database tests. Never apply to the user's
instance merely to finish verification.

## 3. Required regression matrix

Use existing tests as patterns, not as substitutes for the new job's cases:

| Area | Existing example | Required assertions |
| --- | --- | --- |
| Lifecycle | `service_test.go` | dry-run writes no source/ratings; eligible ready; empty/all-skipped auto-complete; mixed outcomes; paging/retry/cancel; failed enqueue rollback |
| Once-per-script | `receipts_test.go` | same script across jobs/versions skips; concurrent jobs apply once; source/queue/receipt rollback; audit deletion retains receipt; tenant isolation |
| Prepared plan | `razorgore_test.go` | changed evidence rejected; diagnostic JSON not executable; mutations to every private payload fail seal validation |
| Reconstruction | `razorgore_phase_reconstruction_test.go` | correct thresholds/boundaries; unsupported flavor; missing/corrupt/duplicate/excess events; original rows preserved; reconstructed rows actually inserted |
| Attribution | `razorgore_possession_test.go`, `razorgore_omissions_test.go` | crossing-window control; repeated snapshots do not renew expiry; ownerless classified pets/totems; exact omitted quantities; ordinary NPCs not guessed as pets |
| Full source repair | `razorgore_numeric_test.go`, `razorgore_multi_test.go` | original and repaired values; multiple pulls; preserved other encounters; valid proof; already-processed skip |
| API | `api/event_repairs_test.go`, `api/db2sdk/event_repairs_test.go` | permission failures; public receipt allowlist; optional metadata; warnings/details round-trip |
| UI | `AdminEventRepairs.test.tsx`, `.stories.tsx`, `components/EventRepair/RepairDetails.test.tsx`, `.stories.tsx` | preview warnings before Apply; badge with time/job/version; unknown JSON fallback; all-skipped has no decision actions; cancel/retry; instance links |

Paths without a prefix in the backend rows are in
`internal/services/serviceeventrepair/`; frontend paths are under
`frontend/chronicle/src/` (admin files under `pages/Admin/`). Confirm actual current
API receipt coverage when extending it; do not assume a filename proves coverage.

Keep tests parallelizable and deterministic. Use barriers for concurrency, not
sleep-based scheduling. Verify DB tests ran rather than skipped. Confirm rollback
by reading persisted source/checkpoint/receipt/job state after the injected failure.

## 4. Commands and completion gate

Adapt targeted test selection to the new job, then run the broader required checks:

```sh
# Query/schema changes; SDK changes respectively.
make gen/db
go run -C ./scripts/apitypings main.go > frontend/chronicle/src/api/typesGenerated.ts

# Existing shared framework and adapter coverage.
go test ./internal/services/serviceeventrepair ./api ./api/db2sdk
go test -race ./internal/services/serviceeventrepair

# Frontend examples; include new renderer/job tests too.
cd frontend/chronicle
pnpm test src/pages/Admin/AdminEventRepairs.test.tsx src/components/EventRepair/RepairDetails.test.tsx
pnpm exec vitest run --project storybook src/pages/Admin/AdminEventRepairs.stories.tsx src/components/EventRepair/RepairDetails.stories.tsx
pnpm exec tsc -b
# Run ESLint on all touched frontend files.
cd ../..
make test
make lint
make build
git diff --check
```

Inspect generated diffs and migration-number collisions after integration/rebase.
Replace temporary frontend contracts with generated SDK types. Keep runtime JSON
shape checks even when the outer receipt is typed.

If a check fails, diagnose and fix it or report the exact external blocker. A
cached or reference-only pass does not establish that a newly combined tree works.
Do not claim "all tests passed" when browser tests, source parity, or DB tests were
not executed. Report a flaky retry as such rather than hiding its first failure.

## 5. Lessons from the Razorgore repair

- **Phases and attribution are different evidence.** Egg counts define the phase;
  possession determines credit. Grethok's Dominate Mind is not the egg-control
  spell, but its stored aura and classification can still prove valid possession.
  Do not hardcode one spell ID for every control effect.
- **Past control is not necessarily relevant.** A proven-expired P1 control effect
  need not block P2 credit. An unknown control effect crossing P2 still matters.
- **A current owner is not necessarily a historical owner.** A Sproutling's saved
  owner did not establish encounter-time attribution. The approved fallback was
  to omit 148 effective healing and retain that warning, not invent credit.
- **Missing phase rows can be reconstructed; missing evidence cannot be invented.**
  Exact supported egg thresholds can supply absent boundaries. Incomplete counts,
  overlapping pulls, or unknown historical flavor still require a skip.
- **Historical values are not always a checksum.** Incorrect P1 healing attribution
  need not invalidate fully evidenced P2 healing. Diagnose discrepancies by exact
  event before deciding whether a reconciliation guard is meaningful.
- **"Ready" is not "finished" for every result.** Eligible previews await a decision;
  all-skipped previews complete automatically. Ratings queued remains distinct
  from ratings finished, and the receipt timestamp describes the repair apply.
