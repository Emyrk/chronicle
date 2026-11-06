# Leaderboard v2 behavior

This document states externally observable and testable behavior. Formula
definitions and design gates live in [`spec.tex`](spec.tex). Physical rating
DDL is deferred until the season and provenance contracts are settled.

## Delivery boundary and unresolved gates

Peak and Mastery are realm (season) based. Exact season identity, lifecycle, and
temporal boundaries are unresolved. Do not equate all-time within a chosen
realm/season with all-time across seasons. Do not invent a season table or time
windows. Observation, benchmark, subject, and queue-key implementation is
blocked
until this contract is settled; park the existing observation-schema draft.
Renown temporal scope is a separate open decision. Layered configuration
provenance and invalidation also require design review before result schema.

Career and cross-instance portfolios are deferred, including schema, seeds, and
read aggregation. Foundation work changes no existing UI behavior. Parser
mechanics remain in Go; the database is the intended leaderboard configuration
source. Prior ratings are removed; merged PR 1625 preserves parse scoring. No
legacy-rating rollback is promised.

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

Within one tenant, realm, and chosen season, a player boss cohort is identified
by boss, class, specialization, sub-specialization, and metric. A guild boss
cohort selects one boss; a guild clear cohort selects one clear. Realm isolation
is mandatory, not merely a read filter. The physical season identity is
unresolved. Benchmarks, subjects, and dirty keys must share that eventual scope;
tenant-only cohort keys must not be implemented.

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

A benchmark change immediately changes read-time Peak. It also dirties every
subject in the cohort because every normalized observation used by Mastery
changed.

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

The materialized result stores observation count, raw peak metric, Form, Floor,
Mastery, effective-configuration provenance, and computation time. The layered
provenance representation remains unresolved. Normalized Peak is not
duplicated on every subject row.

When no observations remain for a dirty subject, its result row is deleted.

## Boss-group aggregation

A later request may select one exact boss, a named instance encounter set, or
an arbitrary group of eligible bosses within the chosen realm/season. Aggregate
Peak and Mastery are calculated
at read time from boss subject results and current benchmarks.

Missing evidence for an included boss contributes zero. Bosses have equal
weight. Excluded bosses are removed from the effective selection and
denominator,
not counted as zero. Never divide by zero for an empty effective selection; its
API presentation is
a later read-contract decision.
Instance encounter-set and arbitrary-group results are not initially
materialized.
Career/cross-instance portfolio aggregation is not part of this delivery.

Leaderboard results use deterministic ordered cursors. Peak boards order by
derived Peak descending, then realm ID and subject ID ascending. Mastery and
Renown boards use the same tie breakers after their descending score. Aggregate
boss-group boards order by the derived aggregate followed by realm and subject.
The cursor contains the ordered score, realm ID, subject ID, and a fingerprint
of the selected exact bosses and encounter set, realm/season scope, cohort
dimensions,
metric, and filters.

Realm/season scope and search filters apply before aggregation and ordering.
There is no
ordinal rank to preserve outside the filtered result. A cursor used with a
different fingerprint is rejected. A ruleset revision or ordinary result
mutation does not by itself invalidate a cursor; normal keyset pagination
semantics apply while eventual updates converge. Pages are expected to contain
at most about 50 rows. The product does not require exact ordinal ranks or
arbitrary page numbers.

## Renown

Player and guild Renown facts project canonical boss kills while removing the
player metric. DPS and HPS observations from the same player kill produce one
player Renown fact.

Renown is the sum of the effective nonnegative award for each eligible canonical
kill fact in its scope, whose temporal contract remains unresolved. It does not
depend on raw metric value, benchmark, Peak, Mastery, or clear
completion.

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
size, insertion order, or server tag. Compatible assignments may compose.
Global configuration is shared; tenant evidence and results are not.

Boss, instance, set, and member overrides support explicit exclusion. Absence
inherits. Disabled bosses leave effective sets, aggregate denominators, and
Renown eligibility without changing parsed history. Instance/set/member
exclusions remove their affected selection. Set membership itself does not
control Renown awards or eligibility.

Renown uses boss defaults with instance-variant overrides. Explicit zero
overrides
a default; absence inherits it. Awards are independent of set membership.
Vanilla awards are not automatically zeroed for TBC or Wrath. Values must be
explicit reviewed seed data, not reads or extraction from migration 313 or
retired rating tables. No speculative awards or difficulty variants are added.

Results need computation time and effective-configuration provenance. A single
ruleset ID/revision is not an established representation for composed layers.
Choose the provenance representation and layered invalidation/repair contract
before implementing result schema. Continued reads during rolling repair remain
the intent, not a reason to ignore current explicit exclusions.

## Dirty work (later pipeline, gated)

These are intended processing behaviors, not approval of physical keys. All
observation, benchmark, subject, and queue implementation waits for the season
contract; Renown keys also wait for its scope decision.

Source mutations upsert a dirty canonical-run key. A dirty-run refresh compares
the old and new projection and dirties the union of their benchmark, subject,
and Renown keys. This includes old keys when evidence moves or disappears.

Dirty benchmark refreshes recompute shared maximums or minimums. If the
benchmark changes, they insert every current subject in that cohort into the
matching dirty-subject table with a set-based statement.

Dirty subject refreshes recompute one bounded page of boss or clear results
entirely in PostgreSQL. Dirty Renown refreshes do the same for Renown subjects.

Every dirty key carries a monotonically increasing revision, `dirtied_at`, and
`process_after`. Upload mutations apply a sliding 30-minute debounce only to
dirty-run rows. Repair or administrative run dirt and all downstream benchmark,
subject, Renown, and persisted tenant dirt are due immediately. A row is due
when `process_after <= now()`; future rows do not cause scheduler dispatch.

Refresh functions claim bounded due pages with `FOR UPDATE SKIP LOCKED` and
acknowledge only the revision they processed. A newer revision therefore
survives a racing refresh. Flavor or configuration changes require persisted,
bounded expansion into
affected downstream scope keys. Its layered invalidation contract is unresolved.

PostgreSQL functions perform all derivation, replacement, fan-out, and
acknowledgement. They do not loop row by row. Go may invoke bounded functions
repeatedly, but it does not fetch evidence or calculate results.

## Required acceptance scenarios

After the design gates close, the rating pipeline must cover these database
integration scenarios in addition to foundation tests:

1. A canonical visible run projects player and guild observations and Renown
   facts.
2. A duplicate, unlisted, invalidated, deleted, or replaced run contributes no
   stale evidence.
3. Moving evidence between cohorts dirties both the old and new keys.
4. An ordinary observation change recomputes only directly affected subjects
   when the benchmark is unchanged.
5. A new or removed record changes the benchmark and dirties the entire cohort.
6. One, two, and at least three perfect observations produce Mastery ceilings of
   30, 80, and 100 respectively.
7. Empty Form and Floor bands contribute zero.
8. Player benchmark zero does not divide by zero.
9. Subjects with no evidence have their materialized result deleted.
10. A racing dirty revision cannot be lost by acknowledgement.
11. Two refresh callers cannot claim the same dirty key.
12. Peak reads reflect a changed benchmark before cohort-wide Mastery repair
    finishes.
13. Serving reads remain available while ruleset revisions are mixed.
14. Cursor continuation is deterministic and does not require exact rank.

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
6. Reviewed explicit seeds match approved source fixtures, without migration 313
   or retired-table dependencies, invented awards, or difficulty variants.
7. Shared configuration never merges tenant data. Later pipeline tests must also
   prove realm and agreed season isolation for benchmarks, subjects, and queues.
