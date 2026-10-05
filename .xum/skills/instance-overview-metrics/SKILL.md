---
name: instance-overview-metrics
description: Maintains Chronicle's persisted instance Overview metrics, cohort coverage, and metrics-version compatibility. Use when adding or changing instance_overview_metrics fields, parser aggregation semantics, Overview cohort queries, or Overview API contracts.
---

# Instance Overview metrics

Keep whole-run metrics comparable across singular raids and rankings-backed cohorts without loading combat streams for comparison instances.

## Versioning policy

- `internal/overviewmetrics.CurrentVersion` is the single source of truth for the latest supported metrics version.
- Writers always persist `CurrentVersion`.
- Singular and cohort read paths only return rows whose `metrics_version` equals `CurrentVersion`; older rows are ignored.
- Cohort responses must expose eligible-run count, current-version metric count, and current metrics version so panels can show incomplete population coverage.
- Before incrementing `CurrentVersion`, add a migration or reparse plan that converts all rows whose semantics remain valid. Do not silently mix versions in one population.
- If a metric's meaning changes, increment the version even when its SQL type does not.

## Metric contracts

- `requirements_complete` means every configured speedrun unit requirement is satisfied. It is independent of guild association and leaderboard qualification. It is null when no speedrun requirements exist.
- `encounter_span_duration_ms` is the interval from the first encounter start to the last encounter end.
- `total_combat_duration_ms` is the union of all encounter intervals.
- `total_boss_duration_ms` is the union of boss encounter intervals, including kills, wipes, and resets.
- `top_incoming_damage_abilities` ranks effective incoming damage to players and player-owned units. Effective damage includes absorbed damage through `combatmetrics.EffectiveDamage`.

## Adding or changing a metric

1. Define the parser-side base measurement. Reuse shared combat helpers rather than duplicating damage, healing, ownership, or attribution semantics.
2. Add or update the migration and sqlc query. Stable scalar values belong in columns; bounded display lists may use typed JSON; per-entity data belongs in child tables.
3. Persist the metric transactionally with the instance parse.
4. Add it to singular and cohort API contracts. Comparison instances must remain summary-only.
5. Add parser arithmetic tests, database/query tests when SQL behavior changes, and API conversion tests.
6. Regenerate with `make gen/db` and regenerate `frontend/chronicle/src/api/typesGenerated.ts`.
7. Run focused tests, `go test ./...`, frontend typecheck/tests, and the production build.

## Compatibility checklist

- [ ] Current-version rows only are returned.
- [ ] Older rows are ignored, migrated, or reparsed.
- [ ] Cohort coverage reports missing current-version rows.
- [ ] Metric names describe their exact semantics.
- [ ] Base measurements are persisted; ratios are derived where possible.
- [ ] Shared accounting helpers cover absorbs, pets, ownership, and other cross-panel rules.
