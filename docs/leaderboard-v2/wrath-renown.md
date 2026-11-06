# Reviewed Wrath normal-raid Renown

Migration `000343` adds the second configuration seed. Migrations `000341` and
`000342` remain unchanged. This migration inserts small shared configuration
records only, with no historical log scans, data rewrites, or tenant evidence.

## Supported tuples and evidence

The configured tuples are exactly `10 Player`/10 and `25 Player`/25. These are
supported English client-provided labels, not a promise to recognize every
client, localization, or alternate spelling. No heroic or hard-mode tuples are
inferred; their calibration remains deferred.

The shared transport contract is verified in
[ChronicleCompanionWoTLK ZoneProvider.lua, immutable revision
2332b7f09fc8ec8fd85c60033e1ff9ba3e6ccc7a](https://github.com/Emyrk/ChronicleCompanionWoTLK/blob/2332b7f09fc8ec8fd85c60033e1ff9ba3e6ccc7a/Providers/ZoneProvider.lua#L42-L68).
The addon calls `GetInstanceInfo()` and emits sanitized `difficultyName` and
`maxPlayers` without an instance-specific mapping. Chronicle's
`combatlog/parser/wotlk/companion/messages.go` preserves those fields verbatim.

Consistent cross-raid evidence for the literals exists in:

- `combatlog/parser/common/encounters/consumer_test.go`: Naxxramas 10/25.
- `combatlog/parser/wotlk/instances/raids_test.go`: Onyxia 10/25.
- `combatlog/parser/common/zoner/zoner_test.go`: Icecrown 10/25.
- `combatlog/parser/wotlk/companion/companion_test.go`: Vault 25 and Icecrown 25.
- `database/instanceslug_test.go`: Ulduar 10/25.

Not every seeded raid has its own parser fixture. The reviewed configuration
uses the shared transport and cross-raid literals with the explicitly approved
10/25 sizes, rather than inventing a per-raid difficulty string.

Canonical identities come from `combatlog/parser/wotlk/instances/raids.go`:
`Eye of Eternity` / `Malygos`, `Vault of Archavon` and its four exact Watcher
encounters, Ulduar's ordered progression bosses, and the four separate
Sartharion encounters. Existing Naxxramas and Onyxia identities are reused.

## Awards

| Instance / bosses | 10 Player | 25 Player |
|---|---:|---:|
| Naxxramas, 13 ordinary bosses, each | 1 | 1.5 |
| Sapphiron | 2 | 3 |
| Kel'Thuzad | 5 | 7.5 |
| **Naxxramas default total** | **20** | **30** |
| Onyxia | 3 | 4.5 |
| Ulduar default, 11 ordinary bosses, each | 2 | 3 |
| Yogg-Saron | 6 | 9 |
| Algalon the Observer | 8 | 12 |
| **Ulduar default total** | **36** | **54** |
| Flame Leviathan, independent of default set | 2 | 3 |
| Sartharion, 0D | 1 | 2 |
| Sartharion (1 Drake) | 1 | 2 |
| Sartharion (2 Drakes) | 2 | 3 |
| Sartharion (3 Drakes) | 3 | 4 |
| Malygos | 2 | 4 |
| Each Vault Watcher | 1 | 2 |
| **Vault default total / all bosses total** | **0 / 4** | **0 / 8** |

All 78 awards are explicit instance-variant records under the existing `wrath`
layer. No multiplier is applied, particularly to Sartharion. No generic boss
Renown defaults are inserted or rewritten. Existing Vanilla Naxxramas/Onyxia
boss defaults therefore cannot conflict with these variant properties, and
flavors without `wrath`, including Turtle, remain unchanged.

Eye of Eternity has an enabled default singleton containing Malygos. Vault has
an **enabled empty default set**, with all four bosses independently enabled
and awarded. It does not require any boss for the default selection. Flame
Leviathan likewise remains enabled and awarded outside Ulduar's default set.

## Validation and rollback contract

Integration tests check every exact tuple/award and fraction, default totals,
optional bosses, mixed flavors, and unchanged Vanilla/Turtle/VanillaPlus
configurations. Applying up/down/up restores the same effective configuration.

Rollback deletes only the exact configuration values inserted here, in reverse
foreign-key order. Existing Naxxramas/Onyxia identities and Vanilla defaults are
not deleted. Later foreign-key references block rollback atomically rather than
being cascaded away. Edited values no longer matching the seed are not deleted.
No runtime configuration reader or frontend styling changes are included.
