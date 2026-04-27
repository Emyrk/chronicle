# Warmane WotLK Support Matrix

This file tracks the Warmane Wrath of the Lich King instance surface against the live AzerothCore server data and the current Chronicle static registry.

Source of truth:
- `instance_template` from the live AzerothCore WotLK server, queried via AzerothMCP.
- Warmane parser coverage in `combatlog/parser/wotlk/warmane/instances` and `combatlog/parser/vanilla/state/encounters/registry/warmane.go`.

Status meanings:
- `supported`: registered in the Warmane static registry with hostile coverage.
- `partial`: registered, but coverage is intentionally incomplete.
- `missing`: present on the live server, but not yet registered in the Warmane static registry.

| Map | Script | Instance | Status | Notes |
| --- | --- | --- | --- | --- |
| 574 | `instance_utgarde_keep` | Utgarde Keep | missing | Live server instance exists; no Warmane registry entry yet. |
| 575 | `instance_utgarde_pinnacle` | Utgarde Pinnacle | missing | Live server instance exists; no Warmane registry entry yet. |
| 576 | `instance_nexus` | The Nexus | supported | Registered with hostile coverage. |
| 578 | `instance_oculus` | The Oculus | supported | Registered from live map spawns. |
| 595 | `instance_culling_of_stratholme` | Culling of Stratholme | missing | Live server instance exists; no Warmane registry entry yet. |
| 599 | `instance_halls_of_stone` | Halls of Stone | missing | Live server instance exists; no Warmane registry entry yet. |
| 600 | `instance_drak_tharon_keep` | Drak'Tharon Keep | missing | Live server instance exists; no Warmane registry entry yet. |
| 601 | `instance_azjol_nerub` | Azjol-Nerub | missing | Live server instance exists; no Warmane registry entry yet. |
| 602 | `instance_halls_of_lightning` | Halls of Lightning | missing | Live server instance exists; no Warmane registry entry yet. |
| 603 | `instance_ulduar` | Ulduar | missing | High-value next raid-tier target. |
| 604 | `instance_gundrak` | Gundrak | missing | Live server instance exists; no Warmane registry entry yet. |
| 608 | `instance_violet_hold` | Violet Hold | missing | Live server instance exists; no Warmane registry entry yet. |
| 615 | `instance_obsidian_sanctum` | Obsidian Sanctum | supported | Registered with hostile coverage. |
| 616 | `instance_eye_of_eternity` | Eye of Eternity | supported | Registered from live map spawns. |
| 619 | `instance_ahnkahet` | Ahn'kahet: The Old Kingdom | missing | Live server instance exists; no Warmane registry entry yet. |
| 624 | `instance_vault_of_archavon` | Vault of Archavon | supported | Registered with hostile coverage. |
| 631 | `instance_icecrown_citadel` | Icecrown Citadel | missing | Large raid slice; likely needs staged support. |
| 632 | `instance_forge_of_souls` | Forge of Souls | supported | Registered from live map spawns. |
| 649 | `instance_trial_of_the_crusader` | Trial of the Crusader | partial | Bosses and major adds registered; faction champions are not exhaustive. |
| 650 | `instance_trial_of_the_champion` | Trial of the Champion | missing | Live server instance exists; no Warmane registry entry yet. |
| 658 | `instance_pit_of_saron` | Pit of Saron | missing | Live server instance exists; no Warmane registry entry yet. |
| 668 | `instance_halls_of_reflection` | Halls of Reflection | supported | Registered from live map spawns. |
| 724 | `instance_ruby_sanctum` | Ruby Sanctum | supported | Registered from live map spawns. |

Additional Warmane WotLK coverage already in the registry:
- `Naxxramas`: supported.

Recommended next additions:
1. `Ulduar` for raid-tier coverage.
2. `Trial of the Champion` as another contained Coliseum slice.
3. `Pit of Saron` to complete the Icecrown 5-man chain.