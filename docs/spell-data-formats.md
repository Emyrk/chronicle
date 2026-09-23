# Spell data formats

Read this document before changing spell parsing, storage, conversion, or API behavior. Chronicle supports several spell-data shapes, but they are not interchangeable.

## Format matrix

| Source | Repository evidence | Shape | Chronicle handling |
| --- | --- | --- | --- |
| Vanilla and custom Vanilla 1.12.1 | The Kronos, OctoWoW, Turtle, and VanillaPlus `Spell.dbc` fixtures have 173 fields and 692-byte records. | One monolithic `Spell.dbc` row with three effect slots. | Parsed with the 1.12.1 layout. Conversion creates effects at indexes 0, 1, and 2, including empty slots. |
| TBC 2.4.3 | The checked-in TBC `Spell.dbc` fixture has 216 fields and 864-byte records. | One monolithic `Spell.dbc` row with three effect slots. | Parsed with the 2.4.3 build 8606 layout and covered by the legacy effect-parity test. |
| Stock WotLK 3.3.5a | The Epoch fixture has 234 fields and 936-byte records. | One monolithic `Spell.dbc` row with three effect slots. | Parsed with the stock 3.3.5a layout. |
| AzerothCore and Ascension | Both fixtures have 239 fields and 956-byte records. `spell_layout_extended.go` documents the extra effect dice columns and removed `Difficulty` column. | Chronicle's extended WotLK layout, not stock 3.3.5a. | Parsed with pseudo-build `12341` through `SpellBuildOverride`. |
| WoW Forever | The extractor and converter read split modern DB2 tables such as `Spell`, `SpellName`, `SpellMisc`, `SpellEffect`, and `SpellPower`. | Base spell data plus normalized effects, powers, and difficulty-aware component variants. | A legacy-compatible `dbc_spells` projection is stored alongside lossless normalized tables. |

The field counts above come from the checked-in DBC headers. The legacy effect-parity test covers Ascension, AzerothCore, Epoch, TBC 2.4.3, Kronos, OctoWoW, Turtle, and VanillaPlus.

## Effects and indexing

`chrondbc.Spell.Effects` is the canonical in-memory representation.

- `EffectIndex` is explicit. Consumers must not assume a slice position is the effect index.
- Legacy DBC conversion always creates exactly three entries with indexes 0, 1, and 2. Empty legacy slots remain present.
- Modern DB2 effects can be sparse and can use indexes greater than 2. Normalized storage preserves all such rows.
- The `dbc_spells` table and legacy JSON arrays expose only indexes 0 through 2. They are compatibility projections, not the canonical cardinality.
- Use `Spell.EffectByIndex` when selecting a particular effect.

JSON exposes `effects` as the canonical representation. For compatibility, `Spell.MarshalJSON` also emits the old three-element parallel arrays such as `effect`, `effect_base_points`, and `implicit_target_a`. Modern database-backed spells additionally expose the full rows as `modern_effects`.

## Base points

Legacy DBC and modern DB2 use different conventions:

- Legacy `EffectBasePoints` stores the effective value minus one. `SpellEffect.EffectiveBasePoints()` therefore returns `EffectBasePoints + 1` when no modern float is present.
- Modern `EffectBasePointsF` stores the exact float value. It takes precedence in `EffectiveBasePoints()`.
- The WoW Forever compatibility projection rounds the modern value and stores `round(value) - 1` in the legacy integer column, while preserving the exact float in normalized storage and `effect_base_points_f`.

Code that needs the actual value should call `EffectiveBasePoints()` instead of interpreting either backing field directly.

## Powers, variants, and component-only IDs

Modern spell data is relational rather than one row per spell:

- Every `SpellPower` row is preserved in `dbc_spell_powers`, ordered by `OrderIndex` and source ID. The legacy `dbc_spells` projection uses only the first ordered power.
- Difficulty-aware components are grouped by `(SpellID, DifficultyID)` in `dbc_spell_variants`. This includes misc data and attributes, aura options and restrictions, class options, interrupts, categories, cooldowns, levels, and target restrictions.
- Normalized effects retain both `DifficultyID` and `EffectIndex`.
- A component can reference a spell ID that has no row in the base `Spell` table. These component-only spell IDs remain in normalized storage even though no `dbc_spells` row can be projected for them.

The converter's `DroppedSpellEffects`, `DroppedSpellPowers`, `DroppedSpellAttributes`, and `DroppedOrphanSpellRows` counters describe data omitted from the legacy `dbc_spells` projection. They do not mean the corresponding normalized modern rows were discarded.

## Compatibility policy

Preserve modern source data losslessly in the normalized tables. Keep the three-slot SQL and legacy JSON forms only for existing consumers that still require them.

Do not reduce normalized data to fit the legacy model. Update consumers to use `Spell.Effects`, `ModernPowers`, and `ModernVariants` incrementally as concrete semantic gaps arise. A consumer fix should define its intended difficulty, power, and effect-index behavior rather than applying a repository-wide lossy rule.

## Relevant implementation files

- `database/gamedb/chrondbc/convert.go`
- `database/gamedb/chrondbc/spell.go`
- `database/gamedb/chrondbc/modern_spell.go`
- `database/gamedb/chrondbc/effects_parity_test.go`
- `database/gamedb/dbcdb/spell_layout_extended.go`
- `database/spelldb/spell_row.go`
- `internal/wowdata/convert.go`
- `internal/wowdata/convert_test.go`
- `database/migrations/000206_add_modern_spell_storage.up.sql`
