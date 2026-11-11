# Bounded shared Damage codec

This slice is **not** a complete session snapshot. It implements concrete shared
Damage values and narrow adapters needed to prove resumed pointer identity.

## Canonical objects and keys

`vanilla.CaptureDamageGraph` accepts pending-buffer owners in stable owner/event
order, then visits reference paths in sorted order. A capture-local
`map[*messages.Damage]Path` chooses one canonical Value per object. Pointer values
are never persisted. Equal-valued distinct Damage objects stay distinct; a second
owner of the same object becomes a direct Reference. Cache-only objects receive
`/root/retained-damage/<ordinal>` values. Equivalent captures are deterministic.

Spells use the approved immutable same-ID contract: `/root/spells/<signed-id>`
Values contain only the versioned SpellReference key. Damage's `/spell` child is
a direct typed reference to that Value. The damage payload names the same target;
restore validates both agree. The enclosing caller checks resolver compatibility
once and supplies the same configured non-counting effective fetcher.

`DamageState` preserves every Damage field, including raw SpellID independently
of SpellData.ID, ranking Unranked, optional values, and trailer entries. Its
MessageBase state captures timestamp, synthetic flag, private activity, and marks
with deep-copied target maps. `marks_present` distinguishes absent marks pointers
from allocated pointers to nil maps. Nil and empty slices/maps remain distinct.
No spell data or runtime credentials are serialized.

## Restore and real-owner adapters

Restore validates the structural graph, type/version payload associations, and
message payloads before resolving. It allocates one isolated Damage per canonical
Value, derives each spell once, decodes owned state into the candidates, and
resolves direct aliases. Failure returns no candidate map and never changes a
live parser. Resolver reads may have occurred before a subsequent error.

`encounterevents.CapturePendingDamage` visits the **actual** pending buffer in
order and retains First, Count, message references, and original event indexes.
Its restore constructs a fresh active buffered builder using `types2proto.Damage`.
This adapter is specifically for the production Damage converter, not arbitrary
custom converters. Done/serialized/partially encoded buffers are rejected.

`SlainDetective.CaptureLastDamageReferences` captures only its target-keyed Damage
cache. `NewSlainDetectiveFromReferences` constructs a new owner and requires a
fresh caller-supplied zone Location; zone snapshotting is deliberately not
implemented here. The algorithm itself remains unchanged in its existing package.

The integration test reconstructs the real `DPSTracker.damageCredits` pointer-keyed
map from canonical references and calls `ClassifyDamage`. Full ranking state,
results, assembly indexes, zone state, and other owners do not yet have codecs.
Their future codecs must use these same Damage references, not copy messages.

## Already-written Slain events

Slain uses an eager builder. Existing Slain bytes must remain unchanged even when
later classification changes their attributed Damage object's Unranked amount.
The pending-Damage adapter neither captures nor regenerates that stream. Tests
retain those existing bytes while comparing continuous/resumed finalized Damage
bytes and alias-visible classification results. A full event-owner codec must
preserve the eager builders' accumulated bytes separately.
