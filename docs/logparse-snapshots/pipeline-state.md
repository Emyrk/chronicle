# Vanilla message-source state composition

`combatlog/parser/vanilla/nextsource` now composes the existing owner-local codecs
into one typed graph and value-payload table. This is a **message-source snapshot**,
not a complete parse/session snapshot, production resume feature, or persisted
archive protocol. No caller in the production worker saves or restores it.

## One graph

The State header contains one version and one Compatibility identity. Semantic
payloads retain their individual type and version; Node.Metadata remains optional
non-semantic debug data. Canonical values include decoder, source diagnostics,
aura owner, Slain, absorption, Razuvious, and VanillaPlus. Damage and spells use
one shared graph: absorption adds spells to the same ID-based union as Damage.
No per-owner mini-archives, runtime arena, or new registry framework is involved.

`CaptureState(identity, pendingDamageOwners)` accepts external buffer-owned Damage
values in stable order. Slain references deduplicate against those exact objects.
Cache-only Damage receives fallback ownership. `RestoreState` returns both the
candidate pipeline and its canonical Damage table, so the caller can restore
pending builders and pointer-keyed ranking indexes without severing aliases.
The caller still needs to snapshot those external owners and their references.

VanillaPlus's live `&Unit.Guid` algorithm is unchanged. Its boundary codec copies
primary GUID values based on the audited absence of later production Unit.Guid
writes. Construction restores the fixed shadow mapping; the existing flavor gate
continues to determine whether the stage executes.

## Compatibility and runtime dependencies

The caller supplies immutable dataset **content** identity, format, canonical
flavor key, parser implementation version, HEADER display/build version, and
custom-spell/override implementation version. The display/build string is a
separate invariant from parser implementation identity and may be empty.
These strings are attestations, not checksums computed or verified by the codec.
A dataset UUID alone does not identify its changing contents. The caller must
include all effective input data/rules, including talent/gear content and resolver
source mode, in its compatibility identity. Never put connection strings, secrets,
or local resource paths in it.

The first successful capture binds that identity to the pipeline; subsequent
captures cannot change it. Restore checks exact equality before any derivation,
and verifies format/flavor against the newly supplied construction context.
Capture also matches the display/build string against the original constructor.
Restore rejects a source payload whose build string differs from the trusted
expected identity before any spell lookup, then injects that trusted string into
the new pipeline/decoder rather than accepting payload-controlled metadata.
The effective GameDB must already be dataset-scoped and flavor-overridden exactly
as at construction. The API cannot prove that an arbitrary injected implementation
honors the attested identity. Logger, gear resolver, and talent data are reinjected.
There is no new global service locator. Spells remain ID-only derived values;
not-found follows UnknownSpell, other failures reject the candidate.

Missed-spell diagnostic counts survive. Wall-clock timing accumulators restart;
they are not semantic state. There are no serialized runtime credentials.

## Boundary and failure behavior

Only initial state or successful full-file EOF permits capture. Returning the
last record is insufficient: the next Advance must observe EOF. Another OpenFile
is rejected until the prior source completes; stale sources cannot change a newer
file's boundary. Source/fatal decoding failures never mark successful EOF.

Decode rejects unknown envelope fields. Restore validates graph structure,
value/type/version associations, required owners, compatibility, and each owner
codec, then assembles all state privately. No live pipeline is partially mutated.
A failed candidate can be discarded and its input reparsed.

## Verification and remaining work

Tests cover every boundary in a representative record sequence, all owner value
codecs, compatibility/malformed input rejection, fresh dependency injection, and
external Damage aliases. The opt-in `TestPipelineStateCapybaraLocal` uses the real
local Capybara gzip log, local DBC spell fetcher with custom spells and flavor
overrides, and talent trees. Gear lookup is deliberately not injected in that
message-source-only test. Prefix state crosses JSON; suffix messages and final
owner graphs are compared against uninterrupted processing. It performs no DB
writes, finalization, publication, or full-corpus publication reruns.

Remaining session work includes consumer/instance state, complete ranking indexes
and totals, eager stream bytes, ordered immutable input manifests, terminal
finalization lifecycle, and publication fencing. Existing Slain bytes must not be
regenerated after Damage classification. This API claims none of those guarantees.
