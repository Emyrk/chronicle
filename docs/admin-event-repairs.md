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
| POST `/{id}/retry` | 202, resume failed dry_running/applying checkpoints only |
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
The Razorgore operation selects Blackwing Lair instances only; the Lucifron
operation selects Molten Core instances only. Single-instance
requests cannot also specify sweep filters.

SDK contracts live in `api/chroniclesdk/event_repairs.go`. Operation states are
`dry_running`, `ready`, `applying`, `completed`, `cancelled`. Item states are
`pending`, `ready`, `skipped`, `applied`, `stale`. A dry-run with no eligible items
(empty selection or all skipped) completes automatically without Apply or Reject.
Existing all-skipped ready reports are finalized when opened. `processed` counts dry-run
reports, `applied` counts committed applies, and `skipped` includes stale items.
Item `ratings_queued` is true only after apply and the durable canonical refresh
commit together. It does not report downstream ratings completion. `last_error`
persists worker errors while checkpoints remain retryable; it clears after the
next successful checkpoint. Errors use 400 for invalid input, 404 for unknown IDs, and 409 for state conflicts.

## Execution guarantees

- Additive audit tables only; migrations never rewrite historical source data.
- Operation creation and apply authorization enqueue a River job in the same
  transaction as the corresponding state change.
- A job handles at most 25 instances before durably snoozing for another page.
  River retries transient failures up to ten times; the retry endpoint resumes
  exhausted work with a recorded `last_error`, without resetting checkpoints or
  authorizing a new apply. Healthy active work cannot be retried.
- Fetching, gzip/protobuf decoding, and reconstruction happen outside the write
  transaction. The prepared plan is sealed against modification. The transaction
  takes the existing canonical-refresh lock then parse-generation row, rechecks
  compressed-source fingerprints and the sealed plan, and writes without decoding.
- Each instance is a separate SERIALIZABLE transaction. Cancellation and instance
  processing serialize on the operation lock; cancel does not undo earlier work.
- Apply reevaluates current evidence and compares its hash with the approved dry
  run. Changed evidence becomes stale, requiring a new preview. The original
  approved report/hash remains in the audit table.
- Every successful apply, including a verified no-op, atomically preserves old
  ratings obligations and enqueues canonical membership refresh. Queue failure
  rolls back source changes and the checkpoint. Dry runs and skips enqueue no ratings.
- Original event blobs and public immutable `damage.Unranked` flags never change.

## Previously processed instances

Before event replay, Razorgore skips instances with a known parser release at or
after `v1.0.280`. Exact `GitTag+GitCommit` stamps are compared by release version;
either the exact stamp or persisted `versions["chronicle"]` tag can establish
that cutoff, including when metadata conflicts. Unknown/malformed, prerelease,
and git-describe stamps do not introduce a new eligibility restriction: when
neither stamp establishes the cutoff, the existing evidence checks still apply.
This intentionally differs from Lucifron's opt-in historical-version policy.
Skipped instances create no receipt and enqueue no ratings.

The existing independent duration gate is preserved: the repair skips the entire instance if any
Razorgore encounter has a valid persisted ranking window whose duration differs
from its full encounter duration. The window must have both offsets, a
nonnegative start, a positive duration, and an end within valid encounter bounds.
This duration proxy excludes manually reparsed and already repaired instances
from the successful no-op path; skipped instances enqueue no ratings refresh.
It does not inspect raw-log deletion or storage availability.

Absent or full-duration windows remain eligible for normal validation. Invalid
windows follow existing ambiguity/replay checks, rather than being labeled
previously processed. Other bosses' ranking windows do not trigger this gate.
The legacy API field `requires_reparse` still marks these skips, but the reason
explicitly says `already has distinct ranked duration; skipping previously processed instance`.

## Razorgore version 1 support and limits

The named operation is `razorgore-phase-two`, version 1. It supports two
conservative repair paths:

1. **Phase-two numerical repair.** A single clean encounter can use the
   direct-player proof path. Multi-pull addon instances use indexed classification,
   aura-duration possession expiry, pet aggregation, and shared DPS/survivability
   trackers. Contiguous P1/P2 phases and complete metric streams are required;
   missing phase rows can be reconstructed under the evidence rules below. Repairs include ranked/unranked damage, healing, absorbs, DPS/HPS,
   duration, inferred role, deaths, and alive percentage. Spec/subspec/talent
   identities stay unchanged. Missing streams or inconsistent full damage credits
   reject ambiguous instances. Contributions with unknown player attribution are
   omitted individually, with quantities and reasons in the preview and receipt. Historical derived HPS totals are not treated as an input
   completeness checksum: complete classified P2 healing is reconstructed directly.
2. **Pre-threshold false-kill correction.** Requires complete persisted P1 and
   explicit terminal Razorgore death with unambiguous hostile activity. It corrects
   encounter/window, hostile and phase outcomes, then removes false ranking rows.
   The standalone path removes the invalid speedrun source when no boss survives.
   In a multi-pull instance with a proven surviving kill, proof is replaced with
   that first true kill and completion is recomputed from original full encounter
   endpoints. Wipes have no source rankings; non-Razorgore metrics/proof entries
   remain unchanged and proof evidence is checked before any mutation.

Original encounter and instance boundaries stay unchanged. An eligible no-op
without an existing receipt still enqueues ratings on apply. Previously repaired
instances are skipped, not reapplied.

Other cases are skipped with diagnostic reasons requiring original-log reparse.
The unit_classification stream can carry ownership/controller transitions, but
snapshots omit possession expiry and some UNIT_INFO changes are not emitted.
The addon classification path requires authoritative possession durations and
rejects structural or ambiguous control evidence. Missing source/target ownership
for individual phase-two damage, healing, or absorb contributions is reported as
an omission instead of assigning a guessed player. The direct-player fallback
proves narrower attribution bounds instead of guessing history.

When all phase rows for a pull are missing, the addon path can reconstruct them
from stored, non-synthetic Destroy Egg (19873) casts. It uses the saved log-group
flavor's threshold (20 or 30), requires exactly that many ordered casts by the
proven Razorgore GUID, and requires unambiguous full-pull activity and boundaries.
Unsupported flavors, overlapping pulls, incomplete/excess casts, missing streams,
and conflicting existing phase evidence still skip. Existing phase rows are not
overwritten. Reconstructed phase rows, metric changes, and the receipt commit
atomically; raw events remain unchanged. The implementation does not fabricate
approximate ranking totals or perform duration-only repairs.

## Permanent per-script receipts

Every committed successful instance apply, including no-op, stores one permanent
receipt in the same transaction as the source writes, ratings obligation, and
checkpoint. The uniqueness key is `(instance_id, operation)`; version is deliberately
not part of it. A future version of the same named script cannot run again on that
instance. A subsequent operation reports a skip, with no source write or ratings
enqueue. Dry-run, stale, rejected, skipped, and failed attempts create no receipt.
The script version remains **1**.

Receipt metadata outlives admin operation history. Its `operation_id` is a durable
UUID reference, not a cascading foreign key. Deleting the source instance may
cascade its receipt. Prior receipts participate in sealed evidence hashing and are
checked again inside the source transaction before inserting the uniqueness guard.

Instance metadata exposes an optional `repairs` array using the same instance
permission and tenant visibility as the rest of the response. Each public receipt
contains only `operation_id`, `operation`, `version`, `applied_at`, `warnings`, and
`details`. It does not expose operator identities, selections, private executable
plans, or privileged job errors. `applied_at` records application, not downstream
ratings completion.

Admin items expose optional `warnings` and `details` for previews and applied
reports. These fields are covered by the prepared-plan seal and copied into the
permanent receipt on success. Details are unstructured JSON; current version-1
Razorgore producers use `phases` (encounter ID, offsets, reconstructed flag) and `omissions`
(encounter ID, stream, unit GUID, amount, count, reason).


## Lucifron ranked damage, version 2

Lucifron implementation version 2 adds evidenced player mind-control support.
Version-1 previews and failed operations cannot apply/retry under the new
evaluator; create a fresh dry run. Permanent receipts remain unique by script,
not version, so an existing version-1 receipt still prevents reapplication.
The public details shape is unchanged and old receipts remain readable.

The script `lucifron-ranked-damage` uses the same selection, preview, explicit
apply, retry/cancel, permanent receipts, and transactional ratings lifecycle.
A single-instance request accepts UUID, slug, or URL; bounded sweeps select
**Molten Core** in the explicitly selected tenant. Raw-log deletion is not a gate.

Eligibility requires a known historical parser release **before `v1.0.173`**.
That release introduced `instances.MoltenCoreDamageTargets(flavor)["Lucifron"]`:
Lucifron (12118) and Flamewaker Protectors (12119) are ranked targets; incidental
Core Hounds are not. The evaluator reads persisted parser metadata, compares
semantic versions numerically, and skips current/modern, unknown, malformed, or
ambiguous development versions rather than guessing commit dates. The actual
`parser_version` stamp is `GitTag+GitCommit`; SemVer build metadata is retained in
the preview but does not change release ordering. When present,
`versions["chronicle"]` must agree with that release. A missing exact stamp or the
schema's `0.0` placeholder may use the persisted Chronicle tag; other malformed
or conflicting stamps still skip. An existing
receipt for this script also skips, without another receipt or ratings enqueue.

Before downloading event streams, the job may skip when **every relevant ranked
Lucifron encounter** explicitly lists exactly one Lucifron GUID and two distinct
Flamewaker Protector GUIDs, no additional hostile entries, and usable nonempty
activity periods. Existing source identity, version, receipt, and structural
checks still apply. Missing/empty/ambiguous activity, additional hostiles, or any
nonmatching ranked encounter falls back to normal event replay.

The reason is **"Skipped: encounter activity lists only Lucifron and his
protectors"**. This metadata-only shortcut intentionally accepts possible false
negatives: hostile activity is not proof that stored damage is correct, and
incidental damage absent from activity metadata may remain unrepaired. It creates
no receipt, queues no ratings, and changes no source data. Its locked revalidation
checks the metadata fingerprint without fetching event blobs.

The only mutable source fields are Lucifron ranking rows' `damage_done`,
`unranked_damage_done`, and `dps`. The evaluator replays effective stored damage
against the repository target rule and preserves the recorded duration. It does
not modify healing, absorbs, HPS, role/spec/subspec/talents, survival, encounter
boundaries, speedrun proof, event blobs, or any other boss. Original per-event
unranked flags remain unchanged. Missing/corrupt structural evidence is a skip.
The public report and receipt carry before/after values and explicit attribution
omissions; they never assign uncertain pet damage to a guessed current owner.
An eligible verified no-op still records a receipt and queues ratings on Apply.

Complete clean Lucifron kills are supported. Wipes without rankings are ignored
and remain untouched; non-clean attempts with ranking rows are conservatively
unsupported. Direct-player replay does not require the modern classification
stream: a complete effective-damage upper bound must reconcile independently to
each player's persisted ranked + unranked total. Pet/totem rollup requires proven
encounter-terminal ownership, matching the parser's fight-end aggregation rather
than an instance's current owner. Explicitly ownerless terminal pets can produce
omissions without invalidating reconciled player totals. Uncertain nonplayer
credit mixed with player damage cannot be proved by equal totals alone and skips;
unsupported control histories still skip rather than guessing possession expiry. These are
evidence limits, not a claim to support every historical log.

Version-1 `details` has this stable shape (arrays are always arrays, not null):

```json
{
  "parser_version": "v1.0.172",
  "rule_version": "v1.0.173",
  "ranked_target_entries": [12118, 12119],
  "players": [{
    "encounter_id": "UUID",
    "player_guid": "0x0000000000000001",
    "player_name": "Player",
    "before_ranked_damage": 600,
    "after_ranked_damage": 400,
    "before_unranked_damage": 60,
    "after_unranked_damage": 260,
    "before_dps": 10,
    "after_dps": 6.666666666666667
  }],
  "omissions": []
}
```

Omissions use `encounter_id`, `stream`, `unit_guid`, `amount`, `count`, and `reason`,
and are accompanied by visible warnings. The example is synthetic, not an
actual-instance validation or authorization to apply. No real-log parity is
claimed without a separately captured historical source and independent replay.


### Evidenced Lucifron player control (version 2)

Flamewaker Protector (12119) control of players via spell 20604 is accepted only
with matching stored addon aura-cast duration and contemporaneous classification
history. Repeated snapshots do not renew expiry; the parser's lazy-expiry
boundary is preserved. Targetless and self-targeted aura casts create no control
state, matching the possession synthesizer. Missing/malformed casts, unsupported
controllers or spells, creature control, owner chains, unmatched gains, and
unproven control crossing into the encounter still skip.

The production damage tracker retains direct-player credit while a player is
controlled and excludes damage against players even when temporarily hostile.
The repair follows those semantics rather than counting controlled players as
ranked targets or transferring their damage to a protector. Full historical
player-total reconciliation and existing pet/omission safeguards remain required.
Passing control validation does not imply that the rest of a log is repairable.

A read-only event-stream probe of the supplied public sample established two
15-second targeted control effects and one targetless no-op. An independent
production-tracker replay reconciled all 33 exported player totals: 1,045,793
full damage, with a reference target split of 855,355 ranked / 190,438 unranked
over 39.580 seconds. The new evaluator passes the control evidence but still
skips on separate uncertain nonplayer-credit evidence (missing encounter-terminal
ownership snapshots); those reference figures are **not an applied repair or a
ready preview**. The export lacks the current unranked database column and exact
parser stamp, so the probe used the persisted release tag and disclosed historical
zero-column default, not fabricated current database values. No real apply was run.
