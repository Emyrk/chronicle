# AzerothCore Module Ingestion Specification

This document describes, in detail, what Chronicle ingests from an AzerothCore-based server, what the related AzerothCore module must send, what Chronicle does not ingest through the live upload path, and how to verify that an existing module is configured correctly.

The goal is practical: the module already exists, so this file focuses on making sure it is set up correctly and sends the exact information Chronicle expects.

## Summary

Chronicle has two separate ingestion paths for AzerothCore-derived environments:

1. Live combat log ingestion over HTTP.
2. Offline world and game-data ingestion through imports.

These are different contracts and should remain separate.

The AzerothCore module is responsible for the live combat log path.
It is not responsible for pushing full world tables through the upload endpoint.

For the live module path, Chronicle expects:

1. An authenticated HTTP upload to the AzerothCore upload endpoint.
2. A multipart form field named `combat_log`.
3. Three required instance identity headers.
4. Optional diagnostic metadata headers such as `X-Chronicle-Realm-Name`.
5. A combat log body written in WotLK combat-log format with unix-millisecond timestamps.
6. Additional `CHRONICLE_*` lines for metadata and server-specific context.
7. Segmented uploads for one logical run, as long as the instance token remains stable.

For the offline metadata path, Chronicle expects exported JSON arrays and optional SQL or DBC imports.

## Source Of Truth In Chronicle

The relevant Chronicle code paths are:

1. Upload route registration: [api/serviceazerothcore/handler.go](/root/chronicle/api/serviceazerothcore/handler.go#L25)
2. Upload handler and header contract: [api/serviceazerothcore/upload.go](/root/chronicle/api/serviceazerothcore/upload.go#L82)
3. Upload-key and realm management: [api/serviceazerothcore/servers.go](/root/chronicle/api/serviceazerothcore/servers.go#L1)
4. Log storage and append behavior: [chronicle/chronicle.go](/root/chronicle/chronicle/chronicle.go#L165)
5. Append behavior for repeated instance uploads: [chronicle/chronicle.go](/root/chronicle/chronicle/chronicle.go#L394)
6. AzerothCore parser wrapper and supported extension events: [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L34)
7. Parse-time realm fallback behavior: [chronicle/logparse.go](/root/chronicle/chronicle/logparse.go#L699)
8. Offline world import contract: [cmd/chronicle/cli/importworld.go](/root/chronicle/cmd/chronicle/cli/importworld.go#L130)
9. Known world-import table schemas: [cmd/chronicle/cli/importworld_turtle.go](/root/chronicle/cmd/chronicle/cli/importworld_turtle.go#L20)
10. AzerothCore-derived world instance source tables: [database/migrations/000098_world_instance_source_tables.up.sql](/root/chronicle/database/migrations/000098_world_instance_source_tables.up.sql#L1)

## Part 1: What Chronicle Actually Ingests From The Module

The live module upload path ingests four categories of information:

1. Authentication and realm ownership.
2. Instance identity.
3. Raw combat events.
4. Chronicle-specific metadata lines.

### 1. Authentication And Realm Ownership

The module must authenticate with a bearer token tied to a Chronicle realm upload key.

Chronicle validates the token in [api/serviceazerothcore/upload.go](/root/chronicle/api/serviceazerothcore/upload.go#L20) by hashing the raw token and looking it up in the upload-key table.

The upload key belongs to a Chronicle realm, not just a generic server.
That realm ownership is what Chronicle uses to associate uploaded logs with the correct realm.

Important implications:

1. The module does not choose realm ownership at upload time.
2. The upload key determines the realm.
3. If the wrong upload key is configured, logs will attach to the wrong realm even if the log body contains a correct realm name.

### 2. Instance Identity

Chronicle requires three headers on every upload:

1. `X-Chronicle-Instance-Id`
2. `X-Chronicle-Instance-Name`
3. `X-Chronicle-Instance-Token`

This is enforced in [api/serviceazerothcore/upload.go](/root/chronicle/api/serviceazerothcore/upload.go#L107).

All three are mandatory in the current implementation.

These fields serve different purposes:

1. `X-Chronicle-Instance-Id`
   This is the server-side instance identifier from AzerothCore.

2. `X-Chronicle-Instance-Name`
   This is the human-readable instance name used for log grouping and diagnostics.

3. `X-Chronicle-Instance-Token`
   This is the most important field for multi-part uploads.
   It must be unique for one logical instance run and stable for the full lifetime of that run.

Chronicle uses the instance token to detect that a new uploaded chunk belongs to an existing log group. Matching logic is in [database/queries/server_upload.sql](/root/chronicle/database/queries/server_upload.sql#L1).

If the token changes during the same dungeon or raid run, Chronicle will treat the upload as a new instance group.

### 3. Raw Combat Events

Chronicle expects ordinary WotLK combat log events in the uploaded file.

For AzerothCore logs, the WotLK parser is reused, but unix-millisecond timestamps are enabled in [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L59).

That means the uploaded combat log should look like this shape:

```text
1777340511000  SPELL_DAMAGE,0x0000000000000001,"Chronicle",0x400,0xF130001C68000001,"Boss Name",0x0,12345,"Some Spell",0x1,100,0,1,0,0,0,nil,nil,nil
```

The important format points are:

1. The timestamp is unix time in milliseconds.
2. There are two spaces between the timestamp and the event name in the observed parser tests.
3. The rest of the line follows the WotLK combat log CSV layout.

### 4. Chronicle-Specific Metadata Lines

In addition to standard combat log lines, Chronicle actively ingests these extension events:

1. `CHRONICLE_HEADER`
2. `CHRONICLE_ZONE_INFO`
3. `CHRONICLE_COMBATANT_INFO`
4. `CHRONICLE_UNIT_INFO`
5. `CHRONICLE_UNIT_EVADE`
6. `CHRONICLE_UNIT_COMBAT`
7. `SPELL_INTERRUPT`
8. `SPELL_ABSORBED`
9. `SPELL_PERIODIC_DRAIN`
10. `SPELL_DISPEL`
11. `SPELL_STOLEN`

They are registered in [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L44).

Chronicle also accepts these extension events, but currently ignores them:

1. `CHRONICLE_ENCOUNTER_START`
2. `CHRONICLE_ENCOUNTER_END`
3. `CHRONICLE_ENCOUNTER_CREDIT`
4. `CHRONICLE_SPELL_TARGET_RESULT`
5. `CHRONICLE_LOOT_ITEM`
6. `CHRONICLE_LOOT_MONEY`

Those are no-ops in [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L366).

They are safe to send, but they do not currently affect parsing outcomes.

At the moment, Chronicle does not have a dedicated persisted path for `CHRONICLE_SPELL_TARGET_RESULT`, `CHRONICLE_LOOT_ITEM`, or `CHRONICLE_LOOT_MONEY`. The module may send them, and Chronicle will accept them, but they are currently treated as accepted-but-ignored extension lines until their field layouts and storage requirements are finalized.

## Part 2: Exact Event Payloads The Module Should Send

This section is the most important one for validating an existing module.

### `CHRONICLE_HEADER`

Purpose:
Provide realm and build metadata for the log stream.

Parsed in: [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L82)

Expected fields, in order:

1. `realmName`
2. `version`
3. `build`

Example:

```text
1777340510851  CHRONICLE_HEADER,"My Realm","3.3.5a",12340
```

Notes:

1. Realm ownership still comes from the upload key.
2. This line is still valuable for diagnostics and consistency.
3. Chronicle can parse a blank realm name, but that should not be the intended steady-state behavior.

### `CHRONICLE_ZONE_INFO`

Purpose:
Explicitly identify the zone and instance context.

Parsed in: [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L107)

Expected fields, in order:

1. `zoneName`
2. `mapId`
3. `instanceId`
4. `instanceType`

Example:

```text
1777340510851  CHRONICLE_ZONE_INFO,"Zul'Farrak",209,230,"party"
```

Notes:

1. This is one of the most important extension lines.
2. It gives Chronicle explicit zone, map, and instance ID context even when synthetic detection is incomplete.
3. The parser lowercases the zone name before storing it.

### `CHRONICLE_COMBATANT_INFO`

Purpose:
Describe player combatants with class, race, guild, gear, and talents.

Parsed in: [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L137)

Expected fields, in order:

1. `playerGUID`
2. `name`
3. `class`
4. `race`
5. `gender`
6. `level`
7. `guild`
8. `gearString`
9. `talentString`

Example shape:

```text
1777340510900  CHRONICLE_COMBATANT_INFO,0x0000000000000001,"Chronicle","PRIEST","HUMAN",0,60,"Guild Name","itemA&itemB&itemC","talent-string"
```

Notes:

1. `gender` is parsed according to AzerothCore-side integer values.
2. `level` is consumed but not persisted into the combatant model today.
3. `gearString` and `talentString` should be omitted as empty strings if unavailable, not replaced by ad hoc placeholders.
4. If gear resolution is available, Chronicle can enrich parsed items later.

### `CHRONICLE_UNIT_INFO`

Purpose:
Describe NPCs and other non-player units when first observed.

Parsed in: [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L266)

Expected fields, in order:

1. `guid`
2. `name`
3. `level`
4. `unitFlags`
5. `ownerGuid`
6. `maxHealth`

Example shape:

```text
1777340510910  CHRONICLE_UNIT_INFO,0xF130001C68000001,"Boss Name",63,0x0,0x0000000000000000,450000
```

Notes:

1. `unitFlags` is currently parsed and discarded.
2. `maxHealth` is currently consumed and discarded.
3. `ownerGuid` matters for pets, guardians, and other owned units.
4. Even though some fields are not persisted today, the module should still send them in the expected positions so the parser stays aligned.

### `CHRONICLE_UNIT_EVADE`

Purpose:
Capture unit evasion behavior for diagnostics and encounter state.

Parsed in: [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L210)

Expected fields, in order:

1. `guid`
2. `name`
3. `reason`

Example:

```text
1777340515000  CHRONICLE_UNIT_EVADE,0xF130001C68000001,"Boss Name",1
```

Notes:

The reason is treated as a uint8 enum on the Chronicle side.

### `CHRONICLE_UNIT_COMBAT`

Purpose:
Record that a unit entered combat with a victim.

Parsed in: [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L234)

Expected fields, in order:

1. `unitGuid`
2. `unitName`
3. `victimGuid`
4. `victimName`

Example:

```text
1777340512000  CHRONICLE_UNIT_COMBAT,0xF130001C68000001,"Boss Name",0x0000000000000001,"Chronicle"
```

### `SPELL_INTERRUPT`

Purpose:
Capture interrupt semantics explicitly from AzerothCore hooks.

Parsed in: [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L322)

Expected layout:

1. Standard six combat-log base fields.
2. Interrupting spell triplet.
3. Interrupted spell triplet.

Tested example from Chronicle:

```text
1777228582945  SPELL_INTERRUPT,0x0000000000000001,"Chronicle",0x400,0xF130002C36000022,"Ragefire Trogg",0x0,1766,"Kick",0x1,331,"Healing Wave",0x8
```

Reference test: [combatlog/parser/azerothcore/parser_test.go](/root/chronicle/combatlog/parser/azerothcore/parser_test.go#L108)

### `SPELL_ABSORBED`

Purpose:
Capture absorbed damage events accurately from AzerothCore hooks.

Parsed in: [combatlog/parser/azerothcore/parser.go](/root/chronicle/combatlog/parser/azerothcore/parser.go#L372)

Chronicle supports two variants:

1. Melee absorbed variant.
2. Spell absorbed variant.

Melee example from Chronicle tests:

```text
1777166257180  SPELL_ABSORBED,0xF130002C36000022,"Ragefire Trogg",0x0,0x0000000000000001,"Chronicle",0x0,0x0000000000000001,"Chronicle",0x400,10901,"Power Word: Shield",0x2,11
```

Spell example from Chronicle tests:

```text
1777166257180  SPELL_ABSORBED,0xF130002C36000022,"Ragefire Trogg",0x0,0x0000000000000001,"Chronicle",0x0,12345,"Fireball",0x4,0x0000000000000001,"Chronicle",0x400,10901,"Power Word: Shield",0x2,50
```

Reference tests:

1. [combatlog/parser/azerothcore/parser_test.go](/root/chronicle/combatlog/parser/azerothcore/parser_test.go#L58)
2. [combatlog/parser/azerothcore/parser_test.go](/root/chronicle/combatlog/parser/azerothcore/parser_test.go#L79)

## Part 3: What The Module Must Do On The HTTP Side

The existing module should be checked against this exact HTTP contract.

### Endpoint

Chronicle exposes the AzerothCore upload endpoint under the service AzerothCore routes in [api/serviceazerothcore/handler.go](/root/chronicle/api/serviceazerothcore/handler.go#L25).

The expected live endpoints are:

1. `POST /api/v1/azerothcore/upload`
2. `GET /api/v1/azerothcore/ping`

### Upload Authentication

The module must send:

```text
Authorization: Bearer <raw-upload-secret>
```

That raw secret is generated once when Chronicle creates the upload key in [api/serviceazerothcore/servers.go](/root/chronicle/api/serviceazerothcore/servers.go#L375).

Chronicle stores only the SHA-256 hash of the secret.

### Optional Diagnostic Headers

The live upload contract currently requires only these instance headers:

1. `X-Chronicle-Instance-Id`
2. `X-Chronicle-Instance-Name`
3. `X-Chronicle-Instance-Token`

Chronicle may also receive optional diagnostic metadata such as:

1. `X-Chronicle-Realm-Name`

This header is currently helpful for debugging integration issues, but it does not control realm ownership or upload routing. Realm ownership still comes from the upload key.

### Multipart Form Requirements

The upload must include a multipart file part named:

```text
combat_log
```

Chronicle reads this in [api/serviceazerothcore/upload.go](/root/chronicle/api/serviceazerothcore/upload.go#L119).

If the field name differs, Chronicle will reject the upload.

### Compression Behavior

Chronicle detects gzip by content type or filename in [api/serviceazerothcore/upload.go](/root/chronicle/api/serviceazerothcore/upload.go#L219).

Recommended behavior for the module:

1. Always gzip the upload body.
2. Use a filename ending in `.gz` or set an appropriate gzip content type.
3. Treat each upload chunk as a complete gzip member.

This matches Chronicle's append strategy in [chronicle/chronicle.go](/root/chronicle/chronicle/chronicle.go#L394), where later gzip chunks are concatenated into a multistream gzip file.

### Upload Lifecycle And Segmentation

Chronicle does not require one upload per run. It supports segmented uploads for one logical run as long as each segment reuses the same:

1. `X-Chronicle-Instance-Id`
2. `X-Chronicle-Instance-Name`
3. `X-Chronicle-Instance-Token`

This means the following upload patterns are valid and expected:

1. Final instance uploads.
2. Idle-rotation uploads.
3. Snapshot uploads.
4. Orphan-recovery uploads from an earlier unfinished run.

Do not generate a new token per segment.
Generate a new token only for a new logical run.

## Part 4: Chronicle-Side Setup Required Before The Module Can Work

The module cannot work correctly unless Chronicle has been prepared with the right server and realm records.

### Required Chronicle Objects

Chronicle needs:

1. A WoW server record.
2. A WoW realm record under that server.
3. An upload key for that realm.

The admin CRUD routes live in [api/serviceazerothcore/handler.go](/root/chronicle/api/serviceazerothcore/handler.go#L34).

The relevant SDK types are in [api/chroniclesdk/azerothcore.go](/root/chronicle/api/chroniclesdk/azerothcore.go#L1).

### Upload Key Storage Model

Upload keys are stored in the `wow_server_upload_keys` table created by [database/migrations/000084_upload_keys.up.sql](/root/chronicle/database/migrations/000084_upload_keys.up.sql#L1).

Important implications:

1. Upload keys belong to realms.
2. Deleting the realm invalidates the upload key.
3. Chronicle tracks `last_used_at`, so it is possible to confirm whether the module is successfully authenticating.

### Instance Upload Metadata Storage

Chronicle stores per-log-group instance metadata in `server_upload_meta`.

The current query layer for that metadata is in [database/queries/server_upload.sql](/root/chronicle/database/queries/server_upload.sql#L1).

This metadata is what lets Chronicle append new uploads to the correct existing log group.

## Part 5: What Chronicle Does Not Ingest From The Live Module

This is the most common source of confusion.

Chronicle does not expect the live module upload endpoint to receive:

1. Full world creature template tables.
2. Full world spawn tables.
3. Full instance metadata tables.
4. Item template dumps.
5. DBC tables.

Those are handled separately.

The live module should not try to encode those datasets into the combat log stream or push them through the upload endpoint.

## Part 6: Offline World And Game-Data Ingestion

If you want Chronicle to have better boss recognition, instance mapping, hostile-unit coverage, or item and creature metadata, that happens through the offline import pipeline.

### World Import Entry Point

The CLI entry point is [cmd/chronicle/cli/importworld.go](/root/chronicle/cmd/chronicle/cli/importworld.go#L18).

It scans a directory of JSON files and upserts them into Chronicle tables.

### JSON File Format Expected By Chronicle

Chronicle expects each imported JSON file to be:

1. A top-level JSON array.
2. Each element an object.
3. Keys matching known table schemas or fingerprints.

The detection and import logic is in:

1. [cmd/chronicle/cli/importworld.go](/root/chronicle/cmd/chronicle/cli/importworld.go#L130)
2. [cmd/chronicle/cli/importworld.go](/root/chronicle/cmd/chronicle/cli/importworld.go#L241)
3. [cmd/chronicle/cli/importworld_turtle.go](/root/chronicle/cmd/chronicle/cli/importworld_turtle.go#L20)

Best practice for an exporter is simple:

1. Name the file exactly after the Chronicle table.
2. Emit a JSON array.
3. Use one object per row.

### High-Value Offline Tables For AzerothCore-Based Servers

For instance recognition and instance bootstrap, the highest-value tables are:

1. `world_instance_script`
2. `world_boss_credit`
3. `world_creature_spawn`
4. `world_creature_template`

These are the inputs used by the Warmane bootstrap path in [cmd/chronicle/cli/importworld_warmane.go](/root/chronicle/cmd/chronicle/cli/importworld_warmane.go#L84).

Relevant Chronicle-side source schemas:

1. `world_instance_script` and `world_boss_credit`: [database/migrations/000098_world_instance_source_tables.up.sql](/root/chronicle/database/migrations/000098_world_instance_source_tables.up.sql#L1)
2. `world_creature_spawn` and `world_creature_template`: [database/migrations/000041_world_data.up.sql](/root/chronicle/database/migrations/000041_world_data.up.sql#L14)

### Current Target Instance Template Structure Inside Chronicle

Chronicle's current query layer for instance templates is in [database/queries/world_instance_template.sql](/root/chronicle/database/queries/world_instance_template.sql#L1).

The current shape is effectively:

1. `world_instance_template`
   Fields include `name`, `abbreviation`, `category`, `boss_count`, `background`, and `map_id`.
2. `world_instance_zone_names`
3. `world_instance_units`

The current name-keyed upsert behavior is visible in [database/queries/world_instance_template.sql](/root/chronicle/database/queries/world_instance_template.sql#L13).

That is the structure the offline import and bootstrap side should target.

## Part 7: Module-Side Checklist Of Hook Points

Because the module already exists, the right task is not to redesign it.
The right task is to verify that each required Chronicle datum is emitted from a stable AzerothCore-side hook point.

This section is written as a module-side checklist.
Use it to audit the existing module implementation.

### Module-Side Architecture Checklist

Before looking at individual hook points, confirm the module has these internal responsibilities split cleanly:

1. Configuration loader for Chronicle URL, upload token, enable flag, flush interval, retry policy, and timeouts.
2. Instance-tracking component that owns map ID, instance ID, instance name, instance type, and the stable instance token.
3. Chronicle line formatter that writes unix-millisecond timestamps and exact event field order.
4. Buffered writer that accumulates lines until a flush boundary.
5. HTTP uploader that gzips and posts multipart `combat_log` payloads.
6. Hook adapters that gather game state and feed normalized events into the formatter.

If the current module mixes formatting, state tracking, and HTTP upload directly inside gameplay hooks, clean separation is worth adding before debugging protocol issues.

### Hook Point 1: Module Startup And Configuration

Goal:
Make sure the module is configured and can fail closed when Chronicle integration is not ready.

Primary hook family:

1. `WorldScript` startup and configuration hooks.

Relevant AzerothCore surface from `ScriptMgr.h`:

1. `OnBeforeConfigLoad`
2. `OnAfterConfigLoad`
3. `OnStartup`
4. `OnShutdown`

Module-side checklist:

1. Read Chronicle base URL from module config.
2. Read the raw upload secret from module config.
3. Validate that upload is disabled if URL or token is missing.
4. Initialize the HTTP client and gzip upload path.
5. Initialize the in-memory run buffer and instance tracker.
6. Log a clear startup message showing whether Chronicle upload is enabled.

Good outcome:

The module can start with Chronicle disabled, and when enabled it has a ready HTTP client before any combat data is emitted.

### Hook Point 2: Health Check Against Chronicle

Goal:
Verify the configured upload key and endpoint before the module attempts live uploads.

Primary hook family:

1. Startup-time module initialization.
2. Optional periodic retry from a world or map update tick.

Relevant AzerothCore surface:

1. `WorldScript::OnStartup`
2. `MapScript::OnMapUpdate` if you already have a retry scheduler

Module-side checklist:

1. Call `GET /api/v1/azerothcore/ping` with bearer auth.
2. Confirm a `200` response before declaring upload healthy.
3. Treat the response realm name as diagnostic metadata, not as required control-plane state.
4. Back off and retry on startup failure instead of spamming uploads.

Good outcome:

You can tell immediately whether the module is talking to Chronicle with the correct key.

### Hook Point 3: Player Login And Session Priming

Goal:
Capture player identity early so `CHRONICLE_COMBATANT_INFO` can be emitted before the first important combat events.

Primary hook family:

1. `PlayerScript`

Relevant AzerothCore surface from `ScriptMgr.h`:

1. `OnPlayerLogin`
2. `OnPlayerLoadFromDB`
3. `OnPlayerLogout`
4. `OnPlayerBeforeLogout`

Module-side checklist:

1. On player login or load, gather name, GUID, class, race, gender, level, guild, gear, and talents if available.
2. Cache that player snapshot in module state.
3. Mark whether `CHRONICLE_COMBATANT_INFO` has already been emitted for that player in the current run.
4. On logout, either evict the cached state or mark the player offline so stale data is not reused incorrectly.

Good outcome:

Player metadata is available before combat begins, and repeated uploads do not lose player context.

### Hook Point 4: Entering Or Leaving A Map / Instance

Goal:
Establish or reset instance context and emit `CHRONICLE_ZONE_INFO` at the correct time.

Primary hook family:

1. `MapScript`
2. `PlayerScript`

Relevant AzerothCore surface from `ScriptMgr.h`:

1. `OnPlayerEnterMap`
2. `OnPlayerLeaveMap`
3. `OnPlayerUpdateZone`
4. `OnPlayerUpdateArea`
5. `OnPlayerBindToInstance`
6. `OnPlayerBeforeTeleport`

Module-side checklist:

1. Detect when the recorder enters an instanced map.
2. Read or derive the map ID.
3. Read or derive the server instance ID.
4. Resolve the human-readable instance name.
5. Determine instance type such as party or raid.
6. Create a new stable Chronicle instance token when a new logical run begins.
7. Emit `CHRONICLE_ZONE_INFO` as soon as the instance context is trustworthy.
8. Do not rotate the instance token on every zone update within the same run.
9. On leaving the instance, close or flush the active run cleanly.

Good outcome:

Every upload chunk for one run carries the same instance identity headers, and the log body includes a matching `CHRONICLE_ZONE_INFO` line.

### Hook Point 5: Recorder Selection

Goal:
Make sure the module consistently knows which player is the source of the uploaded log stream.

Primary hook family:

1. `PlayerScript`
2. Any module-local session ownership logic

Module-side checklist:

1. Decide whether the module runs per-player, per-worldserver, or on a designated recorder account.
2. Ensure only one active recorder is responsible for one Chronicle upload stream.
3. Make sure uploads are not duplicated by multiple simultaneous recorders unless that is an intentional design.
4. Ensure recorder changes trigger a clean run rollover rather than mixing two recorders into one token.

Good outcome:

Chronicle receives one coherent stream per logical recorder session.

### Hook Point 6: First-Seen Unit Discovery

Goal:
Emit `CHRONICLE_UNIT_INFO` for relevant units before they produce enough combat to be misclassified or show as unknown.

Primary hook family:

1. `CreatureScript`
2. Creature AI layer for hostile NPCs
3. Module-local object observation when units are targeted, damaged, or enter combat

Relevant AzerothCore surface from `ScriptMgr.h`:

1. `OnCreatureAddWorld`
2. `OnCreatureUpdate`
3. `OnCreatureRemoveWorld`

Module-side checklist:

1. When an NPC relevant to the active run is first observed, gather GUID, name, level, unit flags, owner GUID if present, and max health.
2. Emit `CHRONICLE_UNIT_INFO` once per relevant GUID per run.
3. Do not flood the log with repeated `CHRONICLE_UNIT_INFO` lines for the same unit unless something about the serializer requires replay at chunk boundaries.
4. Include owner GUID for pets, guardians, or controlled units when available.

Good outcome:

Chronicle sees unit identity early, and boss or add attribution has more context than raw combat lines alone.

### Hook Point 7: Combat Start For NPCs And Bosses

Goal:
Emit `CHRONICLE_UNIT_COMBAT` when units actually engage so Chronicle gets a direct combat-enter signal.

Primary hook family:

1. Creature AI or boss AI engagement hooks.
2. Fallback module-local combat observation if AI hooks are not already wrapped.

Typical implementation surface:

1. `JustEngagedWith`
2. `EnterCombat`
3. Equivalent boss AI engagement callback already used by the module

Module-side checklist:

1. On first combat engagement, emit `CHRONICLE_UNIT_COMBAT` with unit GUID/name and victim GUID/name.
2. Ensure the event fires only once per combat start rather than every update tick.
3. Prefer AI engagement hooks over polling combat state in `OnCreatureUpdate` if the module already has access to them.

Good outcome:

Chronicle receives an explicit signal that a tracked unit entered combat, which is especially useful when damage activity is sparse or delayed.

### Hook Point 8: Evade And Reset Handling

Goal:
Emit `CHRONICLE_UNIT_EVADE` when a tracked hostile resets or evades.

Primary hook family:

1. Creature AI evade or reset hooks.
2. Fallback module-local detection if the AI layer is abstracted differently.

Typical implementation surface:

1. `EnterEvadeMode`
2. Boss reset callbacks
3. Equivalent internal module hook that already knows the evade reason

Module-side checklist:

1. Emit `CHRONICLE_UNIT_EVADE` with GUID, name, and reason code.
2. Use one stable mapping for evade reasons.
3. Do not collapse all resets into one generic reason if the module already knows boundary, no-path, sequence-break, or similar causes.

Good outcome:

Chronicle can distinguish real combat from repeated reset noise and can diagnose failed pulls better.

### Hook Point 9: Standard Combat Log Emission

Goal:
Make sure ordinary combat lines remain the backbone of the uploaded log.

Primary hook family:

1. Whatever hook or sink the module already uses to observe combat packets or combat events.

Module-side checklist:

1. Emit standard WotLK combat log event lines in addition to `CHRONICLE_*` lines.
2. Use unix-millisecond timestamps on every line.
3. Preserve event ordering as seen by the module.
4. Do not convert everything into custom Chronicle events; only add Chronicle-specific lines where Chronicle explicitly expects them.

Good outcome:

Chronicle continues to work as a combat parser first, with module-specific lines acting as structured hints rather than a replacement protocol.

### Hook Point 10: Interrupt Capture

Goal:
Emit `SPELL_INTERRUPT` in the field layout Chronicle already parses.

Primary hook family:

1. Spell or combat hook where the interrupting spell and interrupted spell are both known.
2. Existing module-local interrupt observer if the module already has one.

Module-side checklist:

1. Only emit this event when both sides of the interrupt are known well enough to populate the Chronicle layout.
2. Preserve the standard combat base fields first.
3. Then write the interrupting spell triplet.
4. Then write the interrupted spell triplet.
5. Validate against the Chronicle example in this document before assuming parity.

Good outcome:

Interrupts parse cleanly into Chronicle's explicit interrupt model instead of being inferred from weaker combat signals.

### Hook Point 11: Absorb Capture

Goal:
Emit `SPELL_ABSORBED` in one of the two Chronicle-supported layouts.

Primary hook family:

1. Damage-absorb hook where the damage spell, absorb caster, absorb spell, and amount are available.
2. Existing module-local absorb observer if the module already has one.

Module-side checklist:

1. Distinguish melee-absorbed from spell-absorbed variants.
2. Preserve Chronicle's exact field ordering for each variant.
3. Validate output against Chronicle's parser tests before relying on production data.
4. If the hook cannot reliably provide both variants, emit only the variant you can guarantee rather than writing malformed mixed events.

Good outcome:

Absorbs are parsed explicitly and consistently instead of being lost or misinterpreted.

### Hook Point 12: Periodic Flush And Upload

Goal:
Upload buffered lines safely without breaking one logical run into unrelated Chronicle log groups.

Primary hook family:

1. World or map update tick.
2. Module-local scheduler.
3. Shutdown or instance-end cleanup path.

Relevant AzerothCore surface from `ScriptMgr.h`:

1. `OnMapUpdate`
2. `OnShutdown`
3. `OnPlayerBeforeLogout` for recorder-bound implementations

Module-side checklist:

1. Flush on size or time interval, not every single event.
2. Gzip each flushed chunk.
3. Upload as multipart field `combat_log`.
4. Send the current instance ID, instance name, and stable instance token on every upload.
5. Retry with backoff on transient failure.
6. On final flush, do not generate a fresh token.

Good outcome:

Chronicle appends chunks into one log group for the run instead of fragmenting them.

### Hook Point 13: Final Flush On Run End

Goal:
Finish the run cleanly and avoid leaving buffered data stranded.

Primary hook family:

1. Instance leave hook.
2. Recorder logout hook.
3. World shutdown hook.
4. Encounter or raid completion hook if the module already uses one.

Module-side checklist:

1. Flush any remaining buffered lines before clearing run state.
2. Upload the final chunk with the same token used throughout the run.
3. Only after a successful or terminally failed final flush should the module retire the active token.

Good outcome:

The last part of the run is not lost and Chronicle sees one complete merged stream.

### Hook Point 14: Optional Encounter Hooks

Goal:
Support future Chronicle use of structured encounter boundaries without blocking current ingestion.

Primary hook family:

1. Boss AI or instance-script encounter lifecycle hooks.

Module-side checklist:

1. If the module already has reliable encounter start/end/credit signals, it may emit:
  `CHRONICLE_ENCOUNTER_START`
  `CHRONICLE_ENCOUNTER_END`
  `CHRONICLE_ENCOUNTER_CREDIT`
2. Treat them as optional.
3. Do not block deployment on these events, because Chronicle currently treats them as no-ops.

Good outcome:

The module stays forward-compatible without taking on a fake dependency.

### Minimal Hook Coverage Required

If the existing module is incomplete and you need the shortest path to correctness, these are the minimum hook responsibilities that must exist somewhere in the module:

1. Startup/config hook that loads Chronicle URL and upload token.
2. Map or player transition hook that establishes instance context and emits `CHRONICLE_ZONE_INFO`.
3. Player login or session hook that can emit `CHRONICLE_HEADER` and optionally player metadata.
4. Combat event sink that writes standard WotLK combat lines with unix-millisecond timestamps.
5. Upload path that gzips and posts multipart `combat_log` segments with the three required instance headers.

Everything else improves quality, but those five areas are the minimum viable hook surface.

## Part 8: Verification Checklist For The Existing Module

Use this checklist to verify whether the existing module is configured correctly.

### Chronicle Setup Checklist

1. Confirm the target Chronicle server record exists.
2. Confirm the target Chronicle realm record exists.
3. Confirm an upload key exists for that realm.
4. Confirm the module has the raw upload secret, not the stored hash.
5. Confirm the upload key's `last_used_at` changes when the module attempts uploads.

### Module Configuration Checklist

1. Confirm the module points at the correct Chronicle base URL.
2. Confirm the module uses `POST /api/v1/azerothcore/upload`.
3. Confirm the module uses bearer auth.
4. Confirm uploads are multipart.
5. Confirm the multipart file field name is `combat_log`.
6. Confirm uploads are gzip-compressed.
7. If present, confirm `X-Chronicle-Realm-Name` is treated as optional metadata rather than a required header.

### Header Contract Checklist

On every upload, confirm the module sends:

1. `X-Chronicle-Instance-Id`
2. `X-Chronicle-Instance-Name`
3. `X-Chronicle-Instance-Token`

Then verify:

1. Instance ID is stable for the actual server instance.
2. Instance name is human-readable and consistent.
3. Instance token remains stable across all chunks for the same run.
4. Instance token changes between separate runs.

### Log Body Checklist

Confirm the uploaded file contains:

1. Unix-millisecond timestamps.
2. Standard WotLK combat log events.
3. `CHRONICLE_HEADER`.
4. `CHRONICLE_ZONE_INFO`.
5. `CHRONICLE_COMBATANT_INFO` for players when available.
6. `CHRONICLE_UNIT_INFO` for NPCs or important units when first observed.
7. `SPELL_INTERRUPT` and `SPELL_ABSORBED` in the Chronicle-supported field layouts if those hooks are implemented.
8. `SPELL_PERIODIC_DRAIN`, `SPELL_DISPEL`, and `SPELL_STOLEN` when the module emits them.
9. Any `CHRONICLE_SPELL_TARGET_RESULT`, `CHRONICLE_LOOT_ITEM`, or `CHRONICLE_LOOT_MONEY` lines are optional today and may be accepted without changing parse output.

### Append Behavior Checklist

If the module uploads multiple segments during one long run, verify:

1. Multiple uploads for the same token append to one Chronicle log group.
2. Chronicle does not create a new log group for every chunk.
3. The final merged log reparses successfully.
4. Idle rotations, snapshots, and orphan recovery all behave like normal late segments for the same token.

Chronicle's append logic lives in [chronicle/chronicle.go](/root/chronicle/chronicle/chronicle.go#L394).

### Realm Association Checklist

Verify:

1. The configured upload key belongs to the intended Chronicle realm.
2. Parsed instances land under the correct realm even if `CHRONICLE_HEADER` is incomplete.

Chronicle uses the job args realm fallback in [chronicle/logparse.go](/root/chronicle/chronicle/logparse.go#L699), so the upload-key realm association is operationally critical.

## Part 9: Common Failure Modes

### Wrong Upload Key

Symptom:
Logs land under the wrong realm or are rejected.

Cause:
The module is configured with an upload key from a different Chronicle realm.

### Missing Instance Token

Symptom:
Uploads are rejected with missing required metadata headers.

Cause:
The module is still using an older header contract.

### Rotating Token Per Chunk

Symptom:
Chronicle creates multiple log groups for one live run.

Cause:
The module generates a new `X-Chronicle-Instance-Token` on every flush instead of once per logical run.

### Wrong Multipart Field Name

Symptom:
Chronicle rejects the upload because it cannot find the file.

Cause:
The form field is not named `combat_log`.

### Timestamps Not In Unix Milliseconds

Symptom:
The parser fails or misreads event ordering.

Cause:
The module writes wall-clock timestamps instead of unix-millisecond timestamps.

### Missing Zone Context

Symptom:
Chronicle parses combat lines but instance attribution is weak or incomplete.

Cause:
The module does not emit `CHRONICLE_ZONE_INFO`, forcing Chronicle to rely only on inference.

### Trying To Send Static Metadata Through The Live Upload Path

Symptom:
No improvement in instance recognition despite sending extra custom payloads.

Cause:
Chronicle's live upload path does not ingest full world-table datasets.

## Part 10: Recommended Minimal Good Module Behavior

If the existing module is being reduced to the minimum viable correct behavior, it should do at least this:

1. Keep a stable Chronicle upload configuration.
2. Ping Chronicle successfully using the upload key.
3. When an instance run begins, generate one instance token.
4. Emit `CHRONICLE_HEADER`.
5. Emit `CHRONICLE_ZONE_INFO`.
6. Emit standard WotLK combat log lines with unix-millisecond timestamps.
7. Upload gzip-compressed `combat_log` segments to the Chronicle upload endpoint.
8. Reuse the same instance token for every segment in the same run.

That is enough to satisfy Chronicle's live ingestion contract.

The following are strong improvements, but not the absolute minimum:

1. `CHRONICLE_COMBATANT_INFO`
2. `CHRONICLE_UNIT_INFO`
3. `CHRONICLE_UNIT_EVADE`
4. `CHRONICLE_UNIT_COMBAT`
5. `SPELL_INTERRUPT`
6. `SPELL_ABSORBED`

## Part 11: Recommended Offline Export Structure For AzerothCore-Based Worlds

If the goal expands beyond live log ingestion and includes high-quality instance recognition, add a separate export path outside the live uploader.

Recommended exported filenames:

1. `world_instance_script.json`
2. `world_boss_credit.json`
3. `world_creature_spawn.json`
4. `world_creature_template.json`
5. `world_item_template.json`
6. `world_display_info.json`
7. `world_item_enchantment.json`
8. `world_spell_area.json`
9. `world_spell_chain.json`
10. `world_spell_group.json`
11. `world_spell_threat.json`

Each should be a JSON array whose object keys match Chronicle's importer schema in [cmd/chronicle/cli/importworld_turtle.go](/root/chronicle/cmd/chronicle/cli/importworld_turtle.go#L45).

For the instance-specific source tables, the Chronicle-facing shapes are:

### `world_instance_script.json`

```json
[
  {
    "map": 603,
    "parent": 0,
    "script": "instance_ulduar"
  }
]
```

### `world_boss_credit.json`

```json
[
  {
    "entry": 33113,
    "creditType": 0,
    "creditEntry": 33113,
    "lastEncounterDungeon": 0,
    "comment": "Flame Leviathan"
  }
]
```

Those exact key names match Chronicle's import schema mapping in [cmd/chronicle/cli/importworld_turtle.go](/root/chronicle/cmd/chronicle/cli/importworld_turtle.go#L67).

## Final Guidance

The correct mental model is:

1. The module is a live log emitter and uploader.
2. Chronicle is the uploader target, parser, and log-group manager.
3. Static world metadata belongs in a separate export and import pipeline.

If the existing module already uploads logs, the most important checks are:

1. It sends the three required instance headers.
2. It uses one stable instance token per logical run.
3. It writes unix-millisecond timestamps.
4. It sends `CHRONICLE_ZONE_INFO`.
5. It uploads the log as multipart field `combat_log` with bearer authentication.

If all of those are correct, then the module is aligned with Chronicle's required live ingestion contract.