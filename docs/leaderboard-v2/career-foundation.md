# Career foundation investigation

Status: accepted scoring contract, blocked full-raid definition. This change is
documentation only. `spec.tex` is authoritative, followed by `behavior.md`.
No career schema, worker, API, or UI is implemented here.

## Verified current behavior

- `internal/leaderboardconfig/resolve.go` resolves the union of dataset and tenant
  leaderboard-relevant flavors. It rejects conflict rows. `database/flavor.go`
  projects relevant tags without choosing one expansion. A mixed Vanilla/Wrath
  configuration is therefore not itself a career allowlist.
- `database/queries/leaderboard_read.sql`, `ListLeaderboardV2`, derives scores
  using current benchmarks and accepts exact boss arrays, awards, and a fixed
  denominator. Its current Renown path multiplies per-subject boss kill counts
  by current awards. It does not implement cross-raid careers.
- `database/queries/leaderboard_materialize.sql`,
  `ComputeLeaderboardPlayerRenownCount` and `PublishLeaderboardPlayerRenownCount`,
  group facts by tenant, realm, GUID, instance, difficulty, max_players, and boss.
  They do not carry class/spec/subspec. Career Renown for an exact specialization
  cannot reuse those counts or assign them using current character metadata.
- Shared catalog bosses are flat identities. Named-set membership is not Renown
  eligibility. Existing default selection is Sartharion 0D, without substitution
  of a subject's best drake variant.
- `database/migrations/000344_leaderboard_wrath_renown.up.sql` contains explicit
  normal Wrath 10/25 variant awards. No career weight multiplier exists in that
  seed. The migration must remain immutable.

## Exact configured-total ambiguity

The following are configuration arithmetic, **not approved career weights**.
They can be checked without querying a live database.

| Raid | Default set total, 10/25 | All enabled identities total, 10/25 | Problem |
|---|---:|---:|---|
| Naxxramas | 20 / 30 | 20 / 30 | No distinction in reviewed seed |
| Onyxia's Lair | 3 / 4.5 | 3 / 4.5 | No distinction in reviewed seed |
| Eye of Eternity | 2 / 4 | 2 / 4 | No distinction in reviewed seed |
| Ulduar | 36 / 54 | 38 / 57 | Flame Leviathan is outside default |
| Vault of Archavon | 0 / 0 | 4 / 8 | Enabled empty default, four awarded bosses |
| Obsidian Sanctum | 1 / 2 | 7 / 11 | Four mutually exclusive Sartharion identities |

Sartharion 0D/1D/2D/3D awards are 1/1/2/3 for ten-player and 2/2/3/4 for
twenty-five-player. A completion-group maximum would produce 3/4 instead of
7/11. That is only a proposal. The shared catalog does not encode that grouping,
and no grouping should be inferred by stripping suffixes from names.

Questions requiring a product decision:

1. Does full raid include optional enabled bosses outside the default set? This
   determines Ulduar and Vault totals and the raid-wide score selection.
2. How do mutually exclusive alternatives contribute to configured full-raid
   totals? Default-only, sum, and maximum have different meanings. If completion
   groups are chosen, define them once in shared configuration and specify how
   they relate to existing exact-boss raid scoring.
3. What should a career return when no active variant has positive weight?
   The mathematical contract forbids division by zero; API presentation remains
   undecided. This does not justify inventing fallback weights.

## Approved foundation constraints

- Direct weight equals configured full-raid Renown, never earned Renown or kill
  count. Do not introduce a separately maintained weight catalog.
- The career-only allowed pool must exclude Vanilla on Wrath, including historical
  uploads. Do not remove Vanilla globally from shared flavor composition.
- Each exact difficulty/max_players tuple is independent. Activation is tenant-wide
  existence of a currently eligible canonical boss kill. It is retractable, not
  a permanent unlocked flag, and cannot depend on subject search/realm filters.
- Active variants missing for a subject contribute zero while retaining their
  weight in the denominator. Award zero does not erase eligible kill evidence.
- Retain both metric raid inputs, choose by career Mastery then unweighted eligible
  metric kill count then DPS, and persist the choice eventually. Peak follows
  that choice. Do not reinterpret the existing per-kill DPS/HPS classification.
- Preserve exact player class/spec/subspec plus realm identity. Renown sums
  metric-independent eligible kills in that identity. Guild score inputs are
  boss-based kill-time raid values, not clear times.

## Remaining implementation sequence

1. Resolve the full-raid decisions above before implementing a pool or weights.
   Specify the career allowed variant mapping separately from ordinary board
   configuration. Keep existing structures rather than extracting a new service.
2. Add configuration-derived full-raid totals and exact-variant allowed-pool
   resolution with tests for mixed flavors, Wrath historical Vanilla uploads,
   independent 10/25 variants, optional bosses, explicit zero awards, and the
   approved mutually exclusive alternative rule.
3. Add tenant-wide activation from eligible kill evidence or maintained summaries.
   Cover first kill, duplicate uploads, disabled bosses, source retraction, last
   kill removal, guildless kills, and reactivation. Do not scan live data during
   this investigation or ship a startup historical backfill.
4. Preserve exact-cohort metric-free player kill attribution for career Renown,
   while retaining existing character-wide Renown behavior. Design any required
   new migration before changing projection/storage. No deployed migration edits.
5. Retain DPS/HPS raid inputs and implement career reduction with read-time
   weights, full denominator zero fill, and persisted eventual metric choice.
   Test metric tie breakers, same-metric Peak, identity isolation, benchmark and
   award edits, deletion, and guild kill-time-only aggregation.
6. Integrate bounded queries, workers, and API only after those foundations pass.
   UI remains a later assignment. Configuration changes must update current
   weights without recounting otherwise unchanged eligible kills.

## Validation boundary

This investigation uses repository sources only. No live DB access, migration,
backfill, production configuration edit, or behavioral code change was needed.
Documentation validation checks source award arithmetic, internal consistency,
and whitespace. A PDF build requires a TeX toolchain, not present in this checkout
session.
