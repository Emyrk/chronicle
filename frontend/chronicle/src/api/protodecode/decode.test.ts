import { create, toBinary } from '@bufbuild/protobuf';
import { EventMetaSchema, ResurrectionSchema, SpellDataSchema } from '@/api/proto/chronicle_pb';
import { describe, it, expect } from 'vitest';
import { AuraDecoder, FastResurrectionCursor, readVarint, readVarint64, parseAllHeaders } from './decode';

describe('readVarint', () => {
  it('reads single-byte varints', () => {
    // Values 0-127 fit in a single byte
    const data = new Uint8Array([0x00]); // 0
    expect(readVarint(data, 0)).toEqual({ value: 0, bytesRead: 1 });

    const data2 = new Uint8Array([0x01]); // 1
    expect(readVarint(data2, 0)).toEqual({ value: 1, bytesRead: 1 });

    const data3 = new Uint8Array([0x7f]); // 127
    expect(readVarint(data3, 0)).toEqual({ value: 127, bytesRead: 1 });
  });

  it('reads multi-byte varints', () => {
    // 128 = 0x80 = 10000000 in binary
    // As varint: 0x80 0x01 (continuation bit set on first byte)
    const data = new Uint8Array([0x80, 0x01]); // 128
    expect(readVarint(data, 0)).toEqual({ value: 128, bytesRead: 2 });

    // 300 = 0x12c = 100101100 in binary
    // As varint: 0xac 0x02
    const data2 = new Uint8Array([0xac, 0x02]); // 300
    expect(readVarint(data2, 0)).toEqual({ value: 300, bytesRead: 2 });

    // 16384 = 0x4000
    // As varint: 0x80 0x80 0x01
    const data3 = new Uint8Array([0x80, 0x80, 0x01]); // 16384
    expect(readVarint(data3, 0)).toEqual({ value: 16384, bytesRead: 3 });
  });

  it('reads varint at offset', () => {
    const data = new Uint8Array([0xff, 0xff, 0x7f]); // padding, then 127
    expect(readVarint(data, 2)).toEqual({ value: 127, bytesRead: 1 });
  });

  it('throws on truncated varint', () => {
    // Continuation bit set but no more bytes
    const data = new Uint8Array([0x80]);
    expect(() => readVarint(data, 0)).toThrow('Unexpected end of data');
  });

  it('throws on varint too long for 32-bit', () => {
    // More than 5 bytes with continuation bits
    const data = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80]);
    expect(() => readVarint(data, 0)).toThrow('Varint too long');
  });
});

describe('readVarint64', () => {
  it('reads 64-bit varints', () => {
    // Small values work the same
    const data = new Uint8Array([0x01]);
    expect(readVarint64(data, 0)).toEqual({ value: 1n, bytesRead: 1 });

    // Large value: Unix timestamp in milliseconds (e.g., 1706000000000)
    // This is larger than 32-bit max
    // 1706000000000 = 0x18D4A50D800
    // As varint: 0x80 0xb0 0x94 0xa8 0x8d 0x63
    const timestampMs = 1706000000000n;
    const varintBytes = encodeVarint64(timestampMs);
    const result = readVarint64(new Uint8Array(varintBytes), 0);
    expect(result.value).toBe(timestampMs);
  });

  it('throws on varint too long for 64-bit', () => {
    // More than 10 bytes with continuation bits
    const data = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]);
    expect(() => readVarint64(data, 0)).toThrow('Varint too long');
  });
});

describe('FastResurrectionCursor', () => {
  it('decodes source, target, and spell', () => {
    const message = create(ResurrectionSchema, {
      meta: create(EventMetaSchema, { index: 12, offsetMilli: 3456n }),
      source: '0xSOURCE',
      target: '0xTARGET',
      spell: create(SpellDataSchema, { id: 48949, name: 'Redemption' }),
    });
    const encoded = toBinary(ResurrectionSchema, message);
    const messageData = new Uint8Array([...encodeVarint(encoded.length), ...encoded]);
    const payload = buildPayload('encounter', 1706000000000n, 1, messageData.length, messageData);

    const cursor = new FastResurrectionCursor(payload);
    const decoded = cursor.next();

    expect(decoded).toMatchObject({
      type: 'ressurection',
      index: 12,
      offsetMilli: 3456,
      source: '0xSOURCE',
      target: '0xTARGET',
      spell: { id: 48949, name: 'Redemption' },
    });
  });
});

describe('AuraDecoder synthetic metadata', () => {
  it('decodes and resets EventMeta.is_synthetic', () => {
    const decoder = new AuraDecoder();
    const syntheticAura = new Uint8Array([0x0a, 0x02, 0x20, 0x01]);
    expect(decoder.decode(syntheticAura, 0, syntheticAura.length).isSynthetic).toBe(true);

    const emptyAura = new Uint8Array([]);
    expect(decoder.decode(emptyAura, 0, emptyAura.length).isSynthetic).toBe(false);
  });
});

describe('parseAllHeaders', () => {
  it('parses empty data', () => {
    const data = new Uint8Array([]);
    const headers = parseAllHeaders(data);
    expect(headers).toEqual([]);
  });

  it('parses single encounter header', () => {
    // Build a minimal valid payload:
    // - encounterID: "enc1" (length 4)
    // - timestamp: 1706000000000
    // - count: 0
    // - dataLength: 0
    const encounterID = "enc1";
    const timestamp = 1706000000000n;
    const count = 0;
    const dataLength = 0;

    const data = buildPayload(encounterID, timestamp, count, dataLength, new Uint8Array(0));
    const headers = parseAllHeaders(data);

    expect(headers).toHaveLength(1);
    expect(headers[0].encounterID).toBe(encounterID);
    expect(headers[0].count).toBe(count);
    expect(headers[0].dataLength).toBe(dataLength);
  });

  it('parses multiple encounter headers', () => {
    const enc1 = buildPayload("encounter-1", 1706000000000n, 5, 100, new Uint8Array(100));
    const enc2 = buildPayload("encounter-2", 1706001000000n, 10, 200, new Uint8Array(200));

    const combined = new Uint8Array(enc1.length + enc2.length);
    combined.set(enc1, 0);
    combined.set(enc2, enc1.length);

    const headers = parseAllHeaders(combined);

    expect(headers).toHaveLength(2);
    expect(headers[0].encounterID).toBe("encounter-1");
    expect(headers[0].count).toBe(5);
    expect(headers[0].dataLength).toBe(100);
    expect(headers[1].encounterID).toBe("encounter-2");
    expect(headers[1].count).toBe(10);
    expect(headers[1].dataLength).toBe(200);
  });
});

// Helper: encode a bigint as a varint
function encodeVarint64(value: bigint): number[] {
  const bytes: number[] = [];
  while (value > 0x7fn) {
    bytes.push(Number(value & 0x7fn) | 0x80);
    value >>= 7n;
  }
  bytes.push(Number(value));
  return bytes;
}

// Helper: encode a number as a varint
function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return bytes;
}

// Helper: build a payload with header
function buildPayload(
  encounterID: string,
  timestamp: bigint,
  count: number,
  dataLength: number,
  messageData: Uint8Array
): Uint8Array {
  const encoder = new TextEncoder();
  const encBytes = encoder.encode(encounterID);

  const parts: number[] = [
    ...encodeVarint(encBytes.length),
    ...encBytes,
    ...encodeVarint64(timestamp),
    ...encodeVarint(count),
    ...encodeVarint(dataLength),
  ];

  const result = new Uint8Array(parts.length + messageData.length);
  result.set(parts, 0);
  result.set(messageData, parts.length);
  return result;
}
