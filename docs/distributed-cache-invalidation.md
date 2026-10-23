# Distributed cache invalidation

Chronicle coordinates process-local cache eviction through durable PostgreSQL
cache generations. `NOTIFY` is only a low-latency hint; every process reads the
current generation from `cache_generations` and periodically reconciles all
rows.

## Deployment requirement

The first deployment of generation-backed invalidation is an expand/contract
rollout. Old binaries do not publish cache generations, so old and new mutation
writers must not overlap while cache correctness depends on this mechanism.

1. Apply the additive `cache_generations` migration.
2. Pause cache-relevant admin mutations and imports.
3. Drain or replace every old backend replica.
4. Confirm every active replica runs generation-publishing code.
5. Resume mutations and imports.

Normal later deployments are rolling-safe only when both versions publish the
same required cache generations. Any change that adds a new mutation path or
namespace must use the same drain-before-enable procedure unless the old
version already publishes a conservative invalidation for it.

## Dataset deletion

Dataset deletion publishes a global generation for every dataset-backed cache
namespace, then removes the deleted dataset's scoped generation rows in the
same transaction. The persistent global rows are bounded tombstones: a delayed
or reconnecting replica observes the newer global generation and purges that
entire namespace, so deleting scoped rows cannot hide the eviction signal.
Global purges are intentionally broader than ordinary dataset mutations because
dataset deletion is rare and correctness is more important than preserving
warm entries for other datasets.
