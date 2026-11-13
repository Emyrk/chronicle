---
name: encounter-variants
description: Adds and maintains Chronicle boss-specific encounter variants and hard-mode cohorts, using Hodir as the reference implementation. Use when onboarding another Ulduar hard mode, changing variant detection, extending variant keys, or modifying variant ratings, parses, filters, or rollout behavior.
---

# Encounter variants

Extend the existing encounter-variant pipeline, not raid difficulty or speedrun eligibility. Hodir established the full path from finalized encounter evidence to exact rating cohorts and individual-report parses. Most subsequent bosses should reuse that plumbing rather than create another parallel scoring system.

## Start with three acceptance scenarios

Before editing, write concrete fixtures for:

1. A successful classified kill eligible under the existing board policy appears in Combined and exactly its own variant cohort, with the correct raid-report badge and DPS/HPS parses.
2. An unknown or incomplete encounter, or historical row without persisted classification, remains Combined-only. Exact history requires the supported reparse/reprojection path. Missing exact evidence never substitutes a Combined percentile.
3. Two selected bosses use independently chosen cohorts; switching to an unsupported tab preserves choices but disables them and uses Combined data.

For a multi-tier boss, add a fourth: adjacent tiers cannot leak into one another, and the Hard mode shortcut selects the explicitly configured highest tier, not a union of tiers.

Load `combat-log-parsing` for detection, `database-sqlc-patterns` for storage/query changes, `cache-management` for cached cohort changes, and `flake-audit` for tests. Load HTTP/frontend skills when changing their boundaries.

## Invariants

- `encounter_variant` is independent of `difficulty_name` and `max_players`. Do not encode hard mode into raw difficulty or change the boss name to split a board.
- Combined is a query selection, not a stored variant. It pools all eligible observations, including NULL history. Do not average separately computed variant scores to produce Combined.
- NULL means unclassified, not Normal. Normal is an explicit classification.
- Each boss has one selected cohort: Combined, Normal, or one specific variant. Different bosses may select different cohorts. Arbitrary unions of variants for one boss are not supported.
- Hard mode is a shortcut to each supported boss's highest tier. It does not create an “all hard modes” cohort.
- Career ratings and Overview/summary cards use Combined for this dimension. Existing difficulty, size, realm, and tenant scope still apply.
- Renown uses the original base-boss counts and configured awards. Adding a hard variant does not introduce another Renown scale.
- Full-clear speedruns and per-boss speedrun boards retain their existing timing, eligibility, and cohorts. Variant classification does not remove a kill.
- Individual raid reports show a variant badge, not a selector. Their DPS/HPS parses use the classified variant cohort; unclassified encounters use Combined.

## 1. Establish evidence and classification policy

Inspect the real raw combat log, parser output, and server script where available. A server-side spell or timer is only a candidate signal until confirmed in client logs. Check modern `spell_start`, `spell_go`, and aura streams rather than assuming the legacy cast stream is populated.

For each boss, record:

- Supported instance/map, game flavor, and boss identity.
- Stable machine keys, display labels, and highest-tier ordering. Do not infer ordering lexicographically.
- Positive success/failure evidence, encounter boundaries, and reset/wipe behavior.
- What remains unknown when evidence is missing.
- Whether classification is available for failed attempts as well as successful kills.

Do not generalize Hodir's duration rule to another boss without evidence and an approved rule. Detection must run after encounter outcome and timing are finalized, not on a player's damage window or the whole log duration.

### Hodir reference policy

`combatlog/parser/wotlk/instances/variants.go` contains `ulduarEncounterVariant`:

- Wrath, Ulduar map 603, boss Hodir only.
- Successful `clean` and `partial` outcomes qualify for classification. Partial means the boss died while adds remained, not proof of a truncated log. This does not override board eligibility: the published player/guild boss projection currently requires clean kills. Preserve that predicate unless a separate policy change is approved and tested.
- Positive finalized `Combat.End.Sub(Combat.Start)` below 180 seconds is `hard`; 180 seconds or longer is `normal`.
- Missing/nonpositive duration, unresolved fights, wipes, resets, other bosses, and other flavors remain unclassified.
- The policy trusts parsed duration. A late-started client log can understate the fight; the operator handles abuse through log invalidation. Do not silently add a new start-reliability heuristic.

During the Hodir investigation, the supplied over-three-minute Chromiecraft raw log contained neither `62501` (Shatter Chest) nor `65272` (Shatter Chest Timer). Their presence in AzerothCore source did not make them usable client-log signals. Absence of either spell is not proof of hard-mode success.

## 2. Extend keys and registration together

The Hodir implementation initially accepts only `normal` and `hard`, and several validators explicitly allow only Ulduar/Hodir. Adding a boss or tier requires updating every applicable allowlist, not merely the detector.

Check these extension points:

| Layer | Files / symbols |
|---|---|
| Finalized classification | `combatlog/parser/wotlk/instances/variants.go`, `raids.go`; `combatlog/parser/common/instances/common.go`, `hookable.go`; `combatlog/parser/common/encounter/encounter.go` |
| Ratings request validation | `api/leaderboard_v2.go`; `internal/leaderboardread/selection.go`, including `supportedEncounterVariant` |
| Performance/statistics validation | `internal/services/servicerankings/ranking_encounter_variants.go` |
| Schema key constraints | Variant tables introduced by migrations `000381_leaderboard_encounter_variants` and `000382_parse_encounter_variants` |
| Frontend keys/labels/ordering | `frontend/chronicle/src/components/EncounterDifficulty/encounterVariant.ts`, `EncounterVariant.tsx` |
| Request and cache identities | `frontend/chronicle/src/api/rankingsQueries.ts`; `pages/Leaderboards/Hub/v2RatingAdapter.ts`; server read fingerprints and parse cohort keys |

Search for `encounter_variant`, `encounter_variants`, `Hodir`, and explicit `normal`/`hard` guards in the touched packages. Include response metadata and badge labels in the search; rejecting a new key or labeling every non-normal key “Hard” loses multi-tier meaning.

Do not edit deployed migrations. A new boss using existing keys may need no schema change. New tier keys require a new migration extending existing CHECK constraints. That can scan populated tables: inspect production row counts/indexes, estimate lock and validation cost, and obtain approval for potentially slow startup work. Do not assume Hodir's empty-table migration safety carries over to extending populated tables.

## 3. Carry identity through every data path

Read `references/pipeline.md` when wiring persistence, publication, invalidation, or exact parse queries. It maps the Hodir implementation's source files and migration strategy.

Required flow:

1. Finalized encounter gets its variant without changing raw difficulty, kill outcome, start/end, or eligibility.
2. `chronicle/logparse.go` persists it to `log_instance_encounters` and `encounter_dps_rankings`. The latter holds both DPS and HPS data.
3. SDK conversion exposes it on encounter and parse responses.
4. Combined evidence continues to be emitted. Classified kills additionally enter exact-variant observations and memberships when eligible under each existing pipeline's kill predicates; classification alone does not grant eligibility.
5. Exact rating publication carries the dimension through dirty keys, leases, revisions, benchmarks, subject rows, reads, and invalidation.
6. Exact DPS/HPS parse membership/results and cohort cache keys include variant plus the existing tenant, metric, difficulty, size, spec, and temporal/version scope.

Ratings are precomputed. Filtering raw rankings alone is insufficient for Peak/Mastery. Conversely, raw Performances and Statistics must filter before deduplication, ranking, or aggregation, not filter an already computed Combined result.

When exact scoring is unavailable, clear any inherited Combined score/rank/sample fields and return the appropriate unavailable status. Cover unknown spec, zero metric, nonfinite inputs, and insufficient samples. Retain the original Combined results for their existing consumers.

Reparse, invalidation, deletion, and reclassification must remove stale exact evidence and enqueue the affected old and new cohorts. Preserve tenant isolation and publication fencing.

## 4. Use the production selector and honest tab behavior

Reuse `LeaderboardHub` and `EncounterSidebar`. Prototype extensions in Storybook against that composition, not a replacement dropdown that only resembles production.

The live wiring is in `frontend/chronicle/src/pages/Leaderboards/LeaderboardsLiveHub.tsx`:

| Surface | Variant behavior |
|---|---|
| Ratings Peak/Mastery | Exact per-boss selection; independently mixed with Combined bosses |
| Renown | Original base-boss calculation |
| Performances | Exact DPS/HPS row selection |
| Statistics | Exact spec distributions and boss kill-time distributions |
| Overview, rating overview, Speedruns, other unsupported views | Controls visible but disabled, retained choices, explicit Combined-only explanation |
| Individual report | Badge plus exact DPS/HPS parses; no selector |

Use per-boss chips and the Hard mode shortcut. Retain choices across tabs but send no exact filter on unsupported views. Keep prior HM/N styling. Canonicalize map serialization for cache/query identity; reset performance pagination when selection changes.

`encounter_variants` is a JSON object mapping selected boss names to one exact key; omit a boss for Combined. Ratings retain a legacy single-boss `encounter_variant` parameter, but performance/statistics validation requires the map. Do not assume both API families accept identical parameters.

### Statistics trap: successful-kill-only classification

Hodir wipes have no variant. Filtering attempts to `hard` would exclude the wipes and falsely imply a 100% success rate. With an exact variant active:

- Do not issue or display success-rate/attempt-count data, including previously cached Combined results.
- Show why it is unavailable. The success-rate endpoint rejects exact filters rather than silently ignoring them.
- Suppress the full-raid clear-time overlay with its Combined-only explanation.
- Continue showing supported exact distributions and boss kill times.

A future boss with attempt-level evidence does not automatically remove these restrictions. Design and validate that separate behavior explicitly.

## 5. Validate the complete contract

Run focused tests during iteration, then the repository's required generation, tests, builds, and lint before committing. Use the current package scripts and test configuration rather than assuming an old Storybook command still applies.

Reference regression suites:

- Detection/finalization: `combatlog/parser/wotlk/instances/variants_test.go`, `raids_test.go`.
- Persistence/query filtering: `database/encounter_difficulty_test.go`, `database/rankings_variants_test.go`.
- Rating validation/publication: `internal/leaderboardread/selection_test.go`, `api/leaderboard_v2_test.go`, `internal/services/serviceratings/variants_test.go`.
- Exact parses: `internal/services/servicerankings/encounter_variant_memberships_test.go`, `encounter_variant_parses_test.go`.
- Performance/statistics requests: `internal/services/servicerankings/ranking_encounter_variants_test.go`; `frontend/chronicle/src/api/rankingsQueries.test.ts`.
- UI: `EncounterVariant.test.tsx`, `LeaderboardsLiveHub.test.tsx`, `Hub/LiveHubRatings.test.tsx`, `Hub/v2RatingAdapter.test.ts`.

Minimum cases:

- Detector boundaries and adjacent tiers; clean/partial success, wipe/reset, invalid time, unsupported boss/flavor.
- Combined includes NULL and every classified tier; exact excludes NULL and every other tier.
- DPS and HPS, player and guild rating paths, independent multi-boss choices, realm/size/difficulty isolation.
- Missing exact membership never falls back to Combined, including unknown-spec/zero-value cases.
- Reclassification/deletion/invalidation removes stale evidence; existing career, Renown, summaries, and speedrun timing remain unchanged.
- Disabled controls retain selections without affecting requests; returning to supported views reapplies them. Add an actual tab-switch interaction when changing component lifecycle or route wiring.
- Exact statistics never show misleading success percentages, attempt counts, or full-clear overlays.

Generation/build pitfalls learned during Hodir:

- Regenerate SQL with `make gen/db` and SDK types through the standard `scripts/apitypings` path. Never hand-edit generated output to hide source-contract drift.
- If generation removes unrelated published types, compare Go source and committed generated interfaces. Repair the authoritative source with approval rather than deleting consumers. Hodir required restoring missing Go SDK declarations; this is not a normal step for every boss.
- `make build` can reuse frontend dist. Run an explicit `cd frontend/chronicle && pnpm build` to prove TypeScript and a clean frontend compilation.
- Verify Storybook's live index contains the story before sharing its URL; a server from another checkout can legitimately lack it.
- After merging main, check migration-number collisions and regenerate. Renumber only undeployed branch migrations, never deployed history.

## 6. Roll out without implicit history changes

Default to no backfill: old rows remain NULL and Combined-only. Classification requires source reparse; reprojecting an old NULL row does not invent its variant. Existing authoritative parse receipts can skip recomputation, so validate the supported reparse/membership/publication path before promising historical exact parses will populate.

For rollout, report what changed, tests run, migration lock/scan risk, and remaining unknowns. Begin with a bounded known kill and verify badge, exact board membership, exact report parses, and unchanged Combined/career/speedruns. Watch startup lock waits and variant publication queue depth before requesting a broad reparse.

Do not claim production-scale throughput from unit tests. Hodir's migrations avoided historical scans, but nullable ALTER TABLE operations still acquire locks, and additional projection branches/queues add work.
