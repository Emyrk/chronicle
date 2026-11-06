# Leaderboard v2

Status: four-PR configuration foundation; later tenant-scoped rating pipeline

This directory defines Chronicle's replacement rating and leaderboard system.
The [LaTeX specification](spec.tex) is the authoritative mathematical and
conceptual model and configuration decisions. [Behavior](behavior.md) translates
that model into observable requirements. The [implementation
plan](implementation-plan.md) defines the intended Graphite stack and validation
gates.

The replacement is a clean implementation. Prior ratings are removed; merged PR
1625 preserves parse scoring. Retired rating tables are neither migration or
seed inputs nor a rollback target. Existing UI behavior stays unchanged until a
later cutover. Amend specification PR 1622 before continuing the stack.

## Authority

When documents disagree, use this order:

1. [`spec.tex`](spec.tex)
2. [`behavior.md`](behavior.md)
3. [`implementation-plan.md`](implementation-plan.md)
4. Existing rating documents and implementation

The following documents describe earlier explorations or the subsystem being
replaced:

- [`docs/mastery-renown-rating.md`](../mastery-renown-rating.md)
- [Historical rollout](../incremental-tenant-ratings-rollout.md)
- [`docs/tenant-ratings-catchup-design.md`](../tenant-ratings-catchup-design.md)
- [`docs/renown-fact-repair.md`](../renown-fact-repair.md)

They remain useful historical context, but they are not contracts for
leaderboard v2.

## Fixed decisions

- Share global configuration, never tenant rating data. Resolve one exact
  non-null tenant from each run's realm. Boss/clear cohorts remain tenant
  scoped; realm qualifies subject identity.
- Explicitly classify leaderboard-relevant flavors in `database/flavor.go`:
  `vanilla`, `tbc`, `wrath`, `nightmare-of-ursol`, and `vanillaplus` initially.
  Ignore server tags such as `octowow`, `capybara`, and `ravencraft`.
- Match layers whose required flavors are subsets of the relevant effective
  dataset-plus-tenant flavor union. More specific means strict set superset, not
  cardinality. Reject conflicting incomparable matches.
- Model instances, difficulty/raid-size instance variants, flat bosses, named
  ordered encounter sets, and explicit memberships. No logical boss parent or
  boss-variant entity. Sartharion 0D/1D/2D/3D are distinct exact bosses.
- Boss/instance/set/member overrides can explicitly exclude; absence inherits.
  Disabled bosses leave effective sets, denominators, and Renown, but parsed
  history is unchanged. Sets select exact bosses, default Sartharion 0D, with no
  best-variant substitution.
- Renown uses boss defaults and instance-variant overrides, including explicit
  zero. It is independent of set membership. Do not automatically zero Vanilla
  awards for TBC/Wrath. Use reviewed explicit seed values from historical
  calibration. Migration 313 may serve as an authoring reference for known
  values, but deployment must not execute or read old migrations or retired
  tables. Do not invent awards or difficulties.
- Preserve raw `encounter_dps_rankings.dps`/`.hps`,
  `time_parse_boss_scores.duration_ms`, and
  `time_parse_scores.clear_duration_ms` as canonical source values. Persisted
  parse scores are not rating inputs.
- Preserve the Peak/Form/Floor/Mastery formulas and metric-erasing Renown facts.
  Later scoped benchmarks and boss/clear results support read-time exact-set
  aggregation and ordered cursors without exact ranks.
- Keep parser mechanics in Go; the database is the intended configuration
  source. Later rating derivation and maintenance use bounded PostgreSQL
  functions.

## Deferred policy and delivery order

Realm/season isolation is only a deferred career/cross-instance portfolio
concern. Its exact identity, lifecycle, and temporal boundaries remain
unresolved. Do not add season columns or block current observation, benchmark,
subject, or queue implementation on that future policy. Boss/clear cohorts
remain tenant scoped and use all eligible observations; realm remains part of
player and guild identity.

DPS and HPS may produce separate observations today. Mutually exclusive damage
versus healing eligibility per player/boss is future observation policy, not a
current constraint. Career/portfolio schema, seeds, and read aggregation remain
deferred. Renown temporal scope and layered provenance/invalidation are separate
open decisions, not a season gate on boss/clear work.

The current delivery consists of exactly four PRs:

1. Amend specification PR 1622.
2. Schema-only PR 1624: structural catalog and flavor vocabulary.
3. Subset/override resolution queries and tests.
4. Reviewed initial configuration seeds and parity tests.

Policy reads, observations and the rating pipeline, and UI cutover are later
work. No season contract blocks later boss/clear work. Cutover needs a reviewed
disable/revert strategy, not legacy-rating rollback. See the [implementation
plan](implementation-plan.md) for the deferred backlog.

## Documentation validation

Compile `spec.tex` with Tectonic when available. Validate Markdown syntax and
local links for these four documents. Documentation-only revisions do not
require runtime/schema changes or an Overleaf push. Record unavailable
validators as blockers rather than claiming full validation.

## Package boundary

For later rating implementation, new application code belongs in:

```text
internal/services/serviceratings/
```

That package owns scheduling, API/query orchestration, cursor handling, logging,
and metrics. PostgreSQL owns observation replacement, benchmark calculation,
Mastery, Renown, dirty fan-out, and compare-and-swap acknowledgement.
