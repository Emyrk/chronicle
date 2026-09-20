/**
 * Tests for multi-stream, multi-encounter event interleaving.
 * 
 * The panelWorker processes events from multiple streams (damage, heal, etc.)
 * interleaved by their index within each encounter. This test verifies that
 * events are processed in the correct order.
 */

import { describe, it, expect } from 'vitest';
import { FastDamageCursor, FastHealCursor } from '@/api/protodecode/decode';
import type { StreamType } from '@/hooks/instanceEvents';
import type { PanelProcessor, ProcessorContext, ProcessorEvent } from '../processorTypes';

// ============================================================================
// Test helpers: Build encoded payloads
// ============================================================================

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return bytes;
}

function encodeVarint64(value: bigint): number[] {
  const bytes: number[] = [];
  while (value > 0x7fn) {
    bytes.push(Number(value & 0x7fn) | 0x80);
    value >>= 7n;
  }
  bytes.push(Number(value));
  return bytes;
}

function encodeString(s: string): number[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(s);
  return [...encodeVarint(bytes.length), ...bytes];
}

/**
 * Encode a protobuf tag (field number + wire type)
 */
function encodeTag(fieldNumber: number, wireType: number): number {
  return (fieldNumber << 3) | wireType;
}

/**
 * Build an EventMeta submessage (field 1 = index, field 2 = offsetMilli)
 */
function buildEventMeta(index: number, offsetMilli: number): number[] {
  const content: number[] = [];
  
  // Field 1: index (varint)
  if (index > 0) {
    content.push(encodeTag(1, 0)); // field 1, wire type 0 (varint)
    content.push(...encodeVarint(index));
  }
  
  // Field 2: offsetMilli (varint)
  if (offsetMilli > 0) {
    content.push(encodeTag(2, 0));
    content.push(...encodeVarint(offsetMilli));
  }
  
  return content;
}

/**
 * Build a Damage message
 * Fields: 1=meta, 3=caster, 4=sourceName, 5=target, 6=hitType, 7=amount, 8=school
 */
function buildDamageMessage(opts: {
  index: number;
  offsetMilli?: number;
  caster: string;
  sourceName: string;
  target: string;
  amount: number;
  hitType?: number;
  schools?: number[];
}): number[] {
  const content: number[] = [];
  
  // Field 1: EventMeta (length-delimited, wire type 2)
  const meta = buildEventMeta(opts.index, opts.offsetMilli ?? 0);
  if (meta.length > 0) {
    content.push(encodeTag(1, 2));
    content.push(...encodeVarint(meta.length));
    content.push(...meta);
  }
  
  // Field 3: caster (string)
  content.push(encodeTag(3, 2));
  content.push(...encodeString(opts.caster));
  
  // Field 4: sourceName (string)
  content.push(encodeTag(4, 2));
  content.push(...encodeString(opts.sourceName));
  
  // Field 5: target (string)
  content.push(encodeTag(5, 2));
  content.push(...encodeString(opts.target));
  
  // Field 6: hitType (varint)
  if (opts.hitType) {
    content.push(encodeTag(6, 0));
    content.push(...encodeVarint(opts.hitType));
  }
  
  // Field 7: amount (varint)
  content.push(encodeTag(7, 0));
  content.push(...encodeVarint(opts.amount));
  
  // Field 12: schools (packed repeated enum)
  if (opts.schools?.length) {
    const schools = opts.schools.flatMap(encodeVarint);
    content.push(encodeTag(12, 2));
    content.push(...encodeVarint(schools.length));
    content.push(...schools);
  }
  
  return content;
}

/**
 * Build a Heal message
 * Fields: 1=meta, 3=caster, 4=target, 5=sourceName, 6=amount, 7=hitType
 */
function buildHealMessage(opts: {
  index: number;
  offsetMilli?: number;
  caster: string;
  sourceName: string;
  target: string;
  amount: number;
  hitType?: number;
}): number[] {
  const content: number[] = [];
  
  // Field 1: EventMeta
  const meta = buildEventMeta(opts.index, opts.offsetMilli ?? 0);
  if (meta.length > 0) {
    content.push(encodeTag(1, 2));
    content.push(...encodeVarint(meta.length));
    content.push(...meta);
  }
  
  // Field 3: caster (string)
  content.push(encodeTag(3, 2));
  content.push(...encodeString(opts.caster));
  
  // Field 4: target (string) - note: different order than damage!
  content.push(encodeTag(4, 2));
  content.push(...encodeString(opts.target));
  
  // Field 5: sourceName (string)
  content.push(encodeTag(5, 2));
  content.push(...encodeString(opts.sourceName));
  
  // Field 6: amount (varint)
  content.push(encodeTag(6, 0));
  content.push(...encodeVarint(opts.amount));
  
  // Field 7: hitType (varint)
  if (opts.hitType) {
    content.push(encodeTag(7, 0));
    content.push(...encodeVarint(opts.hitType));
  }
  
  return content;
}

/**
 * Build a complete payload with header and messages for one encounter
 */
function buildEncounterPayload(
  encounterID: string,
  timestamp: bigint,
  messages: number[][]
): Uint8Array {
  // Build all messages with length prefixes
  const messageData: number[] = [];
  for (const msg of messages) {
    messageData.push(...encodeVarint(msg.length));
    messageData.push(...msg);
  }
  
  // Build header
  const header: number[] = [
    ...encodeString(encounterID),
    ...encodeVarint64(timestamp),
    ...encodeVarint(messages.length), // count
    ...encodeVarint(messageData.length), // dataLength
  ];
  
  return new Uint8Array([...header, ...messageData]);
}

/**
 * Concatenate multiple encounter payloads
 */
function concatPayloads(...payloads: Uint8Array[]): Uint8Array {
  const totalLength = payloads.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const p of payloads) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

// ============================================================================
// Peekable cursor implementation (mirrors panelWorker.ts)
// ============================================================================

type AnyReusableEvent = ReturnType<FastDamageCursor['next']> | ReturnType<FastHealCursor['next']>;

interface PeekableCursor {
  streamType: StreamType;
  cursor: FastDamageCursor | FastHealCursor;
  peeked: { event: NonNullable<AnyReusableEvent>; encounterID: string; firstTimestamp: Date } | null;
}

function peekCursor(pc: PeekableCursor): PeekableCursor['peeked'] {
  if (pc.peeked) return pc.peeked;
  
  while (pc.cursor.currentHeader && !pc.cursor.hasMoreInEncounter) {
    pc.cursor.nextEncounter();
  }
  
  if (!pc.cursor.currentHeader) return null;
  
  const event = pc.cursor.next();
  if (!event) return null;
  
  pc.peeked = {
    event,
    encounterID: pc.cursor.currentHeader.encounterID,
    firstTimestamp: pc.cursor.currentHeader.firstTimestamp,
  };
  return pc.peeked;
}

function consumePeeked(pc: PeekableCursor): void {
  pc.peeked = null;
}

/**
 * Process streams with interleaving (same logic as panelWorker.ts)
 */
function processStreamsForTest<TResult>(
  processor: PanelProcessor<TResult, ProcessorEvent>,
  streams: { type: StreamType; data: Uint8Array }[],
  context: ProcessorContext
): { result: TResult; eventOrder: Array<{ encounterID: string; index: number; type: string }> } {
  const state = processor.createState();
  const eventOrder: Array<{ encounterID: string; index: number; type: string }> = [];
  
  // Create peekable cursors
  const cursors: PeekableCursor[] = streams.map(stream => ({
    streamType: stream.type,
    cursor: stream.type === 'heal'
      ? new FastHealCursor(stream.data)
      : new FastDamageCursor(stream.data),
    peeked: null,
  }));
  
  // Process one encounter at a time
  while (true) {
    let currentEncounterID: string | null = null;
    let currentEncounterTimestamp: Date | null = null;
    
    for (const pc of cursors) {
      const peeked = peekCursor(pc);
      if (peeked && (!currentEncounterTimestamp || peeked.firstTimestamp < currentEncounterTimestamp)) {
        currentEncounterID = peeked.encounterID;
        currentEncounterTimestamp = peeked.firstTimestamp;
      }
    }
    
    if (!currentEncounterID) break;
    
    // Process all events from this encounter, interleaved by index
    while (true) {
      let minCursor: PeekableCursor | null = null;
      let minPeeked: PeekableCursor['peeked'] = null;
      
      for (const pc of cursors) {
        const peeked = peekCursor(pc);
        if (peeked && peeked.encounterID === currentEncounterID) {
          if (!minPeeked || peeked.event.index < minPeeked.event.index) {
            minCursor = pc;
            minPeeked = peeked;
          }
        }
      }
      
      if (!minCursor || !minPeeked) break;
      
      // Record the event order
      eventOrder.push({
        encounterID: minPeeked.encounterID,
        index: minPeeked.event.index,
        type: minPeeked.event.type,
      });
      
      // Process the event
      processor.processEvent(
        state,
        minPeeked.event as ProcessorEvent,
        minPeeked.encounterID,
        minPeeked.firstTimestamp,
        minCursor.streamType,
        context
      );
      
      consumePeeked(minCursor);
    }
  }
  
  return { result: state, eventOrder };
}

// ============================================================================
// Tests
// ============================================================================

describe('Stream interleaving', () => {
  const baseContext: ProcessorContext = {
    players: {
      'player1': { name: 'Player1', class: 'WARRIOR' },
      'player2': { name: 'Player2', class: 'PRIEST' },
    },
    units: {},
    selectedEncounterIds: new Set(['enc1', 'enc2']),
    entitySelection: {
      enemyIds: new Set(),
      playerIds: new Set(),
    },
  };

  // Simple processor that just counts events
  const countingProcessor: PanelProcessor<{ count: number }, ProcessorEvent> = {
    id: 'test_counter',
    streams: ['damage', 'heal'],
    createState: () => ({ count: 0 }),
    processEvent: (state) => { state.count++; },
  };

  it('interleaves damage and heal events by index within single encounter', () => {
    // Create damage events at indices 0, 2, 4
    const damagePayload = buildEncounterPayload('enc1', 1000n, [
      buildDamageMessage({ index: 0, caster: 'player1', sourceName: 'Attack', target: 'enemy', amount: 100 }),
      buildDamageMessage({ index: 2, caster: 'player1', sourceName: 'Slash', target: 'enemy', amount: 200 }),
      buildDamageMessage({ index: 4, caster: 'player1', sourceName: 'Strike', target: 'enemy', amount: 300 }),
    ]);

    // Create heal events at indices 1, 3, 5
    const healPayload = buildEncounterPayload('enc1', 1000n, [
      buildHealMessage({ index: 1, caster: 'player2', sourceName: 'Heal', target: 'player1', amount: 50 }),
      buildHealMessage({ index: 3, caster: 'player2', sourceName: 'Renew', target: 'player1', amount: 75 }),
      buildHealMessage({ index: 5, caster: 'player2', sourceName: 'Flash', target: 'player1', amount: 100 }),
    ]);

    const { eventOrder } = processStreamsForTest(
      countingProcessor,
      [
        { type: 'damage', data: damagePayload },
        { type: 'heal', data: healPayload },
      ],
      baseContext
    );

    // Events should be interleaved by index: 0, 1, 2, 3, 4, 5
    expect(eventOrder).toHaveLength(6);
    expect(eventOrder.map(e => e.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(eventOrder.map(e => e.type)).toEqual(['damage', 'heal', 'damage', 'heal', 'damage', 'heal']);
  });

  it('processes encounters in timestamp order across different streams', () => {
    // Damage stream has enc1 (timestamp 1000)
    const enc1Damage = buildEncounterPayload('enc1', 1000n, [
      buildDamageMessage({ index: 0, caster: 'player1', sourceName: 'Late', target: 'enemy', amount: 200 }),
    ]);
    
    // Heal stream has enc2 (timestamp 500 - earlier)
    const enc2Heal = buildEncounterPayload('enc2', 500n, [
      buildHealMessage({ index: 0, caster: 'player2', sourceName: 'Early', target: 'player1', amount: 100 }),
    ]);

    const { eventOrder } = processStreamsForTest(
      countingProcessor,
      [
        { type: 'damage', data: enc1Damage },
        { type: 'heal', data: enc2Heal },
      ],
      baseContext
    );

    // enc2 should be processed first (earlier timestamp)
    expect(eventOrder).toHaveLength(2);
    expect(eventOrder[0].encounterID).toBe('enc2');
    expect(eventOrder[0].type).toBe('heal');
    expect(eventOrder[1].encounterID).toBe('enc1');
    expect(eventOrder[1].type).toBe('damage');
  });

  it('handles multiple encounters with interleaved events across streams', () => {
    // Encounter 1: damage at 0, 2; heal at 1, 3
    const enc1Damage = buildEncounterPayload('enc1', 1000n, [
      buildDamageMessage({ index: 0, caster: 'player1', sourceName: 'D0', target: 'enemy', amount: 100 }),
      buildDamageMessage({ index: 2, caster: 'player1', sourceName: 'D2', target: 'enemy', amount: 200 }),
    ]);
    const enc1Heal = buildEncounterPayload('enc1', 1000n, [
      buildHealMessage({ index: 1, caster: 'player2', sourceName: 'H1', target: 'player1', amount: 50 }),
      buildHealMessage({ index: 3, caster: 'player2', sourceName: 'H3', target: 'player1', amount: 75 }),
    ]);

    // Encounter 2: damage at 0, 1; heal at 2
    const enc2Damage = buildEncounterPayload('enc2', 2000n, [
      buildDamageMessage({ index: 0, caster: 'player1', sourceName: 'D0', target: 'enemy', amount: 300 }),
      buildDamageMessage({ index: 1, caster: 'player1', sourceName: 'D1', target: 'enemy', amount: 400 }),
    ]);
    const enc2Heal = buildEncounterPayload('enc2', 2000n, [
      buildHealMessage({ index: 2, caster: 'player2', sourceName: 'H2', target: 'player1', amount: 100 }),
    ]);

    const damagePayload = concatPayloads(enc1Damage, enc2Damage);
    const healPayload = concatPayloads(enc1Heal, enc2Heal);

    const { eventOrder } = processStreamsForTest(
      countingProcessor,
      [
        { type: 'damage', data: damagePayload },
        { type: 'heal', data: healPayload },
      ],
      baseContext
    );

    // Should process enc1 fully, then enc2 fully
    expect(eventOrder).toHaveLength(7);
    
    // enc1: indices 0, 1, 2, 3
    expect(eventOrder.slice(0, 4).map(e => e.encounterID)).toEqual(['enc1', 'enc1', 'enc1', 'enc1']);
    expect(eventOrder.slice(0, 4).map(e => e.index)).toEqual([0, 1, 2, 3]);
    expect(eventOrder.slice(0, 4).map(e => e.type)).toEqual(['damage', 'heal', 'damage', 'heal']);
    
    // enc2: indices 0, 1, 2
    expect(eventOrder.slice(4).map(e => e.encounterID)).toEqual(['enc2', 'enc2', 'enc2']);
    expect(eventOrder.slice(4).map(e => e.index)).toEqual([0, 1, 2]);
    expect(eventOrder.slice(4).map(e => e.type)).toEqual(['damage', 'damage', 'heal']);
  });

  it('handles encounter with only one stream type', () => {
    // Only damage events
    const damagePayload = buildEncounterPayload('enc1', 1000n, [
      buildDamageMessage({ index: 0, caster: 'player1', sourceName: 'A', target: 'enemy', amount: 100 }),
      buildDamageMessage({ index: 1, caster: 'player1', sourceName: 'B', target: 'enemy', amount: 200 }),
    ]);

    // Empty heal stream (just no encounters)
    const healPayload = new Uint8Array(0);

    const { eventOrder } = processStreamsForTest(
      countingProcessor,
      [
        { type: 'damage', data: damagePayload },
        { type: 'heal', data: healPayload },
      ],
      baseContext
    );

    expect(eventOrder).toHaveLength(2);
    expect(eventOrder.map(e => e.type)).toEqual(['damage', 'damage']);
  });

  it('handles same index in different streams (stable ordering)', () => {
    // Both streams have event at index 0
    const damagePayload = buildEncounterPayload('enc1', 1000n, [
      buildDamageMessage({ index: 0, caster: 'player1', sourceName: 'Attack', target: 'enemy', amount: 100 }),
    ]);
    const healPayload = buildEncounterPayload('enc1', 1000n, [
      buildHealMessage({ index: 0, caster: 'player2', sourceName: 'Heal', target: 'player1', amount: 50 }),
    ]);

    const { eventOrder } = processStreamsForTest(
      countingProcessor,
      [
        { type: 'damage', data: damagePayload },
        { type: 'heal', data: healPayload },
      ],
      baseContext
    );

    // Both events should be processed (order depends on cursor iteration order)
    expect(eventOrder).toHaveLength(2);
    expect(eventOrder.every(e => e.index === 0)).toBe(true);
  });

  it('correctly decodes damage message fields', () => {
    const damagePayload = buildEncounterPayload('enc1', 1000n, [
      buildDamageMessage({
        index: 42,
        offsetMilli: 5000,
        caster: 'player1',
        sourceName: 'Mortal Strike',
        target: 'boss',
        amount: 1234,
        hitType: 2,
        schools: [1],
      }),
    ]);

    const cursor = new FastDamageCursor(damagePayload);
    expect(cursor.currentHeader?.encounterID).toBe('enc1');
    expect(cursor.currentHeader?.count).toBe(1);

    const event = cursor.next();
    expect(event).not.toBeNull();
    expect(event!.index).toBe(42);
    expect(event!.offsetMilli).toBe(5000);
    expect(event!.caster).toBe('player1');
    expect(event!.sourceName).toBe('Mortal Strike');
    expect(event!.target).toBe('boss');
    expect(event!.amount).toBe(1234);
    expect(event!.hitType).toBe(2);
    expect(event!.schools).toEqual([1]);
  });

  it('correctly decodes heal message fields', () => {
    const healPayload = buildEncounterPayload('enc1', 1000n, [
      buildHealMessage({
        index: 99,
        offsetMilli: 3000,
        caster: 'healer',
        sourceName: 'Greater Heal',
        target: 'tank',
        amount: 5000,
        hitType: 1,
      }),
    ]);

    const cursor = new FastHealCursor(healPayload);
    expect(cursor.currentHeader?.encounterID).toBe('enc1');
    expect(cursor.currentHeader?.count).toBe(1);

    const event = cursor.next();
    expect(event).not.toBeNull();
    expect(event!.index).toBe(99);
    expect(event!.offsetMilli).toBe(3000);
    expect(event!.caster).toBe('healer');
    expect(event!.sourceName).toBe('Greater Heal');
    expect(event!.target).toBe('tank');
    expect(event!.amount).toBe(5000);
    expect(event!.hitType).toBe(1);
  });
});
