# Chronicle Ingestion Point Updates

This document captures the **Chronicle-side ingestion changes or updates** needed to align with the current `mod-chronicle` module implementation.

It is intentionally separate from `azerothcore-module-ingestion.md`.
That original file remains the baseline specification and checklist.
This file describes where the current module has moved ahead of, or diverged from, the current ingestion assumptions.

## Purpose

Use this file when updating the Chronicle ingestion point:

- upload endpoint expectations
- AzerothCore parser support
- ingestion-side documentation
- operational assumptions about upload segmentation and lifecycle

The goal is to avoid changing the module to fit outdated ingestion assumptions when the module is already emitting richer, valid data.

## Summary

The current `mod-chronicle` module is **mostly compatible** with Chronicle's live ingestion contract already.

No major protocol rewrite is required at the ingestion point.
The main work is:

1. Accept and document the module's richer current output.
2. Update ingestion-side assumptions that still describe an older periodic chunk or recorder-driven model.
3. Verify parser support for newly emitted events.
4. Decide whether extra metadata headers should remain optional, be documented, or become part of the formal contract.

## What Does Not Need To Change

These ingestion-point expectations already match the current module and should remain as-is:

1. `POST /api/v1/azerothcore/upload`
2. `GET /api/v1/azerothcore/ping`
3. Bearer-token authentication
4. Multipart field name `combat_log`
5. Required headers:
   - `X-Chronicle-Instance-Id`
   - `X-Chronicle-Instance-Name`
   - `X-Chronicle-Instance-Token`
6. Gzip-compressed upload payloads
7. WotLK combat-log line format with unix-millisecond timestamps
8. Existing ingestion of:
   - `CHRONICLE_HEADER`
   - `CHRONICLE_ZONE_INFO`
   - `CHRONICLE_COMBATANT_INFO`
   - `CHRONICLE_UNIT_INFO`
   - `CHRONICLE_UNIT_EVADE`
   - `CHRONICLE_UNIT_COMBAT`
   - `SPELL_INTERRUPT`
   - `SPELL_ABSORBED`

## Required Ingestion Updates

These are the concrete Chronicle-side updates that should be made.

### 1. Add Or Confirm Parser Support For Newly Emitted Events

The current module now emits additional live-body events that are not fully reflected in the original ingestion specification.

Current additional module output includes:

1. `SPELL_PERIODIC_DRAIN`
2. `SPELL_DISPEL`
3. `SPELL_STOLEN`
4. `CHRONICLE_SPELL_TARGET_RESULT`
5. `CHRONICLE_LOOT_ITEM`
6. `CHRONICLE_LOOT_MONEY`

#### Ingestion work needed

1. Confirm Chronicle parser support for each of the events above.
2. If parser support does not exist for an event, add it.
3. If the event is intentionally accepted but ignored, document that clearly.
4. If the event should be persisted, add the corresponding parser-to-storage path.

#### Impact

Right now the module is sending more information than the older ingestion checklist describes.
If Chronicle does not parse or intentionally ignore these events in a documented way, the ingestion point becomes the bottleneck instead of the module.

### 2. Update The Ingestion Contract Documentation For Extra Live Events

The ingestion-side documentation should be updated to reflect the module's actual transmitted event set.

#### Documentation update needed

Add a section that distinguishes:

1. required Chronicle upload contract
2. optional but supported live events
3. accepted-but-currently-ignored events
4. module-emitted events that still need parser verification

#### Impact on docs

Without this, the docs imply the module should only emit the older baseline event set, which is no longer true.

### 3. Update Ingestion Assumptions About Upload Lifecycle

The older ingestion model describes a generic buffered recorder with periodic flush and upload behavior.
The current module is more accurately described as:

1. instance-scoped
2. file-backed
3. segment-oriented
4. uploaded on finalization, idle rotation, snapshots, and orphan recovery

#### Lifecycle updates needed

Chronicle-side docs and operational expectations should recognize that uploads may arrive as:

1. final instance uploads
2. rotated idle segments
3. temporary snapshots
4. orphan-recovery uploads from previously unfinished runs

#### Operational impact

Chronicle append behavior already supports multi-part ingestion by stable instance token.
The ingestion point should explicitly treat these as normal upload patterns rather than assuming only periodic chunk timers.

### 4. Decide How To Treat `X-Chronicle-Realm-Name`

The current module sends an additional header:

- `X-Chronicle-Realm-Name`

This is in addition to the three required instance headers.

#### Ingestion-side decision needed

Choose one of these paths:

1. **Ignore but allow** it as optional metadata.
2. **Document and use** it for diagnostics only.
3. **Promote** it into a formal optional Chronicle contract field.

#### Recommended choice

Treat it as **optional diagnostic metadata**.
Do not make it required unless Chronicle truly needs it for behavior beyond what the upload key already provides.

#### Contract impact

The module is already sending it successfully, but the current contract does not describe it.
That mismatch creates confusion during audits even if nothing is technically broken.

## Recommended Ingestion Updates

These are not strictly blockers, but they should be done to keep Chronicle aligned with the current module.

### 5. Stop Treating Ping As Realm-Name Discovery

The older ingestion checklist implies the ping response should be used to record the Chronicle realm name for diagnostics.

#### Recommended update

Treat ping primarily as:

1. connectivity validation
2. authentication validation
3. endpoint sanity check

Do not assume the module must consume a returned realm-name payload as part of normal operation.

#### Reason

The current module uses ping as a health/auth check, not as a realm-discovery control plane.
The ingestion docs should not imply a stronger requirement than Chronicle actually needs.

### 6. Clarify Header Requirements Versus Helpful Metadata

The current ingestion docs should clearly separate:

#### Required on every upload

1. `X-Chronicle-Instance-Id`
2. `X-Chronicle-Instance-Name`
3. `X-Chronicle-Instance-Token`

#### Helpful but non-required metadata

1. `X-Chronicle-Realm-Name`
2. `CHRONICLE_HEADER` realm/build details

#### Review impact

This keeps integration reviews focused on true protocol failures instead of optional extras.

### 7. Clarify That `CHRONICLE_HEADER` Is Writer-Initialization Metadata

The older checklist frames `CHRONICLE_HEADER` as something that may come from login or session-priming flow.
In the current module, it is emitted when the instance writer or log segment is created.

#### Recommended ingestion update

Document that `CHRONICLE_HEADER` is required in the uploaded log body, but **not tied to one specific AzerothCore hook family**.

#### Semantics impact

Chronicle should care that the line is present and correctly formatted, not whether it was produced by a login hook versus an instance-writer initialization path.

## Verification Work Still Needed On The Chronicle Side

These items should be explicitly checked in Chronicle before treating the ingestion point as fully up to date.

### Parser Verification Checklist

1. Verify `SPELL_PERIODIC_DRAIN` field order and persistence behavior.
2. Verify `SPELL_DISPEL` field order and aura-type handling.
3. Verify `SPELL_STOLEN` field order and distinction from dispel.
4. Verify `CHRONICLE_SPELL_TARGET_RESULT` parsing and intended storage behavior.
5. Verify `CHRONICLE_LOOT_ITEM` parsing and intended storage behavior.
6. Verify `CHRONICLE_LOOT_MONEY` parsing and intended storage behavior.

### Append Behavior Checklist

1. Verify idle-rotated uploads append correctly under one stable instance token.
2. Verify snapshots do not fragment one logical run into multiple Chronicle groups.
3. Verify orphan-recovery uploads behave like normal late chunks for the same token.

### Documentation Checklist

1. Update the supported event inventory.
2. Update the upload-lifecycle description.
3. Document optional metadata headers.
4. Separate required contract from implementation-specific behavior.

## Priority Order

If this work is done in phases, the best order is:

### Priority 1: Parser Compatibility

1. `SPELL_PERIODIC_DRAIN`
2. `SPELL_DISPEL`
3. `SPELL_STOLEN`
4. `CHRONICLE_SPELL_TARGET_RESULT`
5. `CHRONICLE_LOOT_ITEM`
6. `CHRONICLE_LOOT_MONEY`

### Priority 2: Contract Clarity

1. document `X-Chronicle-Realm-Name` as optional
2. clarify ping expectations
3. distinguish required versus optional metadata

### Priority 3: Operational Documentation

1. document instance-scoped writer behavior
2. document snapshots, idle rotation, and orphan recovery as valid upload patterns
3. document that stable instance token continuity is the real append contract

## Bottom Line

The ingestion point does **not** need a ground-up redesign.

It mainly needs to catch up to the current module in three ways:

1. richer event support
2. clearer contract documentation
3. updated assumptions about how uploads are segmented and delivered

If those updates are made, Chronicle ingestion will be aligned with the current `mod-chronicle` implementation without forcing the module back toward the older, narrower ingestion model.
