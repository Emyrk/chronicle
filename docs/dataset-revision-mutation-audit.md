# Dataset revision mutation audit

Dataset revisions fence parser inputs against concurrent publication. Every parsing-relevant dataset mutation must update the dataset and bump its revision in the same database transaction. Cache generation publication, when applicable, is part of that transaction as well.

This matrix records the write paths covered by migration `000372_add_dataset_revision`. It is an implementation audit, not a production rollout plan.

| Mutation path | Revision transaction |
| --- | --- |
| Spell imports and normalized spell components | `gamedataapi.Handler.mutateDataset` |
| Creature and item imports | `gamedataapi.Handler.mutateDataset` |
| WoW data snapshots and talents | `gamedataapi.Handler.mutateDataset` or `mutateDatasetAuthz` |
| Spell-derived metadata and aura-duration derivation | `gamedataapi.Handler.mutateDataset` |
| Class-buff derivation and consumable derivation | `gamedataapi.Handler.mutateDataset` or `mutateDatasetAuthz` |
| Item display information and derived world display information | `gamedataapi.Handler.mutateDataset` |
| Spell item enchantments | `gamedataapi.Handler.mutateDataset` |
| Item random properties | `gamedataapi.Handler.mutateDataset` |
| Item sets, set bonuses, and set membership | `gamedataapi.Handler.mutateDataset` |
| Spell description variables | `gamedataapi.Handler.mutateDataset` |
| Spell cast times, durations, ranges, icons, categories, radii, and focus objects | `gamedataapi.Handler.mutateDataset` |
| Consumable disambiguation set, ignore, and delete policies | `gamedataapi.Handler.mutateDataset` |
| Cooldown overrides and empty-override cleanup | `gamedataapi.Handler.mutateDataset` |
| Class-buff ignore policies | One `mutateDataset` transaction; every distinct selected dataset is bumped exactly once |
| Dataset metadata updates, including the default dataset's build/flavor metadata | `servicedataset` update transaction |
| CLI world JSON and DBC imports | One explicit transaction containing all writes and the target dataset bump |
| CLI global `--truncate` followed by import | One explicit transaction; every dataset is bumped because all dataset-scoped world/DBC tables are truncated |

Read-only and `mode=compare` operations do not bump revisions. Failed mutations roll back both data changes and revision bumps.

## Deliberate exclusion: dataset resolution

`world_server` assignments change which dataset a realm resolves to, but do not mutate the selected dataset's contents. They are intentionally not covered by the dataset content revision. Resumable parsing still needs a separate resolution fingerprint (or an explicit decision to include routing state in the compatibility identity) before a saved parser can safely resume across routing changes.

## Irreversible migration

Revision history is monotonic compatibility state. The down migration for `000372` intentionally fails instead of dropping the revision column or sequence. Resetting either could reuse an old compatibility identity and allow stale parser output to appear current.
