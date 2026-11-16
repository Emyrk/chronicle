# Salvage from the abandoned parsernext experiment

This is a bounded extraction index, not a recommendation to merge the stack.
The goal was lower hosting cost using home hardware, live progress, and eventual
battleground support, not raw speed alone. Retained-type gaps and expanding scope
made the complete experiment unsuitable to carry forward as one change.

See the [detailed salvage map](reference/salvage-map.md) for pinned source links,
prerequisites, tests, mainline status, and cherry-pick versus reimplementation risks.

## Potentially independent fixes

- **Stale frontend streams:** epoch/request identity guards prevent old fetches
  from overwriting replacement caches or clearing a replacement request.
- **Instance replacement boundaries:** key state by resolved instance ID, not the
  stable route slug; reject stale worker replies. Polling is a separate decision.
- **Nil/empty finalization errors:** report an error before skipping an empty result.
  This is an archived dirty follow-up, not part of the committed experiment tip.
- **Zero-GUID participants:** exclude the absent actor from active membership,
  while preserving environmental damage attribution and diagnostic evidence.
- **Shared connect-only pgxpool mode:** potentially useful to a real provisioned-DB
  caller; preserve existing configuration, diagnostics, role setup, and lifecycle.

- **Deterministic validation exports:** evaluate an export-only extraction of
  `scripts/parser-baseline`, adapting main's contracts and retaining local-only
  safeguards/provenance. Parsernext execution and snapshot tests stay archived.

## Distinguish initial uploads from reparses

Root **reparse** context recovery is already fixed by #2033 at pinned main
`c3aa9e294cb7ddfdd06cda94a21f9cd5677dc903`. Do not duplicate that fix.
Initial root-upload publication before source rows exist is a separate candidate
from `e67fb6da1`. Evaluate realm-to-tenant binding against main's `db.InTx` path;
no handoff transaction helper is required. A current production failure has not
been established here; first add a main-compatible initial-upload regression.

## Concepts only

The identity catalogue's kind/category/affiliation/recognition taxonomy may inform
a smaller diagnostic tool. It does not justify importing its schema and lifecycle.
Owner-local codec methods may improve reviewability, but depend on the abandoned
snapshot infrastructure and do not prove complete retained-type coverage.

## Source and safety boundaries

Committed source is pinned to `d4fc76ae63203152c5090c5f82b64a7334a4cb45`.
Later local fixes are preserved in archive `f892a9b26cfd46b238fdaa419394cb3cd9afe423`.
“Missing on main” refers only to the pinned comparison, not future mainline changes.

Migrations 388 and 389 are historical experiment artifacts. Do not apply them.
Do not cherry-pick the full parser/handoff feature to obtain a small fix.
For any extraction, re-check current main, minimize dependencies, and run its
focused tests and normal validation on the new implementation.
