---
name: unit-identities
description: Adds and categorizes Chronicle unit identities from shared unknown-unit reports. Use when investigating sample GUIDs, adding creature or gameobject entries, choosing semantic categories, or reviewing identity registration and flavor scope.
---

# Unit identities

Turn shared unknown-unit evidence into narrowly scoped identity rules, without changing combat behavior merely to remove an unknown warning.

## Collect evidence first

1. Ask for **Copy unknowns** from the relevant instance in Logs → log detail → Unit Categories (or the ordinary report's Unknown Units section). The export contains instance ordinal/name, zone, category, entry, distinct GUID count and sample GUIDs. Counts are not event counts; samples are not exhaustive.
2. Confirm the log's server/flavor and parser family separately; the export does not include flavor. Confirm names and template IDs against supplied log evidence or that flavor's game data. A familiar name or a decimal ID alone is not sufficient.
3. Parse samples with `guid.FromString` in `combatlog/parser/guid/guid.go`, inspect `IsObject`, `IsCreature`, `IsVehicle`, `IsPet` and `GetEntry`. Check errors and the boolean from `GetEntry`. For modern text GUIDs, inspect the applicable normalization path (`combatlog/parser/blizzard/modern/guid.go`) rather than forcing the legacy encoding.
4. Keep malformed or unresolved GUIDs as evidence. An entry of zero can mean unavailable, not template zero. Do not repair a GUID, guess its name, or assign a category solely to silence a warning. Ask for raw lines and flavor context when needed.

## Choose namespace and scope

Read `combatlog/parser/common/unitdb/category.go` and `combatlog/parser/common/identifier/identifier.go` before editing:

- Creatures and vehicles share the creature-template namespace: `identifier.NewIdentifier` and `AddEntryId`.
- Gameobjects have a separate numeric namespace: `Identifier.AddObjectEntryId`. The same number can denote a different creature. Never add an object to a creature map.
- Pets' entry bits are not creature-template IDs. Do not use `IsAnyCreature` to decide template registration; it includes pets.
- `unitdb.knownObjects` is the global recognized-gameobject map, not a fallback category for all object GUIDs. Use it only for a verified identity whose meaning is global.
- Zone/family/flavor-specific identities belong in the relevant `Identifier` construction. Follow `combatlog/parser/common/instances/hostiles.go` and its `database.WoWFlavor.Has` guards; inspect the instance factory/registry wiring so the rule is actually reached. Do not leak a zone rule into the shared unit database.
- For AzerothCore-provided unit metadata, inspect `combatlog/parser/azerothcore/encounters/consumer.go`. It chooses object versus creature registration from the GUID and preserves configured hooks. Do not override that path with a speculative static rule.

## Preserve behavior

`unitdb.Category` is semantic classification, independent of affiliation, ownership, temporary control and the `Identity.Boss` encounter role. Use the existing category constants; a name, damage event or owner does not by itself prove a category.

`Identifier.UnitCategory` resolves explicitly registered identities. An explicitly registered identity with no category defaults to `ordinary`. For category-only additions, set the category explicitly and preserve affiliation and encounter fields. `LoadAdds` in `common/instances/hostiles.go` assigns hostility: do not call it merely to categorize an environment object or guardian.

Preserve existing statistics, ranking inclusion, encounter timing, activity transitions, hooks and `NeverActive` factories (for example `combatlog/parser/vanilla/creatures/kara40.go`). Category changes do not authorize replacing these behaviors. For a real requested behavior change, establish separate evidence and tests.

The report's **Possible hostiles Go export** is a review scaffold (`api/chroniclesdk/identity_codegen.go`), not proof of hostility or a ready-to-register factory. Review GUID namespaces, affiliation, boss flags, hooks and flavor before using it. Unknown objects especially must not become creature entries just because a generated suggestion contains their numeric ID.

## Verify and report

- Add tests for the same numeric entry in creature, vehicle, object and pet GUIDs. Verify object rules do not classify colliding creatures or pets.
- Test the intended zone/flavor and an unrelated zone/flavor where the entry remains unknown. Cover both direct category lookup and instance finalization/reporting when relevant.
- Assert preserved affiliation/Boss/CanBattle and existing activity behavior for category-only changes. Keep passive observations and unique-GUID counts intact.
- Start with `go test ./combatlog/parser/common/identifier ./combatlog/parser/common/unitdb ./combatlog/parser/common/instances ./chronicle ./api/chroniclesdk`; also run tests for any touched parser family or creature factory. Review diffs and run formatting/lint for touched code.
- Report evidence, exact namespace and scope, tests, and unresolved questions. Never present a tentative diagnosis as a new identity rule.

## Evaluation scenarios

Use these as regression tasks when revising this skill:

1. **Portal:** supplied object samples resolve to Portal to Stormwind entry 176296. Verify against evidence, inspect the existing global `knownObjects` rule, and test a creature with the same ID remains separate. Do not duplicate the entry in a hostile map.
2. **Onyxia environment:** supplied Turtle Onyxia samples match the existing Lava Fissure gameobject entries in `OnyxiaHostiles`. Follow the Turtle-only `AddObjectEntryId` environment rule; preserve unknown affiliation and verify unrelated flavors/zones and colliding creatures do not inherit it. Do not generalize every object in Onyxia as environment.
3. **Malformed Zul'Gurub unknown:** a shared report includes entry zero or an unparseable sample without reliable name/flavor evidence. Retain it as unknown, request raw lines and parser/flavor context, and test that export/reporting preserves the sample. Do not invent a ZG creature, guardian or environmental identity.
