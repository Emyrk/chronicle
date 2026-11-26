# Lunatic dungeon ratings

Migration `000400` adds a dedicated `lunatic` layer requiring both `lunatic` and
`vanilla`. Lunatic is an explicitly approved exception to the exclusion of
server identity tags from leaderboard policy. Vanilla and Nightmare of Ursol
without Lunatic do not enable these dungeon policies.

## Initial calibration

| Dungeon | Enabled boss encounters | Default-set encounters | Renown per complete roster | Career weight |
| --- | ---: | ---: | ---: | ---: |
| Ragefire Chasm | 4 | 4 | 5 | 1 |
| Deadmines | 10 | 8 | 11 | 3 |
| Wailing Caverns | 11 | 10 | 12 | 3 |
| Shadowfang Keep | 8 | 8 | 9 | 3 |

Every enabled boss awards 1 Renown per eligible kill. Bazzalan, Edwin VanCleef,
Mutanus the Devourer, and Archmage Arugal award 2 instead. These are per-kill
awards, not one-time clear bonuses. Career weights are independently approved;
they are not calculated from Renown totals.

Names come from `combatlog/parser/common/instances/hostiles.go`, not from
speedrun requirement labels. Sneed's Shredder and Sneed share the ranked
encounter `Sneed`. Miner Johnson, Jared Voss, and Deviate Faerie Dragon award
Renown independently but are not required for default-set averages. SFK's
Prelate Ironmane and Spectral Cleric are registered as adds, not ranked boss
encounters, so they are not seeded as separate bosses. No parser or speedrun
rules change in this migration.

The career scope is the existing exact empty difficulty / zero-size cohort,
not an invented `Normal`/5 variant. Both career averages and Renown are enabled.
Career activation still requires eligible tenant/realm evidence.

## Level-one performance limitation

The current Lunatic parser restricts ranking eligibility to known level-one
participants. Zero talents or missing talent snapshots resolve to `Unknown`.
The spec-mode projector preserves their metric-independent Renown facts but
excludes them from Mastery/Peak rating observations. Armory career totals can
therefore include their Renown, while performance averages remain unavailable
until a separately approved class/no-talent cohort policy exists. The configured
weights do not manufacture specs or performance observations. Switching to class
mode is not a drop-in fix because class-mode player careers are unsupported.

## Rollout and historical evidence

- The migration inserts small literal catalog/configuration rows only. It does
  not scan historical logs, rewrite score tables, or enqueue a startup backfill.
- Once applied, `/api/v1/leaderboard-configuration` should expose the four
  instances, bosses, awards, and default sets for the Lunatic tenant. The dungeon
  detail adapter then loads configured bosses and cohorts normally.
- New eligible evidence uses the existing projector and career pipeline.
- Existing projected Renown facts can be picked up by career reconciliation;
  absent historical facts need an explicit D1 repair, not just a career refresh.
  Review cost and the exclusive UTC completion-date boundary before using the
  tenant-scoped operation in [operations.md](operations.md).
- If old logs lack raw rankings because the previous parser rejected eligibility,
  reparsing is necessary. A leaderboard repair cannot invent missing source data.
- Verify one repaired dungeon on both the dungeon board and the Armory career
  response before expanding repair scope. Check freshness/refresh-pending and
  allow for public leaderboard response caching.
- Historical repairs and production migration application are operator actions;
  neither is performed automatically by this code change.
- Rollback deletes only exact seeded values. If awards, weights, membership, or
  enablement were customized later, foreign keys refuse the rollback instead of
  destroying those edits. Resolve the customized policy explicitly first.
