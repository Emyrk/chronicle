---
name: event-repair-jobs
description: Creates and verifies Chronicle admin event repair jobs for historical combat-log data. Use when adding a named repair or backfill, reconstructing missing derived data from stored events, changing repair eligibility or attribution omissions, or extending dry-run reports, permanent receipts, and repair badges.
---

# Event repair jobs

Use the shared admin repair lifecycle, not a one-off database script. Repair derived
sources from stored evidence without rewriting original event streams. Produce a
reviewable dry-run, then require explicit authorization before applying it.

Read `docs/admin-event-repairs.md` for current product behavior. Read
`references/verification.md` before designing tests or validating a real instance.
Load `database-sqlc-patterns`, `http-api-patterns`, `frontend-data-flow`, and
`flake-audit` when touching those areas; load the domain-specific parser/ranking
skills for the evidence being reconstructed.

## Acceptance scenarios

Design for these three cases before implementation:

1. **Provable repair:** reconstruct the affected fields from stored events,
   preview the proposed values, and atomically apply once with a receipt and
   durable ratings enqueue. A second job for the same script skips the instance.
2. **Incomplete attribution:** omit only the contribution that cannot safely be
   attributed under the approved job policy. Preview and persist its amount,
   count, unit, encounter, and reason. Do not guess an owner or silently discard it.
3. **Unsafe or unnecessary work:** already repaired, manually reparsed under the
   job's eligibility rule, stale evidence, or ambiguous structural data skips.
   An empty/all-skipped dry-run completes automatically with no decision buttons.

## 1. Agree on the job contract

Write a compact contract and get approval for new business rules or architecture:

- Stable script name and implementation version, separate from the operation UUID.
- Target instances and bounded sweep filters; whether retained raw files matter.
- Exact derived fields allowed to change, and invariants that must not change.
- Required evidence, reconstruction rules, and explicit skip reasons.
- Which attribution gaps may become omissions, and what quantity is excluded.
- What a user will see before Apply and in the permanent receipt afterward.
- Representative instance(s) and an independent expected-result source.

Do not infer a raw-file-deleted-only restriction from the word "backfill". The
existing Razorgore job uses an already-distinct ranking window as a manual-reparse
skip signal; raw storage availability is not its selection gate. That is a
job-specific policy, not a universal rule for future repairs.

## 2. Find the real extension points

The first job is a reference implementation, not a generic plugin registry.
Before adding a second job, inspect and replace its assumptions coherently:

| Concern | Current source |
| --- | --- |
| Name/version, selection validation | `internal/services/serviceeventrepair/types.go`, `selection.go` |
| Evaluation/apply/revalidation wiring, sweep instance name, version checks, source locks | `internal/services/serviceeventrepair/service.go` |
| Durable River paging | `internal/services/serviceeventrepair/worker.go` |
| Evidence, prepared plan, hash/seal, source writes | `internal/services/serviceeventrepair/razorgore.go`, `razorgore_multi.go`, `razorgore_numeric.go` |
| Stored stream decoding and attribution | `razorgore_events.go`, `razorgore_possession.go`, `razorgore_omissions.go` in the same package |
| Phase reconstruction example | `internal/services/serviceeventrepair/razorgore_phase_reconstruction.go` |
| Operation and receipt queries | `database/queries/eventrepair.sql`, `database/queries/event_repair_receipts.sql` |
| API/SDK | `api/event_repairs.go`, `api/chroniclesdk/event_repairs.go` |
| Public receipts | `api/instances.go`, `api/db2sdk/event_repairs.go`, `api/chroniclesdk/log.go` |
| Admin selection and report | `frontend/chronicle/src/api/eventRepairs.ts`, `frontend/chronicle/src/pages/Admin/AdminEventRepairs.tsx` |
| Per-job details renderer | `frontend/chronicle/src/components/EventRepair/RepairDetails.tsx` |
| Instance badge wiring | `frontend/chronicle/src/pages/Instance/InstanceHeader.tsx`, `InstancePageView.tsx`, `transformInstance.ts` |

Check filenames/symbols before editing; do not copy a stale plan blindly. In
particular, the current service uses `RazorgoreRepairPlan`, `OperationRazorgore`,
a single `Version`, and a Blackwing Lair sweep filter. Adding only an enum or
select option does not register a new repair. Propose the smallest job-dispatch
boundary that separates evaluator-specific payloads from the shared lifecycle;
do not duplicate the worker, receipt, or transaction machinery.

## 3. Build an evidence-based evaluator

Separate three stages:

1. **Load/evaluate outside the write transaction.** Decode streams, reconstruct
   candidates, and produce human-readable changes, warnings, and job-specific
   JSON details. No source mutations or ratings jobs during preview.
2. **Revalidate under locks.** Hash the original persisted inputs, including
   relevant source rows and receipts. Reread compressed evidence and compare the
   approved fingerprint. Never silently substitute a different plan at Apply.
3. **Apply a sealed in-memory plan.** The seal covers public diagnostics and every
   private executable payload, including reconstructed rows. Deserialized report
   JSON is not executable. Do not decode gzip or do expensive replay under locks.

Missing metadata is not always missing evidence. Reconstruct absent fields when
stored events establish them using the parser's semantics and saved flavor/format.
For example, Razorgore phase rows can be rebuilt from an unambiguous complete egg
threshold, but a partial count cannot prove a missing phase or a false kill.
Do not use current tenant defaults as a substitute for historical parsing context.

Only attribution gaps covered by the approved policy become omissions. Preserve
hard skips for ambiguous structural evidence, unsupported chronology/control,
corruption, or incompatible inputs. Validate the history needed for the repaired
window, including state crossing its boundary; irrelevant earlier history should
not block a repair when the required state is established.

For omissions, distinguish an unclassified unit from a classified pet/totem with
no owner. Both can lose player attribution. An ordinary unowned NPC is not
necessarily a missing-owner player contribution. Do not use a final instance-level
owner snapshot as proof of encounter-time ownership without justification.

## 4. Preserve lifecycle and transaction guarantees

- Admin actions remain permission-gated. Preserve explicit tenant resolution and
  RLS, bounded selection, per-instance progress, retries, and cancellation.
- Successful previews with eligible items become `ready`; zero eligible items
  become `completed`, including empty selections. Only eligible previews offer
  Apply/Reject. Cancellation stops future instances, not already committed ones.
- A successful per-instance SERIALIZABLE transaction includes source changes,
  reconstructed rows, permanent receipt, durable ratings obligations, and audit
  checkpoint. Queue/receipt/source failure rolls back the whole transaction.
- Preserve old rating identities before source mutation and enqueue the canonical
  refresh through the existing transactional service calls. "Queued" is not
  "ratings completed". Do not replace this with a best-effort post-commit nudge.
- Dry-runs, skipped/stale items, and failed applies create no receipt and enqueue
  no ratings. An eligible successful no-op still records its receipt and enqueue.
- Receipt uniqueness is **instance + script name**, not job UUID or version.
  A version bump does not authorize rerunning the same script. Do not rename a
  script merely to evade that protection. Check again inside the transaction.
- Receipts survive deletion of admin job history; deleting an instance may remove
  its receipt. Public metadata exposes only the public receipt, not operator
  identity, selection, private mutation payloads, or privileged errors.
- Use additive migrations and sqlc. Do not perform historical backfills at startup.
  Recheck migration numbering after rebasing; never edit deployed migrations.

## 5. Make the preview and receipt useful

Shared receipt fields are `operation_id`, `operation`, `version`, `applied_at`,
`warnings`, and unstructured `details`. Version each script explicitly; start a
new, unused script at 1. Do not gratuitously bump an unshipped script's version.

Define the new job's JSON shape and renderer together. Include before/after values
where they matter, reconstructed evidence, and omission amounts/counts/reasons.
Keep arrays stable (`[]`, not `null`). Guard unstructured payloads at runtime and
provide escaped generic JSON for unknown job/version or malformed details.

Show the same warnings in dry-run and receipt. Every applied instance gets the
repair indicator, timestamp, script/version, and job ID; omissions get an additional
warning. Retain new-tab instance links and named tenant/realm selectors. Do not
ask users to approve or reject an all-skipped report. Original events stay intact.

## 6. Verify and hand off

Follow `references/verification.md`, including actual-source replay, not just
synthetic fixtures or a helper seeded with expected outputs. Run checks on the
combined tree after integrating delegated patches and generated contracts.

Report separately:
- Implemented behavior and deliberate coverage limits.
- Synthetic/unit/database/browser checks actually passed.
- Actual-instance preview and which independent fields matched.
- Any inferred fixture fields or unavailable evidence.
- Whether any real Apply happened (normally **none** during development).

Implementation approval is not authorization to apply a repair to a real log.
Ask before applying, running a sweep, or writing to production. A green local
preview is evidence for a proposed repair, not evidence that it was applied.
