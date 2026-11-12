# Encounter difficulty

## Data contract

Raid size (`max_players`) belongs to the instance. Changing player size starts a new instance. A mode change at the same size does not.

Every encounter stores its resolved difficulty as a string:

- `""`: Normal.
- `"heroic"`: Heroic.
- Other stable identifiers: reserved for encounter-specific variants, such as future hard modes.

Difficulty does not include the raid size or a translated display label. The API exposes difficulty even when it is the empty string. Consumers must distinguish an explicit Normal filter from an omitted filter.

## Parser lifecycle

Zone metadata establishes the initial mode for subsequent encounters. A fight snapshots this mode at its start; later zone updates do not mutate that snapshot. An optional encounter difficulty resolver may override the snapshot at finalization, including explicitly resolving back to Normal. No Ulduar hard-mode detector is included.

The ICC wire fixture under the parser tests contains synthetic companion zone transitions and scrubbed combat events derived from the supplied log. It does not claim those transitions occurred in the original raid. The original source file is not modified or required to run tests.

## Eligibility and scoring

The instance retains every observed encounter difficulty for analysis. Clear-time and speedrun eligibility use a separate rule: every boss attempt counts, including wipes, resets, and partial kills; trash does not count. More than one boss difficulty makes the run mixed. Normal trash therefore does not disqualify an otherwise Heroic boss clear.

Mixed runs retain raw timing/proof and encounter analysis, but cannot contribute a single ranked clear or speedrun. Homogeneous clears use the boss difficulty, not the final zone message.

Boss ranking and scoring identity includes instance, fixed player size, encounter name, and resolved difficulty, in addition to the applicable tenant, realm, player/class/spec, and metric dimensions. Ingestion uniqueness, best/latest selection, parse memberships, rating evidence, and guild progression must preserve that identity before aggregation.

## Historical records and rollout

Existing encounters are assumed to have their parent log's recorded difficulty: the recorded Heroic flag or Heroic label maps to `"heroic"`; recorded Normal maps to `""`. This cannot recover historical mid-run changes. Reparsing the original log applies encounter-level detection when the source contains the required metadata.

Legacy read fallback and bounded backfill use the same normalization. A valid empty encounter difficulty is confirmed Normal, not a request to fall back to a Heroic parent.

Do not run a global startup data update. Before production backfill or index preparation, collect table/index sizes through an approved read-only connection, estimate affected rows and disk/WAL requirements, and obtain operator approval. Production sizes were unavailable during implementation; no production writes were performed.

### Deployment checklist

Migration 370 also refuses populated draft-369 difficulty summaries rather than discarding their evidence. If the draft was deployed independently, stop and arrange an operator-reviewed conversion before upgrading.

1. Back up the small leaderboard configuration tables before migration 371. Locale aliases collapse many-to-one; its down migration deliberately refuses a lossy reconstruction.
2. Run `database/migrations/offline/000370_preview.sql` through an approved read-only production connection and review the returned sizes.
3. After approval, run `000370_prepare_variant_indexes.sql` outside a transaction. Concurrent builds still use IO, disk, and WAL. Check `pg_index.indisvalid` for all four indexes before deployment. Failed concurrent builds can leave INVALID indexes that need explicit operator cleanup before retrying.
4. Migration 370 refuses a populated installation without the prepared indexes. It only creates them automatically for empty tables. It then attaches the wider keys and adds the read adapters without rewriting history. Use a maintenance window if brief DDL lock acquisition cannot be tolerated.
5. Historical encounter values can remain on the read fallback until the bounded `PreviewEncounterDifficultyBackfillBatch` and `BackfillEncounterDifficultyBatch` queries are run by approved administrative tooling. Start after the zero UUID, pass at most 10,000 rows per batch, and advance using `last_inspected_id` even when `updated_count` is zero. Stop at `inspected_count = 0`.
6. Use the existing ranking repair/reprojection operation to refresh canonical runs and rating evidence into canonical difficulty keys. Existing materialized leaderboard cohorts require that refresh; read fallback alone does not rebuild materialized ratings. Refresh parse/time memberships before explicitly recomputing historical scores if revised population comparisons are desired. Do not silently replace immutable historical parse values merely to relabel them.

Local validation uses PostgreSQL 17. `CHRONICLE_TEST_POSTGRES_PORT` selects an isolated local test server without replacing a server another workspace owns on port 5432.
