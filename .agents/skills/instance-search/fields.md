<!-- Generated from internal/instancesearch/fields.go by TestFieldReference. Do not edit. -->
# Instance search fields

## Instance fields

Use at the top level (outside any quantifier).

| Field | Type | Ops | Options | Description |
|---|---|---|---|---|
| `instance.name` | string | =, !=, in, not_in, contains, starts_with |  | Zone name, e.g. "Molten Core". |
| `instance.realm` | string | =, !=, in, not_in, contains, starts_with |  | Realm name. |
| `instance.realm_id` | uuid | =, !=, in, not_in |  | Realm ID. |
| `instance.guild` | string | =, !=, in, not_in, contains, starts_with |  | Name of the guild the run is attributed to. Runs without a guild never match. |
| `instance.guild_id` | uuid | =, !=, in, not_in |  | ID of the guild the run is attributed to. |
| `instance.started_at` | time | =, !=, <, <=, >, >=, between |  | When the run started (upload time if unknown). RFC 3339. |
| `instance.difficulty` | string | =, !=, in, not_in, contains, starts_with |  | Difficulty name, e.g. "10 Player". Empty on servers without difficulties. |
| `instance.max_players` | int | =, !=, <, <=, >, >=, between |  | Declared raid size (0 when unknown). |
| `instance.category` | enum: raid, dungeon | =, !=, in, not_in |  | raid or dungeon. |
| `instance.recorder` | string | =, !=, in, not_in, contains, starts_with |  | Name of the character that recorded the log. |
| `instance.has_video` | bool | =, != |  | A YouTube video is linked to the run. |
| `instance.capability` | enum: overheal, absorb, unit-resources, unit-position, raidgroup, interrupt, server-side | =, !=, in, not_in |  | What the log recorded. `=` has it, `!=` lacks it, `in` has any of them, `not_in` has none of them. AND several `=` to require all. |
| `instance.player_count` | int | =, !=, <, <=, >, >=, between |  | Number of distinct players in the run. |
| `instance.bosses_killed` | int | =, !=, <, <=, >, >=, between |  | Number of distinct bosses killed (clean or partial). |
| `instance.wipes` | int | =, !=, <, <=, >, >=, between |  | Total wipes in the run (overview metrics). |
| `instance.deaths` | int | =, !=, <, <=, >, >=, between |  | Total player deaths in the run (overview metrics). |
| `instance.clear_time_ms` | int (ms) | =, !=, <, <=, >, >=, between |  | Ranked full-clear time. Only full clears have one. |
| `instance.clear_qualified` | bool | =, != |  | The clear qualifies for speedrun leaderboards. |
| `instance.boss_time_ms` | int (ms) | =, !=, <, <=, >, >=, between |  | Time inside the clear spent fighting bosses. Full clears only. |
| `instance.trash_time_ms` | int (ms) | =, !=, <, <=, >, >=, between |  | Time inside the clear spent fighting trash (non-boss fights). Full clears only. |
| `instance.idle_time_ms` | int (ms) | =, !=, <, <=, >, >=, between |  | Time inside the clear spent out of combat. Full clears only. |
| `instance.clear_parse` | int (0-100) | =, !=, <, <=, >, >=, between | parse_scope | Clear-time parse (higher is faster). |
| `instance.kill_time_parse` | int (0-100) | =, !=, <, <=, >, >=, between | bosses, match, parse_scope | Boss kill-time parse (higher is faster) on any / each of the bosses. |
| `instance.kill_time_ms` | int (ms) | =, !=, <, <=, >, >=, between | bosses, match | Boss kill duration (clean or partial kills) on any / each of the bosses. |

## Encounter fields

Use inside `any_encounter` / `count_encounters`. One encounter is one pull.

| Field | Type | Ops | Options | Description |
|---|---|---|---|---|
| `encounter.name` | string | =, !=, in, not_in, contains, starts_with |  | Encounter name (boss name for boss fights). |
| `encounter.boss` | bool | =, != |  | The encounter is a boss fight. |
| `encounter.outcome` | enum: clean, partial, wipe, reset | =, !=, in, not_in |  | clean (kill), partial (kill with gaps), wipe or reset. |
| `encounter.killed` | bool | =, != |  | The encounter ended in a kill (clean or partial). |
| `encounter.duration_ms` | int (ms) | =, !=, <, <=, >, >=, between |  | Pull duration. |
| `encounter.kill_time_parse` | int (0-100) | =, !=, <, <=, >, >=, between | parse_scope | Kill-time parse for this kill. |

## Player fields

Use inside `any_player` / `count_players`. All fields in one quantifier refer to the same player.

| Field | Type | Ops | Options | Description |
|---|---|---|---|---|
| `player.name` | string | =, !=, in, not_in, contains, starts_with |  | Character name. |
| `player.guid` | string | =, !=, in, not_in, contains, starts_with |  | Character GUID, e.g. "0x0000000000012345". |
| `player.class` | enum: WARRIOR, PALADIN, HUNTER, ROGUE, PRIEST, SHAMAN, MAGE, WARLOCK, DRUID, DEATH_KNIGHT, MONK, DEMON_HUNTER | =, !=, in, not_in |  | Class. |
| `player.race` | enum: Human, Dwarf, NightElf, Gnome, Draenei, Orc, Scourge, Tauren, Troll, Goblin, BloodElf | =, !=, in, not_in |  | Race. |
| `player.level` | int | =, !=, <, <=, >, >=, between |  | Level. |
| `player.guild` | string | =, !=, in, not_in, contains, starts_with |  | Guild name at the time of the run. |
| `player.guild_id` | uuid | =, !=, in, not_in |  | Guild ID at the time of the run. |
| `player.spec` | string | =, !=, in, not_in, contains, starts_with | bosses, match, on | Spec in a fight, e.g. "Feral". Read from boss kills by default; see on. |
| `player.sub_spec` | string | =, !=, in, not_in, contains, starts_with | bosses, match, on | Sub-spec in a fight: Bear / Cat (Feral druid), Tank / DPS (Enhancement shaman), Fury Prot. Empty for other specs and servers. |
| `player.role` | enum: dps, heal, tank | =, !=, in, not_in | bosses, match, on | Role in a fight. |
| `player.dps` | float | =, !=, <, <=, >, >=, between | bosses, match, on | DPS in a fight. |
| `player.hps` | float | =, !=, <, <=, >, >=, between | bosses, match, on | HPS in a fight. |
| `player.deaths` | int | =, !=, <, <=, >, >=, between | bosses, match, on | Deaths in a fight. Wipes are not counted. |
| `player.avg_ilvl` | int | =, !=, <, <=, >, >=, between | bosses, match, on | Average item level in a fight. |
| `player.parse` | int (0-100) | =, !=, <, <=, >, >=, between | bosses, match, metric | Player parse on a boss kill (latest stored score per boss). |
