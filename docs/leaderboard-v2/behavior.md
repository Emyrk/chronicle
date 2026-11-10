# Leaderboard v2 behavior

This document states externally observable and testable behavior. Formula
definitions and configuration decisions live in [`spec.tex`](spec.tex).

## Delivery boundary

Configuration PRs 1622, 1624, 1633, and 1634 are complete, together with
inspector PR 1636 and Wrath migration 344. Migration345 adds evidence, sufficient
statistics, kill counts, and dirty-work tables. The isolated
[read preview](read-preview.md) serves those summaries without workers, historical
backfill, scheduler wiring, or replacement of existing leaderboard routes.

All scopes are all-time. There are no rolling180day or season keys, expiry jobs,
or finalized-season retention exceptions. Career aggregation has an approved
next-stage contract below, but is not yet implemented. Deletion and invalidation
must retract source evidence.

DPS and HPS are separate cohorts and boards. Each player kill qualifies for
exactly one of them: the greater positive finite raw value wins, with DPS
winning ties. This is per kill, not a role classification.
Parser mechanics remain in Go. Prior ratings are removed; PR 1625 preserves
parse scoring. No legacy-rating rollback is promised.

## Source eligibility

A source contributes only when all of the following are true:

1. `ranking_runs` selects its instance as the representative of the canonical
   run.
2. The log and instance are listed and not invalidated.
3. The run realm resolves through its server to exactly one non-null tenant.
4. The source dimensions agree with the projected boss or clear identity.
5. Guild observations have a guild in the same realm.

A duplicate upload contributes no additional evidence. Replacing, deleting,
unlisting, invalidating, or recanonicalizing a run retracts its old projected
evidence.

## Observations

Player observations persist `encounter_dps_rankings.dps` and `.hps`. Guild boss
observations persist `time_parse_boss_scores.duration_ms`; guild clear
observations persist `time_parse_scores.clear_duration_ms`. Precise/display
scores, ranks, sample sizes, statuses, windows, and policy versions from those
tables are not rating inputs. Observations do not persist normalized parse
scores.

Player rows must belong to the representative instance. Guild time-parse rows
must match the canonical run, representative instance, source realm, exact
tenant, and guild; boss rows must also identify an encounter in that
representative instance. The parent instance must be listed and not invalidated.

Player observations are unique by canonical run, boss, player, and metric. Guild
boss observations are unique by canonical run, boss, and guild. Guild clear
observations are unique by canonical run, clear, and guild.

## Cohorts and benchmarks

A player boss cohort is identified by tenant, boss, class, specialization,
sub-specialization, and metric. A guild boss cohort is identified by tenant and
boss; a guild clear cohort by tenant and clear. Realm qualifies player and guild
subject identity but does not partition the benchmark cohort. Current boss/clear
results use all eligible observations, without a season or window dimension.
Both difficulty and raid size are part of every boss/clear identity and must not
be pooled. Benchmark and subject dirty keys mirror these identities.

The current player benchmark is the maximum raw DPS or HPS in the complete
cohort. The current guild benchmark is the minimum positive duration in the
complete cohort.

For player metrics:

```text
normalized = 0                                             when benchmark = 0
normalized = min(100, 100 * metric_value / benchmark)      otherwise
```

For guild durations:

```text
normalized = min(100, 100 * benchmark / duration)
```

A benchmark-only change immediately affects read-time Peak, Form, Floor, and
Mastery without dirtying any subject sufficient statistics. Evidence changes
still dirty directly affected subjects, even when the benchmark stays unchanged.

## Boss and clear subject results

For one subject and cohort, order normalized observations ascending. For `n`
observations:

```text
ignored end = floor(0.20 * n)
floor end   = floor(0.40 * n)

ignored = positions 1 through ignored end
floor   = positions ignored end + 1 through floor end
form    = positions floor end + 1 through n - 1
peak    = position n
```

An empty band averages to zero.

```text
Mastery = 0.30 * Peak + 0.50 * Form + 0.20 * Floor
```

Materialize observation count and three benchmark-independent statistics:

- For players, sort raw DPS/HPS ascending; store raw Peak and arithmetic means
  of the exact Form and Floor bands.
- For guilds, sort reciprocal durations ascending; store peak reciprocal
  duration and arithmetic means of the exact reciprocal Form and Floor bands. Do
  not use the reciprocal of an arithmetic mean duration.
- Use the same band boundaries above, including zero for empty bands. Duration
  units must match between reciprocals and benchmarks.

At reads, multiply all three statistics by `100 / benchmark` for players (or
zero when the benchmark is zero) and `100 * benchmark` for guilds. Apply the
unchanged Mastery weights to those derived values. Positive common scaling
preserves band order and averages, giving exact equivalence in a coherent state.
A display clamp during transient benchmark/statistic skew does not claim exact
equivalence to individually clamping every observation in that mismatched state.

Do not persist normalized Peak, Form, Floor, or Mastery per subject. Raw
projection algorithm metadata is separate from composed current read policy.
Delete a subject's statistics row when no observations remain.

`projection_version` and `algorithm_version` are operational repair metadata,
not read eligibility. Reads ignore both fields, including when a benchmark and
subject carry different values. Rare changes are repaired in place; mixed old
and new summaries may be visible temporarily. There is no version snapshot or
old-leaderboard serving path. Projection rules describe source-to-canonical
eligible evidence transformations, deduplication, and player cohort
classification. Award-only configuration changes do not require evidence
rewrites or recounts.

## Boss-group aggregation

A later request may select one exact boss, a named instance encounter set, or an
arbitrary group of eligible bosses within the tenant. Aggregate Peak and Mastery
are calculated at read time from boss subject results and current benchmarks.

Missing evidence for an included boss contributes zero. Bosses have equal
weight. Excluded bosses are removed from the effective selection and
denominator, not counted as zero. Never divide by zero for an empty effective
selection; its API presentation is a later read-contract decision. Instance
encounter-set and arbitrary-group results are not initially materialized.
Career aggregation is a separate next-stage contract; it does not change these
existing boss-group reads.

Leaderboard results use deterministic ordered cursors. Peak boards order by
derived Peak descending, then realm ID and subject ID ascending. Mastery and
Renown boards use the same tie breakers after their descending score. Aggregate
boss-group boards order by the derived aggregate followed by realm and subject.
The cursor contains the ordered score, realm ID, subject ID, and a fingerprint
of the selected exact bosses and encounter set, tenant scope, cohort dimensions,
metric, and filters.

Realm and search filters apply before aggregation and ordering. There is no
ordinal rank to preserve outside the filtered result. A cursor used with a
different fingerprint is rejected. A ruleset revision or ordinary result
mutation does not by itself invalidate a cursor; normal keyset pagination
semantics apply while eventual updates converge. Pages are expected to contain
at most about 50 rows. The product does not require exact ordinal ranks or
arbitrary page numbers.

## Career contract (not yet implemented)

The authoritative formulas are in `spec.tex`, under Career aggregation contract.
The [foundation investigation](career-foundation.md) records outstanding seed values and read-contract
choices and next implementation steps.

- Each allowed exact instance/difficulty/max_players variant is independent,
  including 10/25 and Normal/Heroic. Wrath excludes Vanilla raids from all career
  totals, including Renown, even when uploaded. This restriction
  does not change the existing shared flavor resolver or existing boards.
- A variant is active iff the tenant has at least one currently eligible canonical
  boss kill in it. Losing the last eligible kill deactivates it. Neither a full
  clear nor a kill by the displayed subject is required.
- Career Mastery and Peak average raid-wide values using an explicit career weight
  per exact variant, independent of Renown awards or earned counts. Weights resolve
  at reads. Numeric seed values remain outstanding and must not be invented.
  Missing subject results in active average-eligible variants are zero-filled
  without shrinking the denominator. Inactive/disallowed/average-excluded variants
  leave the denominator. Never divide by zero.
- Obsidian Sanctum is excluded from career Mastery and Peak averages, including
  their denominator, but explicitly included in career Renown within the flavor
  whitelist. Average eligibility and Renown eligibility are separate policies.
- Optional bosses are excluded from raid-wide Mastery/Peak inputs and included in
  Renown when otherwise eligible.
- Career Renown sums eligible raid Renown without applying career weights.
- Players retain exact class/spec/subspec and realm-qualified identity. Preserve
  both DPS and HPS raid inputs. Select the metric by career Mastery, then eligible
  unweighted kill count in that metric and cohort, then DPS. Persist that choice
  eventually; Peak uses the same metric. Renown stays metric-independent.
- Guild careers use realm-qualified guild identity and boss-based raid-wide
  kill-time values, not clear-time scores.

The explicit-weight decision supersedes Renown-derived weights. No Sartharion
completion-group rule is needed for career weights. Numeric weights and empty or
zero-denominator API presentation still need decisions. Exact-cohort player Renown
also needs additional projection support because existing counts omit
class/spec/subspec. This documentation implements no production behavior.

## Renown

Independent metric-free facts represent eligible canonical player and guild boss
kills. DPS and HPS from one player kill produce one fact, not two. Facts do not
depend on scoring statistics, a normalized result, or a nonzero award. Each
independent canonical kill contributes once.

Materialize all-time kill counts per realm-qualified subject and exact boss plus
instance variant, preserving difficulty and raid size. At reads:

```text
Renown = sum(selected eligible boss/variant kill count * current effective award)
```

Do not store frozen points. Award-only changes, including explicit zero, change
current Renown without rebuilding kill counts. Current eligibility determines
which counts may contribute; the current exact-boss, named-set or arbitrary-group
selection determines which eligible counts are summed, without averaging. No
selection resolves to the default set. An empty default does not disable optional
bosses: explicitly selecting an eligible optional boss still earns its award. Set
membership does not determine awards. Retraction
removes the fact and refreshes the affected count. Renown remains independent of
metric value, benchmark, Peak, Mastery, or clear completion.

## Shared catalog and layered configuration

The catalog contains instances, instance variants (difficulty and raid size),
flat bosses, named ordered encounter sets, and explicit ordered memberships.
There is no logical boss parent or boss-variant entity. Sartharion 0D, 1D, 2D,
and 3D are distinct bosses. Sets select exact bosses; the default Sartharion
selection is 0D. Never substitute a subject's best variant for that selection.

Leaderboard-relevant flavors are explicitly classified in `database/flavor.go`:
initially `vanilla`, `tbc`, `wrath`, `nightmare-of-ursol`, and `vanillaplus`.
Server tags such as `octowow`, `capybara`, and `ravencraft` are ignored.

```text
effective flavors = relevant flavors intersect
                    ({dataset flavor} union {tenant flavors})
layer matches     = required flavors subset of effective flavors
more specific     = strict superset of another layer's required flavors
```

Normalize and deduplicate these unordered sets. Specificity is set inclusion,
not cardinality. Conflicting incomparable matches are rejected, not ordered by
size, insertion order, or server tag. Compatible assignments may compose. Global
configuration is shared; tenant evidence and results are not.

Boss, instance, set, and member overrides support explicit exclusion. Absence
inherits. Disabled bosses leave effective sets, aggregate denominators, and
Renown eligibility without changing parsed history. Instance/set/member
exclusions remove their affected selection. Set membership itself does not
control Renown awards or eligibility.

Renown uses boss defaults with instance-variant overrides. Explicit zero
overrides a default; absence inherits it. Awards are independent of set
membership. Vanilla awards are not automatically zeroed for TBC or Wrath. Use
explicit reviewed seed values from historical calibration. Known values in
migration 313 may be an authoring reference, but deployment must not execute or
read old migrations or retired rating tables. No speculative awards or
difficulty variants are added.

Raw projection algorithm compatibility is distinct from composed current read
policy. Do not invent a new provenance representation or assume one ruleset ID
represents all matched layers. Benchmark and award values are current read
inputs, not frozen subject payload or causes for unrelated raw-statistic/count
rewrites.

## Direct evidence writes, D1 repair, and D2 summaries

The data flow is source data -> canonical evidence -> summaries. Normal
ingestion and actions directly write canonical observations and independent kill
facts, enqueuing D2 for affected old/new scopes atomically with those evidence
writes. D1 is not a mandatory upload path, and no mandatory 30-minute D1
debounce delays every upload.

D1 is rare, coarse canonical-run repair for historical data, corrections, and
source deletion. It may be less efficient than the normal path. A source
deletion action enqueues D1 and leaves evidence intact. The reconciler
reconstructs canonical evidence from authoritative remaining sources, using an
empty projection when the source is gone or ineligible. It captures old evidence
keys and enqueues D2 for the old/new scope union before replacing or removing
the projection, all in one transaction. Stale evidence removal and summary
repair work cannot commit independently. Pending deletion repair is not a
finalized-season retention rule.

D2 is normal, frequent work for exact shared benchmark, subject raw-statistic,
and subject/boss/variant kill-count scopes. It consumes canonical evidence. A
benchmark-only change does not fan out subject work; an award-only change does
not dirty counts. Evidence changes refresh directly affected old/new scopes even
when the benchmark stays unchanged.

D1 and D2 jobs coalesce and use revision-safe acknowledgement. Newer revisions
survive racing refreshes; failures remain retryable. Due-work metadata supports
bounded scheduling, but this contract adds no fixed delay requirement. Optional
repair pacing and worker scheduling are later implementation work.

There are no integrity triggers. Local database constraints are structural only.
Tenant/source agreement, canonical choice, visibility, and cross-relation
identity correctness are enforced by writers and reconcilers. Source deletion
neither cascades into evidence nor is blocked by an evidence FK. Evidence and D1
work survive deletion so the old keys remain available to enqueue D2. The
schema-only PR adds no workers or action wiring.

## Required acceptance scenarios

Schema tests must cover structural identities, uniqueness, tenant dimensions,
realm-qualified subjects, separate difficulty and raid size, valid finite raw
values and positive durations, metric-free kill uniqueness, summary constraints,
and dirty-scope uniqueness/revisions/due indexes. New physical table names
belong to the schema implementation, not this behavior document. Verify the
absence of integrity triggers and source FKs that cascade evidence deletion or
block source deletion. Writer/reconciler correctness tests belong to their later
PRs.

Later projection, algorithm, and read tests must prove:

1. Duplicate uploads add no evidence; direct writes enqueue D2 atomically with
   canonical evidence changes.
2. Moving evidence dirties old and new scopes, including metric-free count
   scopes.
3. Raw player means and guild reciprocal means reproduce normalized band
   formulas, including empty bands and one/two/three-perfect-observation
   ceilings of 30/80/100.
4. Zero player benchmarks never divide by zero; durations are strictly positive.
5. Benchmark-only changes update every derived score without subject-stat
   fan-out.
6. Source changes refresh direct subjects even when the benchmark is unchanged.
7. Independent canonical kills count once, with no DPS/HPS double credit.
8. Award-only changes update Renown reads without count rebuilds or frozen
   points.
9. Source deletion enqueues D1 while leaving evidence intact. D1 enqueues D2
   using old/new keys before atomically removing stale evidence, regardless of
   age. Direct actions and repairs enforce canonical/source/tenant correctness
   without triggers; invalidation cannot leave unrepairable stale summaries.
10. Racing dirty revisions cannot be lost; failed work remains retryable.
11. No runtime refresh, backfill, serving, or UI cutover is introduced by the
    schema-only PR.

## Foundation acceptance scenarios

1. Relevant dataset and tenant flavors form an order-independent, duplicate-free
   union; server tags do not affect matches.
2. Subset layers match without an exact full-set ruleset. Strict supersets
   override inherited assignments. Conflicting incomparable matches fail even
   when their cardinalities differ.
3. Absence inherits and explicit exclusion disables at boss, instance, set, and
   member levels. Disabled bosses leave effective sets and denominators and earn
   no Renown; parsed history is untouched.
4. Explicit zero Renown overrides a boss default. Set membership changes do not
   alter awards; Vanilla awards remain unless explicitly overridden.
5. A default Sartharion 0D set never substitutes 1D, 2D, or 3D evidence.
6. Reviewed explicit seeds match historical calibration fixtures, with no
   deployment dependency on executing or reading old migrations or retired
   tables, and no invented awards or difficulty variants.
7. Shared configuration never merges tenant data. Later pipeline tests must also
   prove tenant-scoped benchmarks and realm-qualified subject identities, with
   matching dirty keys, separate difficulty and raid size, and all-time scope.
