# Career foundation investigation

Status: configuration and activation foundation implemented; numeric seed weights
remain outstanding. `spec.tex` is authoritative, followed by `behavior.md`.
Career scoring workers, serving API, and UI are not implemented by this foundation.

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

## Approved policy update

Explicit career weights supersede the earlier proposal to derive weights from
configured full-raid Renown totals. Each weight belongs to the exact
`(instance_name, difficulty_name, max_players)` tuple. Both 10/25 and Normal/Heroic
remain independent. No numeric weights have been approved or invented here.

Average eligibility and Renown eligibility must be distinct:

| Content | Career Mastery/Peak | Career Renown |
|---|---|---|
| Obsidian Sanctum | Excluded, no denominator weight | Explicitly included when flavor-allowed |
| Optional bosses | Excluded from raid-wide inputs | Included when otherwise eligible |
| Vanilla raids on Wrath | Excluded | Excluded, even when uploaded |

Sartharion completion groups and full-clear Renown totals are no longer blockers
for career weights. Existing exact boss awards apply to actual eligible kills;
do not substitute a group maximum or invent a synthetic clear award. Optional
boss awards likewise remain available for Renown independently of average inputs.

Remaining decisions:

1. Approve explicit numeric career weights for the supported exact variants.
2. Define API presentation for empty effective raid-wide boss selections and for
   careers with no active positive weight. Never divide by zero or invent fallback
   weights. Vault's enabled empty default set illustrates the existing empty-set
   read-contract question, not a reason to include optional bosses in averages.

## Approved foundation constraints

- Use an explicit career weight per exact variant, independent of configured or
  earned Renown and kill counts. Read current weights without recounting kills.
- The career-only allowed pool must exclude Vanilla on Wrath, including historical
  uploads, for all career totals including Renown. Do not remove Vanilla globally from shared flavor composition.
- Each exact difficulty/max_players tuple is independent. Activation is tenant-wide
  existence of a currently eligible canonical boss kill. It is retractable, not
  a permanent unlocked flag, and cannot depend on subject search/realm filters.
- Active average-eligible variants missing for a subject contribute zero while retaining their
  weight in the denominator. Award zero does not erase eligible kill evidence.
- Retain both metric raid inputs, choose by career Mastery then unweighted eligible
  metric kill count then DPS, and persist the choice eventually. Peak follows
  that choice. Do not reinterpret the existing per-kill DPS/HPS classification.
- Preserve exact player class/spec/subspec plus realm identity. Renown sums
  metric-independent eligible kills in that identity. Guild score inputs are
  boss-based kill-time raid values, not clear times.

## Remaining implementation sequence

1. Obtain approved numeric seed weights before seeding career weights.
   Specify the career allowed variant mapping separately from ordinary board
   configuration. Keep existing structures rather than extracting a new service.
2. Add explicit exact-variant career weights and allowed-pool resolution with
   separate average/Renown eligibility. Test mixed flavors, Wrath historical
   Vanilla uploads excluded from all career totals, independent 10/25 and
   Normal/Heroic variants, Obsidian excluded only from averages, optional bosses
   excluded only from average inputs, and explicit zero Renown awards.
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

The initial investigation used repository sources only. Foundation validation
uses isolated local test databases, never a live DB. Schema generation and Go
regression tests cover the additive migration, configuration constraints,
activation/retraction, membership and fingerprints. No startup backfill or
production configuration mutation is performed. A PDF build requires a TeX
toolchain, not present in this checkout session.

## Implemented foundation interface

Migration `000355` adds shared `leaderboard_career_variants` configuration, keyed
by exact instance/difficulty/max_players. Weights are NULL or strictly positive
finite values. NULL is unconfigured, not zero or an inferred weight. Initial
records retain NULL weights, with separate average and Renown flags. They cover
only existing reviewed Wrath tuples and the non-Wrath implicit empty-difficulty/0
identity used by current reads. No new Heroic tuples are inferred. Additional
variants need explicit career configuration and enabled shared configuration.
The migration touches small configuration only, never historical evidence.

`internal/leaderboardconfig.ResolveCareer` returns a deterministic `CareerPool`:

- `Variants` preserve exact keys, flags, nullable weight, current `Active`, sorted
  `AverageBosses`, and sorted `RenownBosses` with current awards/HasPoints.
- `Issues` identify active average variants with missing weights or empty default
  membership. Consumers must block the entire average, not omit those variants.
  Renown remains available. `AveragesReady()` means no configuration blockers;
  consumers must still handle an empty active denominator without division.
- `Fingerprint` covers tenant, membership, awards, weights, activation, and issues.
  Persist it alongside the eventual metric choice to detect policy changes. It
  does not cover score/benchmark or eligible count changes; those must also dirty
  or refresh the metric choice in the later projection implementation.

Only enabled default-set members supply average inputs. This narrowly reuses the
whole-raid default selection in `Hub/v2RatingAdapter.ts:58-62` and
`leaderboardread/selection.go`, without reinterpreting other named sets. All
otherwise enabled bosses can supply Renown and activation, including optional
and zero-award bosses. Obsidian Sanctum's initial flags allow Renown only. Vault's
empty default blocks active averages rather than silently shrinking the pool.

`LeaderboardCareerVariantActive` performs tenant/exact-variant/boss-filtered
EXISTS checks over player and guild Renown facts. Both fact tables already have
primary keys and scope indexes beginning with tenant, instance, difficulty,
max_players, encounter. The query does not scan source uploads or require guild
membership, a clear, or nonzero awards. D1 fact retraction deactivates the last
eligible kill; configuration exclusions are applied immediately in selection.

Resolve the pool once per tenant read or worker batch, not separately per subject
or card. It currently issues one bounded EXISTS query per configured variant.
Pass a transaction-bound store with repeatable-read isolation if a coherent
configuration/evidence snapshot is required. No process cache or invalidation
protocol was added. Weight/configuration writes use the generated
`UpsertLeaderboardCareerVariant`; later consumers must refresh choice state when
the fingerprint changes. Existing shared flavor resolution remains unchanged;
the career-only flavor projection permits only Wrath tags when Wrath is present,
so uploaded Vanilla content cannot enter either career score or Renown.
