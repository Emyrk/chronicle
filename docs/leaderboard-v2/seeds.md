# Initial configuration seed review

This document records migration `000342`. The later normal Wrath award seed and
its expanded supported tuples are documented in [wrath-renown.md](wrath-renown.md).

Migration `000342` contains literal values only. It never reads retired tables or
old migration files during deployment. It does not scan historical log data.

## Sources

- `combatlog/parser/common/registry/instances.go` and
  `combatlog/parser/common/instances/instances.go`: registered Vanilla, Ursol,
  and VanillaPlus raid factories.
- `combatlog/parser/common/registry/registry.go`: canonical progression encounter
  names, ordered ranking sets, and derived-instance speedrun rules.
- `combatlog/parser/wotlk/instances/raids.go`: Ulduar and exact Sartharion sets.
- `combatlog/parser/wotlk/instances/tbc.go`: verified Gruul's Lair,
  Serpentshrine Cavern, and Tempest Keep ordered groups.
- Migration `000313`, VALUES authoring reference only: all 104 explicit Renown
  calibrations. The committed JSON parity fixture preserves these values, plus the
reviewed VanillaPlus additions below.

Instances and bosses appearing in approved awards are explicitly enabled even
when absent from the default encounter set. Thus optional Zul'Gurub bosses and
VanillaPlus Blackwing Lair additions can award Renown independently of membership.
Custom layers contain only changes from Vanilla, not copied defaults. Removed
VanillaPlus Blackwing Lair set members are explicitly excluded; their independent
award configuration is not silently rewritten.

Reviewed VanillaPlus additions beyond the 104 legacy calibrations: Blackwing
Lair `Flamegor & Ebonroc` awards 4, and Zul'Gurub `Azus the Bloodseeker` and
`The Nameless Hermit` award 1 each.
Gehennas is explicitly disabled in the `{vanilla, nightmare-of-ursol}` layer.
Vanilla awards are not automatically suppressed by Wrath or TBC.

Ursol and VanillaPlus layers require their custom tag **and** `vanilla`, making
shared-property overrides strict supersets rather than incomparable singleton
assignments. Server identity tags never select these layers.

The default Obsidian Sanctum set selects only `Sartharion` (0D). The `1d`, `2d`,
and `3d` sets select separate exact bosses. The default Ulduar set excludes Flame
Leviathan; the boss itself remains enabled. Emerald Sanctum's `hard` set selects
`Solnius (Hard Mode)` without alternative-selection semantics.

## Deliberate omissions

- No speculative TBC or Wrath Renown awards or variant-specific awards.
- Only four exact difficulty/size tuples are seeded: `10 Player`/10 and
  `25 Player`/25 for Naxxramas and Onyxia's Lair, enabled by `wrath`.
  Evidence: `combatlog/parser/common/encounters/consumer_test.go` and
  `combatlog/parser/wotlk/instances/raids_test.go`. These parser fixtures preserve
  exact strings; they are not generalized to other raids.
- Vanilla, Ursol, VanillaPlus, TBC, Ulduar, and Obsidian Sanctum difficulty/size
  tuples remain unconfigured. Registry factories do not provide authoritative
  tuples. Do not invent `Normal`/40 or infer supported difficulties from raid
  names. Their boss defaults and encounter sets remain configured independently.
- TBC raids without verified ordered progression sets are not seeded: Black
  Temple, Hyjal Summit, Karazhan, Magtheridon's Lair, Sunwell Plateau, Zul'Aman.
- Wrath raids without verified ordered progression sets are not seeded: Eye of
  Eternity, Icecrown Citadel, Ruby Sanctum, Trial of the Crusader, Vault of Archavon.
  Their factories register hostiles, but that alone does not establish the
  reviewed ordered selection. Dungeons are not part of this initial calibration.
- No portfolios, seasons, observations, parser changes, or UI read cutover.

The down migration deletes exact seeded identities. Foreign keys intentionally
block rollback if a later configuration still references a seeded identity,
rather than cascading away separately authored configuration.
