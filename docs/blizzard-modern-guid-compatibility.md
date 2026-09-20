# Blizzard modern GUID compatibility mapping

Chronicle's Blizzard parser accepts modern string GUIDs from Blizzard combat logs, including `COMBAT_LOG_VERSION,22` logs, but much of Chronicle still consumes the legacy 64-bit `guid.GUID` type. The compatibility mapping is implemented by `guidNormalizer.normalize` in `combatlog/parser/blizzard/v9/guid.go` and is applied by `transformReader` in `combatlog/parser/blizzard/v9/transform.go`.

The modern raw GUID is the canonical identity. The generated 64-bit value is a compatibility representation for existing parser and analysis code. In particular, a mapped world GUID must not be treated as a canonical cross-log identity.

## Accepted input forms

`guidNormalizer.normalize` trims surrounding whitespace and handles these forms:

- `Player-<server>-<characterID>`, where `server` is decimal and fits 16 bits, and `characterID` is hexadecimal and fits 32 bits.
- `Creature-...-<entry>-<spawn>`, `Pet-...-<entry>-<spawn>`, `Vehicle-...-<entry>-<spawn>`, `GameObject-...-<entry>-<spawn>`, and `Corpse-...-<entry>-<spawn>`. A world GUID must contain at least seven dash-separated parts. The penultimate part is a decimal 24-bit template entry. The final part is a hexadecimal spawn value of up to 40 bits.
- Existing strings beginning with `0x`, which pass through unchanged after whitespace trimming.
- Empty strings, `nil`, `0000000000000000`, and `0x0000000000000000`, which all normalize to `0x0000000000000000`.

The accepted modern prefixes are also listed by `isModernGUID` in `combatlog/parser/blizzard/v9/transform.go`. Unsupported prefixes and malformed numeric fields return errors.

## Legacy 64-bit layout

The compatibility type is `guid.GUID` in `combatlog/parser/guid/guid.go`. World entities use the layout described by `GUID.GetHigh` and `GUID.GetEntry`:

```text
 63                              48 47                    24 23                     0
+----------------------------------+------------------------+------------------------+
| legacy entity type, 16 bits      | template entry, 24 bits| per-log identity, 24 b |
+----------------------------------+------------------------+------------------------+
```

`combatlog/parser/blizzard/v9/guid.go` assigns these legacy high values:

| Modern prefix | Legacy high value |
| --- | --- |
| `Creature` | `0xF130` |
| `Pet` | `0xF140` |
| `Vehicle` | `0xF150` |
| `GameObject` | `0xF110` |
| `Corpse` | `0xF110` |

Corpses map as objects because a modern corpse GUID does not retain the player GUID and must not be classified as a player. The resulting values remain compatible with helpers such as `GUID.IsCreature`, `GUID.IsPet`, `GUID.IsVehicle`, `GUID.IsObject`, and `GUID.GetEntry`.

## Player mapping

Player GUIDs map as:

```text
value = server << 32 | characterID
```

This is lossless within the accepted 16-bit server and 32-bit character ID ranges. For example, the WoW Forever-style GUID `Player-6065-037BA400` becomes `0x000017B1037BA400`.

Although this numeric form preserves all accepted player fields, Chronicle should retain or adopt the raw modern GUID as the canonical identity in systems that can support it. The numeric value exists to serve legacy `guid.GUID` consumers.

## World mapping

Modern world GUIDs do not fit losslessly into the legacy 64-bit layout. `hash24` in `combatlog/parser/blizzard/v9/guid.go` computes FNV-1a over the complete trimmed raw GUID and keeps the low 24 bits. `guidNormalizer.normalize` uses that result as the initial identity:

```text
value = legacyHigh << 48 | entry << 24 | hash24(rawGUID)
```

The complete raw string participates in the hash, not only the final spawn field. This distinguishes GUIDs whose components differ outside the retained legacy fields.

Examples covered by `TestGUIDNormalizer` in `combatlog/parser/blizzard/v9/v9_test.go` include:

| Modern GUID | Compatibility GUID |
| --- | --- |
| `Creature-0-6263-564-439599-15479-00001E1033` | `0xF130003C77044A82` |
| `Pet-0-6263-564-439599-19189-0200CFB18D` | `0xF140004AF5FE7CBB` |

These outputs assume the initial hashed slot is free.

## Collisions and allocation scope

A 24-bit hash can collide. Each `guidNormalizer` stores both `rawToValue` and `valueToRaw` maps. If the initial candidate is occupied, `normalize` probes forward one identity at a time, wrapping within 24 bits, until it finds a free value. It returns an error only if all $$2^{24}$$ identities for that type and entry are exhausted. `TestGUIDNormalizerResolvesWorldGUIDCollision` verifies this behavior.

The normalizer belongs to one `transformReader`. `newTransformReaderWithOptions` creates it when a log transformation begins. Therefore:

- Repeated occurrences of the same raw world GUID within that transformation receive the same value.
- Different raw world GUIDs with the same type and entry receive distinct values within that transformation.
- An uncollided GUID starts from a deterministic hash of its complete raw form.
- A probed value can depend on which colliding GUID was encountered first. It is not guaranteed to be stable across logs, parser runs with different input order, or independently transformed log fragments.

Do not join world entities across logs by the compatibility GUID. Store and compare the raw modern GUID when cross-log or durable identity matters.

## Known limitations and future direction

- World mappings discard the original modern fields after transformation. The raw GUID cannot be reconstructed from the 64-bit surrogate.
- The 24-bit identity is a bounded per-type, per-entry namespace. Linear probing prevents probabilistic parse failure from ordinary hash collisions, but it does not make the assigned value canonical.
- Existing `0x` GUIDs pass through without this allocator, preserving compatibility with legacy input.
- `Corpse` and `GameObject` share the legacy object type. Their complete raw strings influence their identity, but the 64-bit value does not preserve the modern prefix as a separate type.

The long-term direction is to carry the raw Blizzard GUID as the canonical identity through storage and APIs, while treating the numeric `guid.GUID` value as a compatibility surrogate for code that still requires the legacy layout. Any migration should preserve the raw value before normalization and define explicit boundaries where legacy consumers receive the surrogate.
