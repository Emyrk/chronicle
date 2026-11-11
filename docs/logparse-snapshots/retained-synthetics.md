# Retained Slain and absorption owner state

These codecs are independent owner-local pieces, not session snapshot wiring.
Both algorithms remain in their existing package unchanged; no parallel algorithm
or registry was introduced.

## Slain

`SlainDetective.CaptureState` combines complete `zoner.Location` state with the
existing target-to-canonical-Damage references. Location includes every Zone field
and the nullable synthetic-origin flag; its owner-local helper copies the flag
at capture/restore. This preserves suppression of synthetic updates to an already
authoritative zone, late difficulty adoption, and cache clearing on changes.

Capture callbacks register Slain aliases in the **same** graph as pending Damage
and ranking indexes. Restore obtains those exact Damage objects from that graph;
it does not build a private cache-only registry. The prior narrow reference-only
adapter remains available and is reused by the complete owner codec.

## Absorption

Capture records ordered target-local shield slices, spell name, applied/removed
timestamps, duration, caster, remaining capacity, school mask and exhaustion.
It does not expire shields, recompute capacity, resolve durations, or reapply
AuraCast events. Restore copies shield objects and slices into a fresh owner.

Non-nil spells are callbacks to canonical derivable Spell Values. Nil stays an
absent reference. Use the existing same-ID spell registration and the same fixed
compatible non-counting fetcher; unknown IDs follow its UnknownSpell fallback.
The owner codec neither serializes spell contents nor owns another registry.
Capture/restore callbacks must bind the same canonical spell table used by Damage.
Logger is injected at restore and never serialized.

Both decoders reject unknown versions/fields, missing required fields, malformed
timestamps, and invalid references during resolution. They do not invent range
restrictions on values the existing algorithms accept. Errors never mutate a live
owner; successful restores are detached candidates. The callback layer must
validate graph types/targets using the existing graph validation before resolving.

Split tests cover actual zone transitions, active shield ordering/capacity,
exhaustion, removal grace, expiry, nil spells, and unknown spell fallback. Full
pipeline composition, fingerprint enforcement, eager stream bytes, and complete
ranking/instance state still require their own integration.
