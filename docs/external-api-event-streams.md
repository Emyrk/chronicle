# Decoding external API event streams

Chronicle exposes each event category for a raid instance as a binary stream:

```text
GET /api/external/v1/raidlogs/instances/{slug}/events/{type}
```

For example:

```bash
curl --fail \
  --output damage.events.gz \
  "http://localhost:4000/api/external/v1/raidlogs/instances/example-instance/events/damage"
```

The response has `Content-Type: application/octet-stream`. Its body is a gzip-compressed Chronicle event stream. It is **not** one protobuf message: after gzip decompression, the payload contains one custom-framed block per encounter, and each block contains length-delimited protobuf messages.

## Encoding layers

Decode the response in this order:

1. Read the HTTP body as bytes.
2. Gzip-decompress the entire body.
3. Read encounter frames until the decompressed input reaches EOF.
4. For each frame, read its header and bounded message body.
5. Read `count` length-delimited protobuf messages from that body.
6. Decode every message with the protobuf type associated with the URL's `{type}`.

```text
HTTP body
└── gzip
    └── encounter frame 1
        ├── frame header
        └── length-delimited protobuf messages
    └── encounter frame 2
        ├── frame header
        └── length-delimited protobuf messages
    └── ...
```

The gzip bytes are returned directly. Chronicle does not currently set `Content-Encoding: gzip`, so clients should not assume their HTTP library will decompress the body automatically. The gzip magic bytes are `1f 8b`.

## Encounter frame format

All integers in the framing layer are standard unsigned protobuf varints. Strings and protobuf messages are length-delimited with a varint byte length.

Each encounter frame is encoded as follows:

| Order | Field | Encoding | Meaning |
| --- | --- | --- | --- |
| 1 | `encounter_id_length` | unsigned varint | UTF-8 byte length of `encounter_id` |
| 2 | `encounter_id` | UTF-8 bytes | Encounter UUID as a string |
| 3 | `first_timestamp_ms` | unsigned varint | Unix timestamp in milliseconds used as the frame's time origin |
| 4 | `count` | unsigned varint | Number of protobuf messages in the frame |
| 5 | `data_length` | unsigned varint | Total byte length of the frame's message body |
| 6 | `data` | exactly `data_length` bytes | `count` length-delimited protobuf messages |

The message body repeats this structure `count` times:

| Order | Field | Encoding |
| --- | --- | --- |
| 1 | `message_length` | unsigned varint |
| 2 | `message` | exactly `message_length` protobuf bytes |

`data_length` is the authoritative boundary for the frame. A decoder should reject a frame if its messages run past that boundary, if fewer than `count` messages are present, or if unconsumed bytes remain inside the frame after reading `count` messages.

Chronicle appends encounter frames directly with no separator. Advance by the header size plus `data_length`, then parse the next frame. A stream can contain frames whose `count` and `data_length` are both zero. For an empty frame, `first_timestamp_ms` may be zero.

## Protobuf schema

The schema source of truth is:

```text
api/chronicleproto/chronicle.proto
```

Chronicle's generated bindings are:

```text
api/chronicleproto/chronicle.pb.go
frontend/chronicle/src/api/proto/chronicle_pb.ts
```

External clients can copy `chronicle.proto` and generate bindings with their normal protobuf toolchain. For example:

```bash
protoc --python_out=. chronicle.proto
```

or, from a Chronicle checkout:

```bash
cd api/chronicleproto
buf generate
```

Each endpoint returns only one protobuf message type. Use this mapping:

| Stream `{type}` | Protobuf message |
| --- | --- |
| `damage` | `chronicleproto.Damage` |
| `heal` | `chronicleproto.Heal` |
| `resource_change` | `chronicleproto.ResourceChange` |
| `extra_attack` | `chronicleproto.ExtraAttack` |
| `slain` | `chronicleproto.Slain` |
| `ressurection` | `chronicleproto.Resurrection` |
| `cast` | `chronicleproto.Cast` (deprecated; use `spell_go`) |
| `aura` | `chronicleproto.Aura` |
| `spell_go` | `chronicleproto.SpellGo` |
| `aura_cast` | `chronicleproto.AuraCast` |
| `spell_start` | `chronicleproto.SpellStart` |
| `spell_fail` | `chronicleproto.SpellFail` |
| `unit_classification` | `chronicleproto.UnitClassification` |
| `combatant_info` | `chronicleproto.CombatantInfo` |
| `dispel` | `chronicleproto.Dispel` |
| `interrupt` | `chronicleproto.Interrupt` |
| `absorbed` | `chronicleproto.Absorbed` |
| `companion_stats` | `chronicleproto.CompanionStats` |
| `consume` | `chronicleproto.Consume` |

> **Compatibility note:** `ressurection` is intentionally listed with the existing misspelling in the API stream name. The protobuf message itself is correctly named `Resurrection`.

`cast` is deprecated and retained only for compatibility with older logs. New integrations should use `spell_go` for completed casts. Use `spell_start` when cast-start or channel timing is needed, and `spell_fail` for failed casts.

## Event timestamps and ordering

Every event message has an `EventMeta` field:

```proto
message EventMeta {
  int32 index = 1;
  int64 offsetMilli = 2;
  repeated ActivityEntry activity = 3;
  bool is_synthetic = 4;
}
```

Reconstruct an event's timestamp with:

```text
event_timestamp_ms = frame.first_timestamp_ms + event.meta.offsetMilli
```

`EventMeta.index` is the event's parse-order index within the encounter. It is shared across stream types, so it can be used as a stable tie-breaker when events from multiple streams have the same timestamp.

`EventMeta.activity` contains optional unit-activity annotations such as `start`, `end`, `slain`, or `bump`. These annotations may be absent depending on parser configuration. `EventMeta.is_synthetic` indicates that Chronicle inferred or projected the event rather than reading it directly from the source combat log.

## TypeScript example

This example uses Node's gzip support and Buf's protobuf runtime. Generate `chronicle_pb.ts` from `chronicle.proto`, then select the schema matching the requested stream type.

```ts
import { gunzipSync } from "node:zlib";
import {
  type DescMessage,
  type MessageShape,
  fromBinary,
} from "@bufbuild/protobuf";
import { DamageSchema } from "./gen/chronicle_pb.js";

type Cursor = { data: Uint8Array; offset: number };

type EncounterFrame<T> = {
  encounterId: string;
  firstTimestampMs: bigint;
  messages: T[];
};

function readUVarint(cursor: Cursor): bigint {
  let value = 0n;
  let shift = 0n;

  for (let bytesRead = 0; bytesRead < 10; bytesRead++) {
    if (cursor.offset >= cursor.data.length) {
      throw new Error("unexpected EOF while reading varint");
    }
    const byte = cursor.data[cursor.offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7n;
  }

  throw new Error("varint is longer than 10 bytes");
}

function readLength(cursor: Cursor): number {
  const value = readUVarint(cursor);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("length exceeds JavaScript's safe integer range");
  }
  return Number(value);
}

function readBytes(cursor: Cursor, length: number): Uint8Array {
  const end = cursor.offset + length;
  if (end > cursor.data.length) throw new Error("unexpected EOF");
  const value = cursor.data.subarray(cursor.offset, end);
  cursor.offset = end;
  return value;
}

function decodeEventStream<T extends DescMessage>(
  compressed: Uint8Array,
  schema: T,
): EncounterFrame<MessageShape<T>>[] {
  const data = new Uint8Array(gunzipSync(compressed));
  const cursor: Cursor = { data, offset: 0 };
  const decoder = new TextDecoder();
  const frames: EncounterFrame<MessageShape<T>>[] = [];

  while (cursor.offset < data.length) {
    const encounterId = decoder.decode(readBytes(cursor, readLength(cursor)));
    const firstTimestampMs = readUVarint(cursor);
    const count = readLength(cursor);
    const dataLength = readLength(cursor);
    const bodyEnd = cursor.offset + dataLength;

    if (bodyEnd > data.length) throw new Error("frame body exceeds stream");

    const messages: MessageShape<T>[] = [];
    for (let i = 0; i < count; i++) {
      const messageBytes = readBytes(cursor, readLength(cursor));
      if (cursor.offset > bodyEnd) throw new Error("message exceeds frame body");
      messages.push(fromBinary(schema, messageBytes));
    }

    if (cursor.offset !== bodyEnd) {
      throw new Error("message count and frame data_length disagree");
    }

    frames.push({ encounterId, firstTimestampMs, messages });
  }

  return frames;
}

const response = await fetch(
  "https://chronicleclassic.com/api/external/v1/raidlogs/instances/INSTANCE_SLUG/events/damage",
);
if (!response.ok) throw new Error(`HTTP ${response.status}`);

const frames = decodeEventStream(
  new Uint8Array(await response.arrayBuffer()),
  DamageSchema,
);

for (const frame of frames) {
  for (const damage of frame.messages) {
    const timestampMs =
      frame.firstTimestampMs + (damage.meta?.offsetMilli ?? 0n);

    console.log({
      encounterId: frame.encounterId,
      timestamp: new Date(Number(timestampMs)),
      caster: damage.caster,
      target: damage.target,
      amount: damage.amount,
      ability: damage.sourceName,
      index: damage.meta?.index,
    });
  }
}
```

Chronicle's frontend contains a production decoder and zero-allocation cursors at:

```text
frontend/chronicle/src/api/protodecode/decode.ts
```

The generic helpers `decodeAllPayloads`, `decodeDelimitedMessages`, `parseAllHeaders`, `readVarint`, and `readVarint64` are useful references.

## Language-independent decoding pseudocode

```text
compressed = HTTP_GET(endpoint)
stream = GZIP_DECOMPRESS(compressed)
offset = 0

while offset < len(stream):
    encounter_id_length = READ_UVARINT(stream, offset)
    encounter_id = READ_UTF8(stream, encounter_id_length)
    first_timestamp_ms = READ_UVARINT(stream, offset)
    count = READ_UVARINT(stream, offset)
    data_length = READ_UVARINT(stream, offset)
    body_end = offset + data_length

    repeat count times:
        message_length = READ_UVARINT(stream, offset)
        message_bytes = READ_BYTES(stream, message_length)
        event = PROTOBUF_DECODE(message_bytes, schema_for_stream_type)
        event_timestamp_ms = first_timestamp_ms + event.meta.offsetMilli

    assert offset == body_end

assert offset == len(stream)
```

## Error behavior and compatibility

- An invalid stream type returns HTTP `400` with a JSON error.
- An unknown instance slug returns HTTP `404`.
- A stream unavailable for an instance returns HTTP `404`. This can occur for older instances parsed before a stream type existed.
- A successful response is binary even when the decompressed stream has no messages.
- Clients should ignore unknown protobuf fields, as required by normal protobuf forward-compatibility rules.
- Clients should use `data_length` to skip or isolate an encounter without decoding every message.
- Do not treat the decompressed response as a single protobuf object or pass the complete decompressed body directly to a protobuf decoder.
