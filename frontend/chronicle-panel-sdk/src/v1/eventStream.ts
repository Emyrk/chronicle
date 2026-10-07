import { fromBinary, type DescMessage, type MessageShape } from "@bufbuild/protobuf";

export interface EncounterPayload<T> {
  encounterId: string;
  firstTimestampMs: number;
  events: T[];
}

const decoder = new TextDecoder();

export function readVarint(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  for (let i = 0; i < 10; i += 1) {
    const byte = data[offset + i];
    if (byte === undefined) throw new Error("Unexpected end of varint");
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, bytesRead: i + 1 };
    shift += 7;
  }
  throw new Error("Varint exceeds 10 bytes");
}

export function decodeEncounterPayloads<T extends DescMessage>(
  schema: T,
  buffer: ArrayBuffer,
): EncounterPayload<MessageShape<T>>[] {
  const data = new Uint8Array(buffer);
  const payloads: EncounterPayload<MessageShape<T>>[] = [];
  let offset = 0;

  while (offset < data.length) {
    const stringLength = readVarint(data, offset);
    offset += stringLength.bytesRead;
    const encounterId = decoder.decode(data.subarray(offset, offset + stringLength.value));
    offset += stringLength.value;

    const timestamp = readVarint(data, offset);
    offset += timestamp.bytesRead;
    const count = readVarint(data, offset);
    offset += count.bytesRead;
    const dataLength = readVarint(data, offset);
    offset += dataLength.bytesRead;
    const payloadEnd = offset + dataLength.value;
    if (payloadEnd > data.length) throw new Error("Encounter payload exceeds stream length");

    const events: MessageShape<T>[] = [];
    for (let index = 0; index < count.value; index += 1) {
      const messageLength = readVarint(data, offset);
      offset += messageLength.bytesRead;
      const messageEnd = offset + messageLength.value;
      if (messageEnd > payloadEnd) throw new Error("Message exceeds encounter payload length");
      events.push(fromBinary(schema, data.subarray(offset, messageEnd)));
      offset = messageEnd;
    }

    offset = payloadEnd;
    payloads.push({ encounterId, firstTimestampMs: timestamp.value, events });
  }

  return payloads;
}
