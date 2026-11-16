# Parsernext experiment: retained design lessons

This experiment is **not a merge candidate**. These notes preserve useful ideas,
known limits, and source references, not approval to resume or deploy the stack.
The goal was to move expensive parsing onto available home hardware, then support
live logging and battlegrounds. Faster parsing was not the primary objective.

## Read this first

- [Detailed design notes](reference/design-notes.md) distinguish observed behavior
  from proposals and explain which boundaries are reusable independently.
- The committed source baseline is
  [`d4fc76ae63203152c5090c5f82b64a7334a4cb45`](https://github.com/Emyrk/chronicle/tree/d4fc76ae63203152c5090c5f82b64a7334a4cb45).
- Later working-tree experiments are preserved separately at
  [`f892a9b26cfd46b238fdaa419394cb3cd9afe423`](https://github.com/Emyrk/chronicle/tree/f892a9b26cfd46b238fdaa419394cb3cd9afe423).
- Historical migrations **388 and 389 are not deployment instructions**. Do not
  apply them or revive their schema merely because these notes reference them.

## Useful boundaries

1. Plain compute capabilities can be composed by ordinary and headless services.
   Do not start the full server just to get parser dependencies.
2. Compute and publication have different authority and failure boundaries.
   Immutable attempts, leases, and transaction fences are useful protocol ideas.
3. Restored owner references and runtime callback wiring are separate concerns.
   Explicit codecs preserve identity; runtime wiring supplies trusted behavior.
4. A per-log identity catalogue is independent of a global identity taxonomy.
   Diagnostic collection does not require solving every classification problem.
5. UI epochs prevent obsolete asynchronous work from publishing into new state.
   They are useful independently of the parser implementation.

## Constraints that must not be lost

In the archived production-facing parsernext route, full JSON checkpoint handoff
is mandatory, not merely an optional debugging feature. Logical-file EOF is not
Finalize. Successful snapshot capture is non-consuming and leaves the live
session usable; restoration takes future complete-file inputs only.
Arbitrary uploaded chunks are not complete logical files. The worker replays the
whole frozen logical prefix rather than providing live incremental continuation.

The latest retained-message fixes add SpellStart, Cast, LegacyCast, and AuraCast.
A bounded 184-site retention inventory still exposes arbitrary-message routes,
including an unsupported SpellFail trigger after delayed evade confirmation.
Neither passing fixtures nor this inventory establish universal snapshot safety.
Explicit retained-message DTOs also duplicate a message taxonomy and cost upkeep.

Output/event publication is not the same problem as continuation-state storage.
A future protobuf representation is a **deferred proposal**, not a validated
replacement for the JSON graph or proof that the taxonomy problem disappears.

Any future effort requires a new scoped decision, explicit acceptance criteria,
and a fresh compatibility/migration review. This document is not that decision.
