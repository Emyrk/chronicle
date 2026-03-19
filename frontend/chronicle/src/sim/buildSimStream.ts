/**
 * Encode sim events as protobuf binary streams.
 *
 * Produces CachedStream objects in the exact same binary format that
 * InstanceEventsProvider returns (encounter-header + length-delimited
 * protobuf messages). This lets the entire EventsPanels system (workers,
 * cursors, processors) consume sim output with zero changes.
 */

import { create, toBinary } from "@bufbuild/protobuf";
import {
  DamageSchema,
  SpellGoSchema,
  EventMetaSchema,
  SpellDataSchema,
  School,
} from "../api/proto/chronicle_pb";
import type { CachedStream, StreamType } from "../hooks/instanceEvents/types";
import type { PayloadHeader } from "../api/protodecode/decode";
import type { StepResult } from "./engine";
import { EventType } from "./engine";
import type { SpellData } from "./types";
import {
  Outcome,
  SchoolMaskPhysical,
  SchoolMaskHoly,
  SchoolMaskFire,
  SchoolMaskNature,
  SchoolMaskFrost,
  SchoolMaskShadow,
  SchoolMaskArcane,
} from "./types";
import {
  HitTypeHit,
  HitTypeCrit,
  HitTypeMiss,
  HitTypeDodge,
  HitTypeParry,
  HitTypeGlancing,
  HitTypeCrushing,
  HitTypePartialResist,
  HitTypePeriodic,
  HitTypeOffHand,
} from "../lib/hittype/hittype";
import { SIM_ENCOUNTER_ID } from "./panelBridge";

// ============================================================================
// Varint encoding helpers
// ============================================================================

function writeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value >>> 0; // treat as unsigned 32-bit
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return new Uint8Array(bytes);
}

function writeVarint64(value: bigint): Uint8Array {
  const bytes: number[] = [];
  let v = value;
  while (v > 0x7fn) {
    bytes.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  bytes.push(Number(v & 0x7fn));
  return new Uint8Array(bytes);
}

// ============================================================================
// School / outcome conversion (matches panelBridge.ts)
// ============================================================================

function schoolMaskToProto(mask: number): School {
  if (mask & SchoolMaskArcane) return School.Arcane;
  if (mask & SchoolMaskShadow) return School.Shadow;
  if (mask & SchoolMaskFrost) return School.Frost;
  if (mask & SchoolMaskNature) return School.Nature;
  if (mask & SchoolMaskFire) return School.Fire;
  if (mask & SchoolMaskHoly) return School.Holy;
  if (mask & SchoolMaskPhysical) return School.Physical;
  return School.Unknown;
}

function outcomeToHitType(outcome: Outcome, resisted: number): number {
  let ht = 0;
  switch (outcome) {
    case Outcome.Crit:     ht = HitTypeCrit; break;
    case Outcome.Miss:     return HitTypeMiss;
    case Outcome.Dodge:    return HitTypeDodge;
    case Outcome.Parry:    return HitTypeParry;
    case Outcome.Glancing: ht = HitTypeGlancing; break;
    case Outcome.Crushing: ht = HitTypeCrushing; break;
    case Outcome.Resist:   return HitTypeMiss;
    default:               ht = HitTypeHit;
  }
  if (resisted > 0) ht |= HitTypePartialResist;
  return ht;
}

// ============================================================================
// Stream building
// ============================================================================

const SIM_PLAYER_GUID = "0x0000000000000001";
const SIM_TARGET_GUID = "0xF130000000000001";

const textEncoder = new TextEncoder();

/**
 * Build a damage stream from sim steps.
 *
 * Format per encounter:
 *   varint(len) + UTF-8(encounterID)
 *   varint64(firstTimestamp ms since epoch)
 *   varint(messageCount)
 *   varint(dataLength)
 *   [varint(msgLen) + protobuf(Damage)]...
 */
export function buildSimDamageStream(
  steps: StepResult[],
  spells: Map<number, SpellData>,
  encounterID: string,
  startTimestamp: Date,
): CachedStream {
  // Collect damage events and encode each as protobuf
  const encodedMessages: Uint8Array[] = [];
  let eventIndex = 0;

  for (const step of steps) {
    const hasDamage =
      step.amount > 0 ||
      step.outcome === Outcome.Miss ||
      step.outcome === Outcome.Dodge ||
      step.outcome === Outcome.Parry;
    if (!hasDamage) continue;

    const spell = step.spellID ? spells.get(step.spellID) : undefined;
    const isAutoAttack = step.event === EventType.AutoAttack || step.event === EventType.OffHandAttack;
    const isOffHand = step.event === EventType.OffHandAttack;
    const isDot = step.event === EventType.DotTick;

    let hitType = outcomeToHitType(step.outcome, step.resisted);
    if (isDot) hitType |= HitTypePeriodic;
    if (isOffHand) hitType |= HitTypeOffHand;

    const meta = create(EventMetaSchema, {
      index: eventIndex++,
      offsetMilli: BigInt(step.timeMs),
    });

    const dmg = create(DamageSchema, {
      meta,
      caster: SIM_PLAYER_GUID,
      sourceName: isAutoAttack
        ? (isOffHand ? "Auto Attack (OH)" : "Auto Attack")
        : (spell?.name ?? `Spell ${step.spellID}`),
      target: SIM_TARGET_GUID,
      hitType,
      amount: step.amount,
      school: schoolMaskToProto(step.school || SchoolMaskPhysical),
      tailers: [],
      // Auto attacks use spellId 6603 so the rotations processor can detect them
      spellData: isAutoAttack
        ? create(SpellDataSchema, { id: 6603, name: "Auto Attack" })
        : step.spellID
          ? create(SpellDataSchema, { id: step.spellID, name: spell?.name ?? `Spell ${step.spellID}` })
          : undefined,
    });

    encodedMessages.push(toBinary(DamageSchema, dmg));
  }

  return buildEncounterPayload(encodedMessages, encounterID, startTimestamp);
}

/** Wrap encoded protobuf messages into the encounter-header binary format. */
function buildEncounterPayload(
  encodedMessages: Uint8Array[],
  encounterID: string,
  startTimestamp: Date,
): CachedStream {
  // Build the data section: [varint(len) + bytes]...
  const dataParts: Uint8Array[] = [];
  let dataLength = 0;
  for (const msg of encodedMessages) {
    const lenPrefix = writeVarint(msg.length);
    dataParts.push(lenPrefix, msg);
    dataLength += lenPrefix.length + msg.length;
  }

  // Build the encounter header
  const encIdBytes = textEncoder.encode(encounterID);
  const parts: Uint8Array[] = [
    writeVarint(encIdBytes.length),
    encIdBytes,
    writeVarint64(BigInt(startTimestamp.getTime())),
    writeVarint(encodedMessages.length),
    writeVarint(dataLength),
    ...dataParts,
  ];

  // Concatenate all parts
  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  const data = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    data.set(p, offset);
    offset += p.length;
  }

  const header: PayloadHeader = {
    encounterID,
    firstTimestamp: startTimestamp,
    count: encodedMessages.length,
    dataLength,
  };

  return { data, headers: [header] };
}

/**
 * Build a spell_go stream from sim steps.
 * Encodes CastComplete events as SpellGo protobuf messages.
 */
export function buildSimSpellGoStream(
  steps: StepResult[],
  spells: Map<number, SpellData>,
  encounterID: string,
  startTimestamp: Date,
): CachedStream {
  const encodedMessages: Uint8Array[] = [];
  let eventIndex = 0;

  for (const step of steps) {
    // Only CastComplete events with a spell ID become spell_go
    if (step.event !== EventType.CastComplete || !step.spellID) continue;

    const spell = spells.get(step.spellID);

    const meta = create(EventMetaSchema, {
      index: eventIndex++,
      offsetMilli: BigInt(step.timeMs),
    });

    const msg = create(SpellGoSchema, {
      meta,
      caster: SIM_PLAYER_GUID,
      target: SIM_TARGET_GUID,
      spellData: create(SpellDataSchema, {
        id: step.spellID,
        name: spell?.name ?? `Spell ${step.spellID}`,
      }),
      numHits: step.amount > 0 ? 1 : 0,
    });

    encodedMessages.push(toBinary(SpellGoSchema, msg));
  }

  return buildEncounterPayload(encodedMessages, encounterID, startTimestamp);
}

/** Build an empty CachedStream for stream types the sim doesn't produce. */
export function emptyStream(): CachedStream {
  return { data: new Uint8Array(0), headers: [] };
}

/** Build all sim streams from step results. */
export function buildSimStreams(
  steps: StepResult[],
  spells: Map<number, SpellData>,
  startTimestamp: Date,
): Map<StreamType, CachedStream> {
  const streams = new Map<StreamType, CachedStream>();
  streams.set(
    "damage",
    buildSimDamageStream(steps, spells, SIM_ENCOUNTER_ID, startTimestamp),
  );
  streams.set(
    "spell_go",
    buildSimSpellGoStream(steps, spells, SIM_ENCOUNTER_ID, startTimestamp),
  );
  return streams;
}
