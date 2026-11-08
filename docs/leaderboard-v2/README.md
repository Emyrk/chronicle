# Leaderboard v2

Status: configuration and raw-statistics schema complete; isolated read preview

This directory defines Chronicle's replacement rating and leaderboard system.
The [LaTeX specification](spec.tex) is the authoritative mathematical and
conceptual model and configuration decisions. [Behavior](behavior.md) translates
that model into observable requirements. The [implementation
plan](implementation-plan.md) defines the intended Graphite stack and validation
gates.

The [table relationships](table-relationships.md) reference maps migration 345
tables to evidence, summary, and repair responsibilities. The
[read preview](read-preview.md)
documents `/leaderboard-v2`, local synthetic fixtures, and measured SQL plans.

The replacement is a clean implementation. Prior ratings are removed; merged PR
1625 preserves parse scoring. Retired rating tables are neither migration or
seed inputs nor a rollback target. Existing leaderboard routes stay unchanged
until a later cutover. The isolated
read preview does not install evidence writers or refresh workers.

## Next implementation work

The [materialization plan](materialization-plan.md) is the durable handoff for
six remaining implementation PRs after the accepted read preview: D2 calculation,
D2 orchestration, D1 repair, direct evidence/action integration, historical
bootstrap/operations, and rollout validation. Caching remains deferred.

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
  Store count and raw player band statistics or guild reciprocal-duration band
  statistics; normalize all scores from shared current benchmarks at reads.
  Benchmark-only changes never fan out dirty subject statistics. Renown stores
  metric-independent kill counts, with points derived from current awards.
- Keep parser mechanics in Go; the database is the intended configuration
  source. Later rating derivation and maintenance use bounded PostgreSQL
  functions.

## Current delivery and exclusions

Configuration PRs 1622, 1624, 1633, and 1634 are complete, together with
inspector PR 1636 and Wrath migration 344. Migration345 adds evidence, raw
sufficient statistics, kill counts, and dirty-work tables. The read preview
serves current summaries separately from existing boards. Workers, historical
backfill, and UI cutover remain out of scope.

All rating scopes, including Renown, are all-time. There are no rolling180day or
season dimensions, expiry jobs, or finalized-season retention exceptions. Source
deletion enqueues coarse D1 repair and leaves evidence intact until D1
atomically marks D2 for old/new scopes and removes the stale projection. Normal
ingestion writes canonical evidence and enqueues exact-scope D2 atomically,
without a mandatory D1 upload path or debounce. No integrity triggers, source
cascades into evidence, or evidence FKs that block source deletion are used.
Writers and reconcilers enforce tenant/source/canonical correctness.
Career/cross-instance portfolios remain out of scope.

Boss/clear cohorts separate difficulty and raid size within one tenant; realm
qualifies subject identity, not benchmarks. DPS and HPS are separate cohorts; each
player kill qualifies for one of them (greater raw value, DPS on ties).
Raw projection and algorithm versions are repair metadata ignored by reads;
in-place repair may temporarily expose mixed versions. They are not composed
read-policy versions or a snapshot mechanism.

See the [materialization plan](materialization-plan.md) for remaining pipeline
work and rollout validation; the [earlier plan](implementation-plan.md) records
the schema delivery boundary. Cutover needs a disable/revert
strategy, not rollback to removed legacy ratings.

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
