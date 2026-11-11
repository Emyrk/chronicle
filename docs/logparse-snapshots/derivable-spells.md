# Derivable Vanilla spell references

This bounded adapter captures spell references, not a parser session. It does not
snapshot Damage, Slain, absorption, event builders, or a complete object graph.

## Approved identity contract

Spell data is immutable. Within one compatible session context, equal SpellIDs
identify the same effective spell even when original pointers differ. The only
spell payload is `{"spell_id": <int32>}`. Nil spells have no reference. No spell
contents, provenance annotations, pointer tables, or credentials are serialized.

The caller must validate compatibility **once above this codec**, before restore:

- dataset content identity and source mode (database or explicit offline DBC);
- canonical flavor set;
- custom-spell definitions and override implementation;
- parser/resolver implementation compatibility.

The resolver must remain fixed for the restoration. Pass the same configured,
non-counting effective fetcher used by Vanilla: dataset scoping followed by the
single-ID `overrideGameDB.Spell` flavor wrapper. Do not use a bare database lookup,
`SpellsByName`/batch overrides, or the pipeline's missing-spell counting wrapper.
Current Vanilla does not select a difficulty-resolved spell view.

Restore calls that fetcher. A fetched custom synthetic spell wins normally.
`IsSpellNotFound` derives `UnknownSpell(id)`; other errors reject restoration.
A nil successful result or wrong-ID result also rejects it. No historical lookup
outcome is retained: under the approved identity contract, an earlier unknown
may become fetched if the supplied context no longer reproduces that outcome.
Prevent incompatible dataset/rule changes at the enclosing compatibility check.

## Graph integration

`stategraph.ValuePayload` keeps type, codec version, and semantic key bytes
separate from optional `Node.Metadata`. It is not a new archive envelope.
`DerivableType[T]` is a trusted local registration, annotated `Derivable: true`,
whose callback closes over one injected resolver. There is no global registry or
new node kind. The bounded restore validates structure/types/record associations,
derives canonical Values, then attaches direct references. Failure returns no
partially restored map. Callbacks may already have performed reads before a later
payload fails; no publication capability is present.

`CaptureSpellReferences` uses `/root/spells/<signed-id>` canonical Values and
`/root/references/<name>` aliases. IDs determine canonical paths, never addresses
or map iteration order. It is a small standalone adapter for exercising the real
key codec and shared references, not a path scheme imposed on the future complete
session archive. Each canonical node is derived once; its aliases share one
restored pointer. A nil input contributes neither a Value nor a reference.

## Next integration

Damage still requires a separate capture-local pointer-to-canonical-path table,
because its mutable identity is not the same as spell identity. Slain references,
buffered damage, and pointer-keyed ranking maps must resolve to those same Damage
objects. MessageBase private state also needs an owner-local codec. None of that
is implemented by this spell-only slice, and no live session capture is enabled.
