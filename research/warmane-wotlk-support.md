# Warmane Classic/TBC/WotLK Instance Support Matrix

This file tracks the full Warmane dungeon and raid surface exposed by the live AzerothCore `instance_template` table against the current Chronicle Warmane registry.

Investigation summary:
- Warmane logs do not go through a Blackwing Lair-specific parser path. They use the shared WotLK parser in `chronicle/logparse.go`, which infers zones from the Warmane encounter registry.
- The current blocker is registry coverage, not log-format parsing. Supported WotLK logs are recognized by the zone detector tests; unsupported maps never get synthetic zone attribution because their creature entries are absent from the registry.
- The runtime still uses the static registry only. A DB-backed registry exists, but `chronicle.New` currently bypasses it and always returns `registry.DefaultRegistry(logger)`, so any `world_instance_template` data is not used during parsing.
- Even if the DB-backed registry were re-enabled, the `world_instance_template` SQL is still stale relative to the `world_id` migration, so that path needs repair before it is safe to rely on.
- Blackwing Lair appearing in Warmane parses comes from the classic fallback entry registered in `combatlog/parser/vanilla/state/encounters/registry/warmane.go`; it is not evidence of broad WotLK coverage.

Non-dungeon/raid instance_template maps intentionally excluded from the coverage tables below:
- `30`, `44`, `169`, `489`, `529`, `559`, `562`, `566`, `572`, `607`, `628`.

Source of truth:
- `instance_template` from the live AzerothCore WotLK server, queried via AzerothMCP.
- Warmane parser coverage in `combatlog/parser/wotlk/warmane/instances` and `combatlog/parser/vanilla/state/encounters/registry/warmane.go`.

Status meanings:
- `supported`: registered in the Warmane static registry with hostile coverage.
- `partial`: registered, but coverage is intentionally incomplete.
- `missing`: present on the live server, but not yet registered in the Warmane static registry.

## Classic

| Map | Script | Instance | Status | Notes |
| --- | --- | --- | --- | --- |
| 33 | `instance_shadowfang_keep` | Shadowfang Keep | partial | Registered with boss-first hostile coverage sourced from world creature templates; trash is not yet exhaustive. |
| 34 | `instance_the_stockade` | The Stockade | supported | Covered by `StockadesFactory` with zone alias `the stockade`. |
| 36 | `instance_deadmines` | Deadmines | supported | Registered with hostile coverage. |
| 43 | `instance_wailing_caverns` | Wailing Caverns | supported | Registered with hostile coverage. |
| 47 | `instance_razorfen_kraul` | Razorfen Kraul | supported | Registered with hostile coverage. |
| 48 | `instance_blackfathom_deeps` | Blackfathom Deeps | missing | No Warmane registry entry. |
| 70 | `instance_uldaman` | Uldaman | missing | No Warmane registry entry. |
| 90 | `instance_gnomeregan` | Gnomeregan | missing | No Warmane registry entry. |
| 109 | `instance_sunken_temple` | Sunken Temple | partial | Registered, comment says `not yet complete`. |
| 129 | `instance_razorfen_downs` | Razorfen Downs | missing | No Warmane registry entry. |
| 189 | `instance_scarlet_monastery` | Scarlet Monastery | partial | Registry only includes Library and Cathedral slices. |
| 209 | `instance_zulfarrak` | Zul'Farrak | missing | No Warmane registry entry. |
| 229 | `instance_blackrock_spire` | Blackrock Spire | partial | Comment says only upper spire is supported. |
| 230 | `instance_blackrock_depths` | Blackrock Depths | partial | Registered, but comment says most bosses and mobs are not yet supported. |
| 249 | `instance_onyxias_lair` | Onyxia's Lair | supported | Registered with hostile coverage. |
| 289 | `instance_scholomance` | Scholomance | partial | Registered, comment says not fully implemented. |
| 309 | `instance_zulgurub` | Zul'Gurub | supported | Registered with hostile coverage. |
| 329 | `instance_stratholme` | Stratholme | partial | Comment says only undead side is supported. |
| 349 | `instance_maraudon` | Maraudon | missing | No Warmane registry entry. |
| 389 | `instance_ragefire_chasm` | Ragefire Chasm | supported | Registered with hostile coverage. |
| 409 | `instance_molten_core` | Molten Core | supported | Registered with hostile coverage. |
| 429 | `instance_dire_maul` | Dire Maul | supported | Registered with hostile coverage. |
| 469 | `instance_blackwing_lair` | Blackwing Lair | partial | Registered, comment says mobs are present but mechanics are not implemented. |
| 509 | `instance_ruins_of_ahnqiraj` | Ruins of Ahn'Qiraj | partial | Comment says mobs are registered but implementation is incomplete. |
| 531 | `instance_temple_of_ahnqiraj` | Temple of Ahn'Qiraj | partial | Comment says mobs are registered but implementation is incomplete. |

## TBC

| Map | Script | Instance | Status | Notes |
| --- | --- | --- | --- | --- |
| 269 | `instance_the_black_morass` | Black Morass | missing | Factory exists in classic instances package, but Warmane registry does not register it. |
| 532 | `instance_karazhan` | Karazhan | missing | No Warmane registry entry. |
| 534 | `instance_hyjal` | Hyjal Summit | missing | No Warmane registry entry. |
| 540 | `instance_shattered_halls` | The Shattered Halls | missing | No Warmane registry entry. |
| 542 | `instance_blood_furnace` | The Blood Furnace | missing | No Warmane registry entry. |
| 543 | `instance_hellfire_ramparts` | Hellfire Ramparts | missing | No Warmane registry entry. |
| 544 | `instance_magtheridons_lair` | Magtheridon's Lair | missing | No Warmane registry entry. |
| 545 | `instance_steam_vault` | The Steamvault | missing | No Warmane registry entry. |
| 546 | `instance_the_underbog` | The Underbog | missing | No Warmane registry entry. |
| 547 | `instance_the_slave_pens` | The Slave Pens | missing | No Warmane registry entry. |
| 548 | `instance_serpent_shrine` | Serpentshrine Cavern | missing | No Warmane registry entry. |
| 550 | `instance_the_eye` | The Eye | missing | No Warmane registry entry. |
| 552 | `instance_arcatraz` | The Arcatraz | missing | No Warmane registry entry. |
| 553 | `instance_the_botanica` | The Botanica | missing | No Warmane registry entry. |
| 554 | `instance_mechanar` | The Mechanar | missing | No Warmane registry entry. |
| 555 | `instance_shadow_labyrinth` | Shadow Labyrinth | missing | No Warmane registry entry. |
| 556 | `instance_sethekk_halls` | Sethekk Halls | missing | No Warmane registry entry. |
| 557 | `instance_mana_tombs` | Mana-Tombs | missing | No Warmane registry entry. |
| 558 | `instance_auchenai_crypts` | Auchenai Crypts | missing | No Warmane registry entry. |
| 560 | `instance_old_hillsbrad` | Old Hillsbrad Foothills | missing | No Warmane registry entry. |
| 564 | `instance_black_temple` | Black Temple | missing | No Warmane registry entry. |
| 565 | `instance_gruuls_lair` | Gruul's Lair | missing | No Warmane registry entry. |
| 568 | `instance_zulaman` | Zul'Aman | missing | No Warmane registry entry. |
| 580 | `instance_sunwell_plateau` | Sunwell Plateau | missing | No Warmane registry entry. |
| 585 | `instance_magisters_terrace` | Magisters' Terrace | missing | No Warmane registry entry. |

## WotLK

| Map | Script | Instance | Status | Notes |
| --- | --- | --- | --- | --- |
| 533 | `instance_naxxramas` | Naxxramas | supported | Registered with WotLK hostile coverage. |
| 574 | `instance_utgarde_keep` | Utgarde Keep | missing | No Warmane registry entry. |
| 575 | `instance_utgarde_pinnacle` | Utgarde Pinnacle | missing | No Warmane registry entry. |
| 576 | `instance_nexus` | The Nexus | supported | Registered with hostile coverage. |
| 578 | `instance_oculus` | The Oculus | supported | Registered from live map spawns. |
| 595 | `instance_culling_of_stratholme` | Culling of Stratholme | missing | No Warmane registry entry. |
| 599 | `instance_halls_of_stone` | Halls of Stone | missing | No Warmane registry entry. |
| 600 | `instance_drak_tharon_keep` | Drak'Tharon Keep | missing | No Warmane registry entry. |
| 601 | `instance_azjol_nerub` | Azjol-Nerub | missing | No Warmane registry entry. |
| 602 | `instance_halls_of_lightning` | Halls of Lightning | missing | No Warmane registry entry. |
| 603 | `instance_ulduar` | Ulduar | missing | High-value raid target with live boss metadata available from `instance_encounters`. |
| 604 | `instance_gundrak` | Gundrak | missing | No Warmane registry entry. |
| 608 | `instance_violet_hold` | Violet Hold | missing | No Warmane registry entry. |
| 615 | `instance_obsidian_sanctum` | Obsidian Sanctum | supported | Registered with hostile coverage. |
| 616 | `instance_eye_of_eternity` | Eye of Eternity | supported | Registered from live map spawns. |
| 619 | `instance_ahnkahet` | Ahn'kahet: The Old Kingdom | missing | No Warmane registry entry. |
| 624 | `instance_vault_of_archavon` | Vault of Archavon | supported | Registered with hostile coverage. |
| 631 | `instance_icecrown_citadel` | Icecrown Citadel | missing | Large raid slice; staged support likely needed. |
| 632 | `instance_forge_of_souls` | Forge of Souls | supported | Registered from live map spawns. |
| 649 | `instance_trial_of_the_crusader` | Trial of the Crusader | partial | Bosses and major adds registered; faction champions are not exhaustive. |
| 650 | `instance_trial_of_the_champion` | Trial of the Champion | missing | No Warmane registry entry. |
| 658 | `instance_pit_of_saron` | Pit of Saron | missing | No Warmane registry entry. |
| 668 | `instance_halls_of_reflection` | Halls of Reflection | supported | Registered from live map spawns. |
| 724 | `instance_ruby_sanctum` | Ruby Sanctum | supported | Registered from live map spawns. |

## Root Gaps

1. The Warmane static registry is missing most TBC maps, several Classic maps, and most WotLK 5-man/raid maps.
2. Warmane zone detection depends on hostile entry coverage, so unregistered maps do not merely lose polish; they fail basic instance attribution.
3. The scalable DB-backed registry path is currently disabled in `chronicle.New`.
4. The `world_instance_template` query layer is out of sync with the `world_id` schema migration, so the DB-backed path needs repair before activation.
5. Chronicle imports world creature spawns and creature templates, which is enough to derive broad hostile coverage by map, but there is not yet a committed pipeline that converts that data into parser registry entries.

## Recommended Sequence

1. Repair the `world_instance_template` SQL layer and re-enable the DB-backed registry behind the static fallback.
2. Add a committed import/sync path for instance metadata, including zone names and boss entries.
3. Use live `creature` plus `instance_encounters` data to populate missing Classic, TBC, and WotLK maps, instead of continuing to hand-maintain one-off Warmane files.
4. Stage content in this order: all TBC dungeons and raids, the missing WotLK 5-mans, then large raids like `Ulduar` and `Icecrown Citadel`.