# Hodir pipeline reference

Use this as a navigation map, not a requirement to modify every file for every new boss. Verify symbols against the checkout before changing them.

## Migration precedent

- `database/migrations/000380_add_encounter_variant.up.sql`: nullable columns on `log_instance_encounters` and `encounter_dps_rankings`; appends the column to `encounter_dps_rankings_resolved` without changing difficulty normalization.
- `database/migrations/000381_leaderboard_encounter_variants.up.sql`: separate exact-variant rating observations, benchmarks, subjects, and dirty queues. Existing Combined materializations remain intact. New tables have composite keys and forced tenant RLS.
- `database/migrations/000382_parse_encounter_variants.up.sql`: `parse_variant_memberships` and `parse_variant_results`, with source-instance/log-group cascade relationships where applicable.

The feature branch originally used 374 through 376, then moved to 380 through 382 before deployment because main had acquired those numbers. Do not copy the original numbers or edit these migrations to onboard the next boss.

Separate exact tables avoided rebuilding populated Combined unique indexes at startup. Do not create another table family per boss. Extend the existing variant key and allowed-key constraints deliberately. New key validation on populated tables needs its own lock/scan assessment.

`CREATE TABLE ... LIKE ... INCLUDING CONSTRAINTS` does not copy foreign keys or RLS policies. Inspect lifecycle cleanup, explicit relationships, and tenant isolation rather than assuming LIKE duplicates them.

## Finalization and persistence

- `combatlog/parser/common/encounter/encounter.go`: finalized encounter identity.
- `combatlog/parser/common/instances/common.go`: optional variant resolver hook.
- `combatlog/parser/common/instances/hookable.go`: applies the resolver after final encounter classification.
- `combatlog/parser/wotlk/instances/raids.go`, `variants.go`: Ulduar registration and Hodir rule.
- `chronicle/logparse.go`: encounter insertion and ranking persistence. Preserve existing kill predicates and speedrun handling.
- `database/queries/parsedlogs.sql`, `rankings.sql`: source writes and reads.
- `api/chroniclesdk/log.go`, `rankings.go`; `api/db2sdk/convert.go`: transport propagation.

## Published ratings

Combined and exact cohorts are separate evidence/publication paths, not multiple raw kills.

- `database/queries/leaderboard_project.sql`: additive variant evidence kinds, source replacement, deletion, and dirty scopes.
- `database/queries/leaderboard_materialize_variant.sql`: exact player/guild boss materialization.
- `database/queries/leaderboard_d2_variant.sql`: exact queue claim and publication machinery.
- `database/queries/leaderboard_read.sql`: selected exact/Combined reads and multi-boss aggregation.
- `database/queries/leaderboard_integration.sql`, `leaderboard_operations.sql`, `leaderboard_operation_results.sql`, `leaderboard_continuation.sql`, `leaderboard_diagnostics.sql`, `leaderboard_d2.sql`: invalidation, operations, and worker integration.
- `internal/services/serviceratings/projector.go`, `worker.go`, `operations.go`: runtime lifecycle.
- `internal/leaderboardread/selection.go`: per-boss validation, original Renown awards, and selection fingerprinting.
- `api/leaderboard_v2.go`: API decoding and board/read selection. Boss-leader summaries stay Combined.

Keep player DPS/HPS and guild boss cohorts distinct. Guild boss ratings use kill duration but are not the Speedruns tab. No exact clear observations or variant Renown facts should be introduced merely to enable another boss.

## Individual-report parses

- `database/queries/parse_score_memberships.sql`: integrates classified source membership refresh.
- `database/queries/parse_variants.sql`: exact cohort membership, scoring inputs, and persisted results.
- `database/queries/parses.sql`, `rankings.sql`: instance source rows and Combined paths.
- `internal/services/servicerankings/worker_compute_parse_scores.go`: exact result computation alongside existing Combined results.
- `internal/services/servicerankings/encounter_variant_parses.go`: cohort cache, persisted exact results, and response application.
- `internal/services/servicerankings/handler_instance_parses.go`: instance response wiring.

`applyVariantParses` must not leave an inherited Combined score on a classified row that cannot be exactly scored. Persisted parse results/receipts have lifecycle semantics: do not bypass them or assume a new deployment automatically recomputes history.

## Performances and Statistics

- `internal/services/servicerankings/ranking_encounter_variants.go`: validates/canonicalizes per-boss maps for these endpoints.
- `internal/services/servicerankings/servicerankings.go`: request scope and unsupported success-rate guard.
- `database/queries/rankings.sql`: filters before leaderboard/spec/kill-time aggregation.
- `frontend/chronicle/src/api/rankingsQueries.ts`: parameters, query identities, and hooks.

Propagate encounter names, difficulty, size, and realm along with variants. The exact success-rate endpoint is intentionally unsupported because Hodir failures remain unclassified.

## UI and prototype

- `frontend/chronicle/src/components/EncounterDifficulty/encounterVariant.ts`: supported bosses, variant keys, highest tier, active map, and supported-tab policy.
- `frontend/chronicle/src/components/EncounterDifficulty/EncounterVariant.tsx`: chips and badge.
- `frontend/chronicle/src/pages/Leaderboards/LeaderboardsLiveHub.tsx`: retained selection, disabled-state explanation, requests, and unavailable-statistics handling.
- `frontend/chronicle/src/pages/Leaderboards/Hub/EncounterSidebar.tsx`, `LeaderboardHub.tsx`: production desktop/mobile selector composition and optional presentation slots.
- `frontend/chronicle/src/pages/Leaderboards/Hub/LiveHubRatings.tsx`, `v2RatingAdapter.ts`, `StatisticsTab.tsx`: rating requests and statistics display.
- `frontend/chronicle/src/pages/Instance/InstancePage.tsx`, `InstancePageView.tsx`, `transformInstance.ts`: raid-report badge propagation.
- `frontend/chronicle/src/pages/Leaderboards/Ratings/UlduarVariants.stories.tsx`: interactive design fixture. Freya/Yogg/XT examples in this story are illustrative, not shipped detectors or allowed backend cohorts.

Prototype story ID: `pages-leaderboards-ratings-ulduar-variants--combined`. Verify the local Storybook index before linking it.
