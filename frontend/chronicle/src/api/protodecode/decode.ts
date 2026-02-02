import { type MessageShape, type DescMessage, fromBinary } from "@bufbuild/protobuf";

// Shared TextDecoder instance - TextDecoder is stateless and thread-safe
const sharedTextDecoder = new TextDecoder();

/**
 * Header information from a Builder-encoded payload
 */
export interface PayloadHeader {
  encounterID: string;
  firstTimestamp: Date;
  count: number;
  dataLength: number;
}

/**
 * Result from decoding a full payload with header
 */
export interface DecodedPayload<T> {
  header: PayloadHeader;
  messages: T[];
}

/**
 * Decompresses gzip data using the native DecompressionStream API.
 */
export async function decompressGzip(data: Uint8Array<ArrayBufferLike>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  const decompressedStream = stream.pipeThrough(new DecompressionStream("gzip"));
  const reader = decompressedStream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Checks if data appears to be gzip compressed (magic bytes 0x1f 0x8b).
 */
export function isGzipped(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

/**
 * Decodes a full payload with header + length-delimited messages.
 * 
 * Header format (from Go Builder.Finalize):
 *   - EncodeStringBytes(encounterID) - varint length + string bytes
 *   - EncodeVarint(firstTimestamp.UnixMilli())
 *   - EncodeVarint(count)
 * 
 * Then concatenated length-delimited messages from AddToBuilder.
 */
export function decodePayload<T extends DescMessage>(
  schema: T,
  data: Uint8Array
): DecodedPayload<MessageShape<T>> {
  let offset = 0;

  // Read encounterID (length-prefixed string)
  const { value: strLen, bytesRead: strLenBytes } = readVarint(data, offset);
  offset += strLenBytes;
  const encounterID = sharedTextDecoder.decode(data.subarray(offset, offset + strLen));
  offset += strLen;

  // Read firstTimestamp (varint, milliseconds since epoch)
  const { value: timestampMs, bytesRead: tsBytes } = readVarint64(data, offset);
  offset += tsBytes;
  // Handle potentially invalid timestamps (very large values indicate encoding issues)
  // timestamp=0 is valid for empty encounters
  const tsNumber = Number(timestampMs);
  const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER 
    ? new Date(tsNumber) 
    : new Date(NaN);

  // Read count (varint)
  const { value: count, bytesRead: countBytes } = readVarint(data, offset);
  offset += countBytes;

  // Read dataLength (varint) - expected bytes of message data
  const { value: dataLength, bytesRead: dataLenBytes } = readVarint(data, offset);
  offset += dataLenBytes;

  // Decode the messages, respecting the count from the header
  const messages = decodeDelimitedMessages(schema, data.subarray(offset), count);

  return {
    header: {
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    },
    messages,
  };
}

/**
 * Decodes ALL encounters from a payload with multiple concatenated encounter payloads.
 * Returns an array of {header, messages} for each encounter.
 */
export function decodeAllPayloads<T extends DescMessage>(
  schema: T,
  data: Uint8Array
): DecodedPayload<MessageShape<T>>[] {
  const results: DecodedPayload<MessageShape<T>>[] = [];
  let offset = 0;

  while (offset < data.length) {
    // Read encounterID (length-prefixed string)
    const { value: strLen, bytesRead: strLenBytes } = readVarint(data, offset);
    offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(data.subarray(offset, offset + strLen));
    offset += strLen;

    // Read firstTimestamp (varint, milliseconds since epoch)
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(data, offset);
    offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER 
      ? new Date(tsNumber) 
      : new Date(NaN);

    // Read count (varint)
    const { value: count, bytesRead: countBytes } = readVarint(data, offset);
    offset += countBytes;

    // Read dataLength (varint)
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(data, offset);
    offset += dataLenBytes;

    // Decode messages for this encounter
    const messages = count > 0 
      ? decodeDelimitedMessages(schema, data.subarray(offset, offset + dataLength), count)
      : [];

    results.push({
      header: {
        encounterID,
        firstTimestamp,
        count,
        dataLength,
      },
      messages,
    });

    offset += dataLength;
  }

  return results;
}

/**
 * Decodes a length-delimited stream of protobuf messages (no header).
 * 
 * This matches the Go encoding from proto.Buffer.EncodeMessage(),
 * which writes each message as: varint(length) + message_bytes
 */
export function decodeDelimitedMessages<T extends DescMessage>(
  schema: T,
  data: Uint8Array,
  maxCount?: number
): MessageShape<T>[] {
  const messages: MessageShape<T>[] = [];
  let offset = 0;
  let msgIndex = 0;

  while (offset < data.length && (maxCount === undefined || msgIndex < maxCount)) {
    // Read varint length prefix
    const { value: length, bytesRead } = readVarint(data, offset);
    offset += bytesRead;

    if (offset + length > data.length) {
      throw new Error(
        `Invalid length-delimited message: expected ${length} bytes at offset ${offset}, but only ${data.length - offset} remaining`
      );
    }

    // Extract message bytes and decode
    const messageBytes = data.subarray(offset, offset + length);
    
    try {
      const message = fromBinary(schema, messageBytes);
      messages.push(message);
    } catch (e) {
      throw new Error(`Failed at message ${msgIndex}, offset ${offset - bytesRead}, length ${length}: ${e}`);
    }

    offset += length;
    msgIndex++;
  }

  return messages;
}

// ============================================================================
// Zero-allocation Damage decoder
// ============================================================================

/**
 * A tailer (trailer) damage entry - additional damage that occurred alongside the main hit.
 * Examples: Seal of Righteousness proc, Fiery Weapon enchant, etc.
 */
export interface ReusableTailer {
  amount: number;
  hitType: number;
}

/**
 * Reusable Damage message structure - mutated in place during decoding.
 * If the callback needs to keep data, it must copy what it needs.
 */
export interface ReusableDamage {
  type: "damage";
  index: number;
  offsetMilli: number;  // Use number instead of bigint for speed
  caster: string;
  sourceName: string;
  target: string;
  hitType: number;
  amount: number;
  school: number;
  tailers: ReusableTailer[];
  tailerCount: number;  // Actual number of tailers (tailers array may have extra capacity)
}

/**
 * A zero-allocation decoder for Damage messages.
 * Reuses a single object, mutating it for each decode.
 */
export class DamageDecoder {
  // Use shared TextDecoder for better memory efficiency
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableDamage = {
    type: "damage",
    index: 0,
    offsetMilli: 0,
    caster: "",
    sourceName: "",
    target: "",
    hitType: 0,
    amount: 0,
    school: 0,
    tailers: [],
    tailerCount: 0,
  };
  
  /**
   * Decode a Damage message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableDamage {
    const end = offset + length;
    const msg = this.message;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.caster = "";
    msg.sourceName = "";
    msg.target = "";
    msg.hitType = 0;
    msg.amount = 0;
    msg.school = 0;
    msg.tailerCount = 0;
    
    while (offset < end) {
      const tag = data[offset++];
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;
      
      if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 6) msg.hitType = value;
        else if (fieldNumber === 7) msg.amount = value;
        else if (fieldNumber === 8) msg.school = value;
      } else if (wireType === 2) {
        // Length-delimited
        const { value: len, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 1) {
          // EventMeta - decode nested
          const metaEnd = offset + len;
          while (offset < metaEnd) {
            const metaTag = data[offset++];
            const metaField = metaTag >> 3;
            const metaWire = metaTag & 0x7;
            
            if (metaWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (metaField === 1) msg.index = value;
              else if (metaField === 2) msg.offsetMilli = value;
            }
          }
        } else if (fieldNumber === 3) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 4) {
          msg.sourceName = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 5) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 9) {
          // Tailer - decode nested message
          // Reuse or grow the tailers array as needed
          if (msg.tailerCount >= msg.tailers.length) {
            msg.tailers.push({ amount: 0, hitType: 0 });
          }
          const tailer = msg.tailers[msg.tailerCount];
          tailer.amount = 0;
          tailer.hitType = 0;
          
          const tailerEnd = offset + len;
          while (offset < tailerEnd) {
            const tailerTag = data[offset++];
            const tailerField = tailerTag >> 3;
            const tailerWire = tailerTag & 0x7;
            
            if (tailerWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (tailerField === 1) tailer.amount = value;
              else if (tailerField === 2) tailer.hitType = value;
            }
          }
          msg.tailerCount++;
        } else {
          offset += len;
        }
      }
    }
    
    return msg;
  }
}

/**
 * Reusable Heal message object (same shape as Damage for ProcessorEvent compatibility)
 */
export interface ReusableHeal {
  type: "heal";
  index: number;
  offsetMilli: number;
  caster: string;
  sourceName: string;
  target: string;
  hitType: number;
  amount: number;
  school: number; // Always 0 for heals, but kept for interface compat
}

/**
 * Zero-allocation Heal decoder.
 * 
 * Heal proto field numbers:
 *   1: meta (EventMeta)
 *   3: caster (string)
 *   4: target (string)      <-- different from Damage!
 *   5: sourceName (string)  <-- different from Damage!
 *   6: amount (int32)
 *   7: hitType (uint32)
 */
export class HealDecoder {
  // Use shared TextDecoder for better memory efficiency
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableHeal = {
    type: "heal",
    index: 0,
    offsetMilli: 0,
    caster: "",
    sourceName: "",
    target: "",
    hitType: 0,
    amount: 0,
    school: 0,
  };
  
  /**
   * Decode a Heal message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableHeal {
    const end = offset + length;
    const msg = this.message;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.caster = "";
    msg.sourceName = "";
    msg.target = "";
    msg.hitType = 0;
    msg.amount = 0;
    msg.school = 0;
    
    while (offset < end) {
      const tag = data[offset++];
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;
      
      if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 6) msg.amount = value;
        else if (fieldNumber === 7) msg.hitType = value;
      } else if (wireType === 2) {
        // Length-delimited
        const { value: len, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 1) {
          // EventMeta - decode nested
          const metaEnd = offset + len;
          while (offset < metaEnd) {
            const metaTag = data[offset++];
            const metaField = metaTag >> 3;
            const metaWire = metaTag & 0x7;
            
            if (metaWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (metaField === 1) msg.index = value;
              else if (metaField === 2) msg.offsetMilli = value;
            }
          }
        } else if (fieldNumber === 3) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 4) {
          // Heal field 4 = target (different from Damage!)
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 5) {
          // Heal field 5 = sourceName (different from Damage!)
          msg.sourceName = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else {
          offset += len;
        }
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for Heal events with zero-allocation decoding.
 * Same API as FastDamageCursor but uses HealDecoder.
 */
export class FastHealCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new HealDecoder();
  private offset: number = 0;
  
  private _currentHeader: PayloadHeader | null = null;
  private _messagesReadInEncounter: number = 0;
  private _bytesProcessed: number = 0;
  
  constructor(data: Uint8Array) {
    this.data = data;
    this._loadNextEncounterHeader();
  }
  
  get currentHeader(): PayloadHeader | null {
    return this._currentHeader;
  }
  
  get hasMoreInEncounter(): boolean {
    if (!this._currentHeader) return false;
    return this._messagesReadInEncounter < this._currentHeader.count;
  }
  
  get bytesProcessed(): number {
    return this._bytesProcessed;
  }
  
  get bytesTotal(): number {
    return this.data.length;
  }
  
  /**
   * Read the next message, returning the reusable message object.
   * Returns null if no more messages in current encounter.
   * WARNING: The returned object is reused - copy data if needed!
   */
  next(): ReusableHeal | null {
    if (!this.hasMoreInEncounter) return null;
    
    // Read length prefix
    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;
    
    // Decode into reusable message
    const msg = this.decoder.decode(this.data, msgStart, length);
    
    // Advance
    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;
    
    return msg;
  }
  
  /**
   * Move to the next encounter.
   */
  nextEncounter(): boolean {
    // Skip remaining messages in current encounter
    while (this.hasMoreInEncounter) {
      this.next();
    }
    return this._loadNextEncounterHeader();
  }
  
  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    
    const startOffset = this.offset;
    
    // Read encounterID
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;
    
    // Read timestamp
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER 
      ? new Date(tsNumber) 
      : new Date(NaN);
    
    // Read count
    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;
    
    // Read dataLength
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(this.data, this.offset);
    this.offset += dataLenBytes;
    
    this._currentHeader = {
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    };
    
    this._messagesReadInEncounter = 0;
    this._bytesProcessed += (this.offset - startOffset);
    
    return true;
  }
}

/**
 * Reusable ResourceChange message object
 */
export interface ReusableResourceChange {
  type: "resource_change";
  index: number;
  offsetMilli: number;
  caster: string;
  sourceName: string;
  target: string;
  amount: number;
  resourceType: string;
  direction: string;
}

/**
 * Zero-allocation ResourceChange decoder.
 * 
 * ResourceChange proto field numbers:
 *   1: meta (EventMeta)
 *   3: target (string)
 *   4: amount (int32)
 *   5: resourceType (string)
 *   6: caster (optional string)
 *   7: sourceName (optional string)
 *   8: direction (string)
 */
export class ResourceChangeDecoder {
  // Use shared TextDecoder for better memory efficiency
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableResourceChange = {
    type: "resource_change",
    index: 0,
    offsetMilli: 0,
    caster: "",
    sourceName: "",
    target: "",
    amount: 0,
    resourceType: "",
    direction: "",
  };
  
  /**
   * Decode a ResourceChange message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableResourceChange {
    const end = offset + length;
    const msg = this.message;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.caster = "";
    msg.sourceName = "";
    msg.target = "";
    msg.amount = 0;
    msg.resourceType = "";
    msg.direction = "";
    
    while (offset < end) {
      const tag = data[offset++];
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;
      
      if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 4) msg.amount = value;
      } else if (wireType === 2) {
        // Length-delimited
        const { value: len, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 1) {
          // EventMeta - decode nested
          const metaEnd = offset + len;
          while (offset < metaEnd) {
            const metaTag = data[offset++];
            const metaField = metaTag >> 3;
            const metaWire = metaTag & 0x7;
            
            if (metaWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (metaField === 1) msg.index = value;
              else if (metaField === 2) msg.offsetMilli = value;
            }
          }
        } else if (fieldNumber === 3) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 5) {
          msg.resourceType = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 6) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 7) {
          msg.sourceName = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 8) {
          msg.direction = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else {
          offset += len;
        }
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for ResourceChange events with zero-allocation decoding.
 * Same API as FastDamageCursor but uses ResourceChangeDecoder.
 */
export class FastResourceChangeCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new ResourceChangeDecoder();
  private offset: number = 0;
  
  private _currentHeader: PayloadHeader | null = null;
  private _messagesReadInEncounter: number = 0;
  private _bytesProcessed: number = 0;
  
  constructor(data: Uint8Array) {
    this.data = data;
    this._loadNextEncounterHeader();
  }
  
  get currentHeader(): PayloadHeader | null {
    return this._currentHeader;
  }
  
  get hasMoreInEncounter(): boolean {
    if (!this._currentHeader) return false;
    return this._messagesReadInEncounter < this._currentHeader.count;
  }
  
  get bytesProcessed(): number {
    return this._bytesProcessed;
  }
  
  get bytesTotal(): number {
    return this.data.length;
  }
  
  /**
   * Read the next message, returning the reusable message object.
   * Returns null if no more messages in current encounter.
   * WARNING: The returned object is reused - copy data if needed!
   */
  next(): ReusableResourceChange | null {
    if (!this.hasMoreInEncounter) return null;
    
    // Read length prefix
    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;
    
    // Decode into reusable message
    const msg = this.decoder.decode(this.data, msgStart, length);
    
    // Advance
    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;
    
    return msg;
  }
  
  /**
   * Move to the next encounter.
   */
  nextEncounter(): boolean {
    // Skip remaining messages in current encounter
    while (this.hasMoreInEncounter) {
      this.next();
    }
    return this._loadNextEncounterHeader();
  }
  
  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    
    const startOffset = this.offset;
    
    // Read encounterID
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;
    
    // Read timestamp
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER 
      ? new Date(tsNumber) 
      : new Date(NaN);
    
    // Read count
    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;
    
    // Read dataLength
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(this.data, this.offset);
    this.offset += dataLenBytes;
    
    this._currentHeader = {
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    };
    
    this._messagesReadInEncounter = 0;
    this._bytesProcessed += (this.offset - startOffset);
    
    return true;
  }
}

/**
 * Reusable ExtraAttack message object
 */
export interface ReusableExtraAttack {
  type: "extra_attack";
  index: number;
  offsetMilli: number;
  target: string;
  amount: number;
  sourceName: string;
}

/**
 * Zero-allocation ExtraAttack decoder.
 * 
 * ExtraAttack proto field numbers:
 *   1: meta (EventMeta)
 *   2: target (string)
 *   3: amount (int32)
 *   5: sourceName (string)
 */
export class ExtraAttackDecoder {
  // Use shared TextDecoder for better memory efficiency
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableExtraAttack = {
    type: "extra_attack",
    index: 0,
    offsetMilli: 0,
    target: "",
    amount: 0,
    sourceName: "",
  };
  
  /**
   * Decode an ExtraAttack message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableExtraAttack {
    const end = offset + length;
    const msg = this.message;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.target = "";
    msg.amount = 0;
    msg.sourceName = "";
    
    while (offset < end) {
      const tag = data[offset++];
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;
      
      if (wireType === 2) {
        // Length-delimited
        const { value: len, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 1) {
          // EventMeta - decode nested
          const metaEnd = offset + len;
          while (offset < metaEnd) {
            const metaTag = data[offset++];
            const metaField = metaTag >> 3;
            const metaWire = metaTag & 0x7;
            
            if (metaWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (metaField === 1) msg.index = value;
              else if (metaField === 2) msg.offsetMilli = value;
            }
          }
        } else if (fieldNumber === 2) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 5) {
          msg.sourceName = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        if (fieldNumber === 3) {
          msg.amount = value;
        }
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for ExtraAttack events with zero-allocation decoding.
 * Same API as FastDamageCursor but uses ExtraAttackDecoder.
 */
export class FastExtraAttackCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new ExtraAttackDecoder();
  private offset: number = 0;
  
  private _currentHeader: PayloadHeader | null = null;
  private _messagesReadInEncounter: number = 0;
  private _bytesProcessed: number = 0;
  
  constructor(data: Uint8Array) {
    this.data = data;
    this._loadNextEncounterHeader();
  }
  
  get currentHeader(): PayloadHeader | null {
    return this._currentHeader;
  }
  
  get hasMoreInEncounter(): boolean {
    if (!this._currentHeader) return false;
    return this._messagesReadInEncounter < this._currentHeader.count;
  }
  
  get bytesProcessed(): number {
    return this._bytesProcessed;
  }
  
  get bytesTotal(): number {
    return this.data.length;
  }
  
  /**
   * Read the next message, returning the reusable message object.
   * Returns null if no more messages in current encounter.
   * WARNING: The returned object is reused - copy data if needed!
   */
  next(): ReusableExtraAttack | null {
    if (!this.hasMoreInEncounter) return null;
    
    // Read length prefix
    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;
    
    // Decode into reusable message
    const msg = this.decoder.decode(this.data, msgStart, length);
    
    // Advance
    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;
    
    return msg;
  }
  
  /**
   * Move to the next encounter.
   */
  nextEncounter(): boolean {
    // Skip remaining messages in current encounter
    while (this.hasMoreInEncounter) {
      this.next();
    }
    return this._loadNextEncounterHeader();
  }
  
  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    
    const startOffset = this.offset;
    
    // Read encounterID
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;
    
    // Read timestamp
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER 
      ? new Date(tsNumber) 
      : new Date(NaN);
    
    // Read count
    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;
    
    // Read dataLength
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(this.data, this.offset);
    this.offset += dataLenBytes;
    
    this._currentHeader = {
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    };
    
    this._messagesReadInEncounter = 0;
    this._bytesProcessed += (this.offset - startOffset);
    
    return true;
  }
}

/**
 * Reusable attribution damage object - the damage that caused the death.
 */
export interface ReusableAttributionDamage {
  caster: string;
  sourceName: string;
  hitType: number;
  amount: number;
  school: number;
}

/**
 * Reusable Slain message object
 */
export interface ReusableSlain {
  type: "slain";
  index: number;
  offsetMilli: number;
  target: string;
  caster: string;
  attribution: ReusableAttributionDamage | null;
}

/**
 * Zero-allocation Slain decoder.
 * 
 * Slain proto field numbers:
 *   1: meta (EventMeta)
 *   2: target (string)
 *   3: caster (optional string)
 *   4: attribution (optional Damage)
 * 
 * Damage proto field numbers (for attribution):
 *   3: caster (optional string)
 *   4: sourceName (string)
 *   5: target (string) - not used for attribution
 *   6: hitType (uint32)
 *   7: amount (int32)
 *   8: school (School enum)
 */
export class SlainDecoder {
  // Use shared TextDecoder for better memory efficiency
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable attribution object - mutated on each decode */
  private readonly reusableAttribution: ReusableAttributionDamage = {
    caster: "",
    sourceName: "",
    hitType: 0,
    amount: 0,
    school: 0,
  };
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableSlain = {
    type: "slain",
    index: 0,
    offsetMilli: 0,
    target: "",
    caster: "",
    attribution: null,
  };
  
  /**
   * Decode a Slain message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableSlain {
    const end = offset + length;
    const msg = this.message;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.target = "";
    msg.caster = "";
    msg.attribution = null;
    
    while (offset < end) {
      const tag = data[offset++];
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;
      
      if (wireType === 2) {
        // Length-delimited
        const { value: len, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 1) {
          // EventMeta - decode nested
          const metaEnd = offset + len;
          while (offset < metaEnd) {
            const metaTag = data[offset++];
            const metaField = metaTag >> 3;
            const metaWire = metaTag & 0x7;
            
            if (metaWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (metaField === 1) msg.index = value;
              else if (metaField === 2) msg.offsetMilli = value;
            }
          }
        } else if (fieldNumber === 2) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 3) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 4) {
          // Attribution (Damage) - decode nested
          const attr = this.reusableAttribution;
          attr.caster = "";
          attr.sourceName = "";
          attr.hitType = 0;
          attr.amount = 0;
          attr.school = 0;
          
          const attrEnd = offset + len;
          while (offset < attrEnd) {
            const attrTag = data[offset++];
            const attrField = attrTag >> 3;
            const attrWire = attrTag & 0x7;
            
            if (attrWire === 0) {
              // Varint fields
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (attrField === 6) attr.hitType = value;
              else if (attrField === 7) attr.amount = value;
              else if (attrField === 8) attr.school = value;
            } else if (attrWire === 2) {
              // Length-delimited fields
              const { value: attrLen, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (attrField === 3) {
                attr.caster = this.textDecoder.decode(data.subarray(offset, offset + attrLen));
              } else if (attrField === 4) {
                attr.sourceName = this.textDecoder.decode(data.subarray(offset, offset + attrLen));
              }
              // Skip field 5 (target) and field 1 (meta) - not needed for attribution
              offset += attrLen;
            }
          }
          msg.attribution = attr;
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        // Varint - skip
        const { bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for Slain events with zero-allocation decoding.
 * Same API as FastDamageCursor but uses SlainDecoder.
 */
export class FastSlainCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new SlainDecoder();
  private offset: number = 0;
  
  private _currentHeader: PayloadHeader | null = null;
  private _messagesReadInEncounter: number = 0;
  private _bytesProcessed: number = 0;
  
  constructor(data: Uint8Array) {
    this.data = data;
    this._loadNextEncounterHeader();
  }
  
  get currentHeader(): PayloadHeader | null {
    return this._currentHeader;
  }
  
  get hasMoreInEncounter(): boolean {
    if (!this._currentHeader) return false;
    return this._messagesReadInEncounter < this._currentHeader.count;
  }
  
  get bytesProcessed(): number {
    return this._bytesProcessed;
  }
  
  get bytesTotal(): number {
    return this.data.length;
  }
  
  /**
   * Read the next message, returning the reusable message object.
   * Returns null if no more messages in current encounter.
   * WARNING: The returned object is reused - copy data if needed!
   */
  next(): ReusableSlain | null {
    if (!this.hasMoreInEncounter) return null;
    
    // Read length prefix
    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;
    
    // Decode into reusable message
    const msg = this.decoder.decode(this.data, msgStart, length);
    
    // Advance
    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;
    
    return msg;
  }
  
  /**
   * Move to the next encounter.
   */
  nextEncounter(): boolean {
    // Skip remaining messages in current encounter
    while (this.hasMoreInEncounter) {
      this.next();
    }
    return this._loadNextEncounterHeader();
  }
  
  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    
    const startOffset = this.offset;
    
    // Read encounterID
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;
    
    // Read timestamp
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER 
      ? new Date(tsNumber) 
      : new Date(NaN);
    
    // Read count
    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;
    
    // Read dataLength
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(this.data, this.offset);
    this.offset += dataLenBytes;
    
    this._currentHeader = {
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    };
    
    this._messagesReadInEncounter = 0;
    this._bytesProcessed += (this.offset - startOffset);
    
    return true;
  }
}

// ============================================================================
// Cast Decoder (for spell casts, channels, etc.)
// ============================================================================

/**
 * Cast action constants matching CastAction proto
 */
export const CastAction = {
  Unknown: 0,
  Casts: 1,
  BeginsToCast: 2,
  Channels: 3,
  FailsCasting: 4,
} as const;

export type CastAction = typeof CastAction[keyof typeof CastAction];

/**
 * Spell info from Cast event
 */
export interface ReusableSpell {
  name: string;
  id: number;
  rank: number | null;
}

export interface ReusableCast {
  type: "cast";
  index: number;
  offsetMilli: number;
  caster: string;
  action: CastAction;
  target: string;
  spell: ReusableSpell;
}

/**
 * Zero-allocation Cast decoder.
 * 
 * Cast proto field numbers:
 *   1: meta (EventMeta)
 *   2: caster (string)
 *   3: action (CastAction enum)
 *   4: target (optional string)
 *   5: spell (Spell message)
 * 
 * Spell proto field numbers:
 *   1: name (string)
 *   2: id (int32)
 *   3: rank (optional int32)
 */
export class CastDecoder {
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable spell object - mutated on each decode */
  private readonly reusableSpell: ReusableSpell = {
    name: "",
    id: 0,
    rank: null,
  };
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableCast = {
    type: "cast",
    index: 0,
    offsetMilli: 0,
    caster: "",
    action: CastAction.Unknown,
    target: "",
    spell: this.reusableSpell,
  };
  
  /**
   * Decode a Cast message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableCast {
    const end = offset + length;
    const msg = this.message;
    const spell = this.reusableSpell;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.caster = "";
    msg.action = CastAction.Unknown;
    msg.target = "";
    spell.name = "";
    spell.id = 0;
    spell.rank = null;
    
    while (offset < end) {
      const tag = data[offset++];
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;
      
      if (wireType === 2) {
        // Length-delimited
        const { value: len, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 1) {
          // EventMeta - decode nested
          const metaEnd = offset + len;
          while (offset < metaEnd) {
            const metaTag = data[offset++];
            const metaField = metaTag >> 3;
            const metaWire = metaTag & 0x7;
            
            if (metaWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (metaField === 1) msg.index = value;
              else if (metaField === 2) msg.offsetMilli = value;
            }
          }
        } else if (fieldNumber === 2) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 4) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 5) {
          // Spell - decode nested
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            
            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 2) spell.id = value;
              else if (spellField === 3) spell.rank = value;
            } else if (spellWire === 2) {
              const { value: spellLen, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) {
                spell.name = this.textDecoder.decode(data.subarray(offset, offset + spellLen));
              }
              offset += spellLen;
            }
          }
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        if (fieldNumber === 3) msg.action = value as CastAction;
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for Cast events with zero-allocation decoding.
 */
export class FastCastCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new CastDecoder();
  private offset: number = 0;
  
  private _currentHeader: PayloadHeader | null = null;
  private _messagesReadInEncounter: number = 0;
  private _bytesProcessed: number = 0;
  
  constructor(data: Uint8Array) {
    this.data = data;
    this._loadNextEncounterHeader();
  }
  
  get currentHeader(): PayloadHeader | null {
    return this._currentHeader;
  }
  
  get hasMoreInEncounter(): boolean {
    if (!this._currentHeader) return false;
    return this._messagesReadInEncounter < this._currentHeader.count;
  }
  
  get bytesProcessed(): number {
    return this._bytesProcessed;
  }
  
  get bytesTotal(): number {
    return this.data.length;
  }
  
  /**
   * Read the next message, returning the reusable message object.
   * Returns null if no more messages in current encounter.
   * WARNING: The returned object is reused - copy data if needed!
   */
  next(): ReusableCast | null {
    if (!this.hasMoreInEncounter) return null;
    
    // Read length prefix
    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;
    
    // Decode into reusable message
    const msg = this.decoder.decode(this.data, msgStart, length);
    
    // Advance
    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;
    
    return msg;
  }
  
  /**
   * Move to the next encounter.
   */
  nextEncounter(): boolean {
    // Skip remaining messages in current encounter
    while (this.hasMoreInEncounter) {
      this.next();
    }
    return this._loadNextEncounterHeader();
  }
  
  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    
    const startOffset = this.offset;
    
    // Read encounterID
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;
    
    // Read timestamp
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER 
      ? new Date(tsNumber) 
      : new Date(NaN);
    
    // Read count
    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;
    
    // Read dataLength
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(this.data, this.offset);
    this.offset += dataLenBytes;
    
    this._currentHeader = {
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    };
    
    this._messagesReadInEncounter = 0;
    this._bytesProcessed += (this.offset - startOffset);
    
    return true;
  }
}

// ============================================================================
// Aura Events - Zero-allocation decoding
// ============================================================================

/**
 * Aura application types from proto enum
 */
export const AuraApplication = {
  Unknown: 0,
  Gains: 1,
  Fades: 2,
  Removed: 3,
} as const;

export type AuraApplication = typeof AuraApplication[keyof typeof AuraApplication];

/**
 * Reusable Aura message object
 */
export interface ReusableAura {
  type: "aura";
  index: number;
  offsetMilli: number;
  target: string;
  spellName: string;
  amount: number;
  application: AuraApplication;
}

/**
 * Zero-allocation Aura decoder.
 * 
 * Aura proto field numbers:
 *   1: meta (EventMeta)
 *   2: target (string)
 *   3: spellName (string)
 *   4: amount (int32)
 *   5: application (AuraApplication enum)
 */
export class AuraDecoder {
  // Use shared TextDecoder for better memory efficiency
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableAura = {
    type: "aura",
    index: 0,
    offsetMilli: 0,
    target: "",
    spellName: "",
    amount: 0,
    application: AuraApplication.Unknown,
  };
  
  /**
   * Decode an Aura message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableAura {
    const end = offset + length;
    const msg = this.message;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.target = "";
    msg.spellName = "";
    msg.amount = 0;
    msg.application = AuraApplication.Unknown;
    
    while (offset < end) {
      const tag = data[offset++];
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;
      
      if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 4) msg.amount = value;
        else if (fieldNumber === 5) msg.application = value as AuraApplication;
      } else if (wireType === 2) {
        // Length-delimited
        const { value: len, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 1) {
          // EventMeta - decode nested
          const metaEnd = offset + len;
          while (offset < metaEnd) {
            const metaTag = data[offset++];
            const metaField = metaTag >> 3;
            const metaWire = metaTag & 0x7;
            
            if (metaWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (metaField === 1) msg.index = value;
              else if (metaField === 2) msg.offsetMilli = value;
            }
          }
        } else if (fieldNumber === 2) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 3) {
          msg.spellName = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else {
          offset += len;
        }
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for Aura events with zero-allocation decoding.
 */
export class FastAuraCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new AuraDecoder();
  private offset: number = 0;
  
  private _currentHeader: PayloadHeader | null = null;
  private _messagesReadInEncounter: number = 0;
  private _bytesProcessed: number = 0;
  
  constructor(data: Uint8Array) {
    this.data = data;
    this._loadNextEncounterHeader();
  }
  
  get currentHeader(): PayloadHeader | null {
    return this._currentHeader;
  }
  
  get hasMoreInEncounter(): boolean {
    if (!this._currentHeader) return false;
    return this._messagesReadInEncounter < this._currentHeader.count;
  }
  
  get bytesProcessed(): number {
    return this._bytesProcessed;
  }
  
  get bytesTotal(): number {
    return this.data.length;
  }
  
  /**
   * Read the next message, returning the reusable message object.
   * Returns null if no more messages in current encounter.
   * WARNING: The returned object is reused - copy data if needed!
   */
  next(): ReusableAura | null {
    if (!this.hasMoreInEncounter) return null;
    
    // Read length prefix
    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;
    
    // Decode into reusable message
    const msg = this.decoder.decode(this.data, msgStart, length);
    
    // Advance
    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;
    
    return msg;
  }
  
  /**
   * Move to the next encounter.
   */
  nextEncounter(): boolean {
    // Skip remaining messages in current encounter
    while (this.hasMoreInEncounter) {
      this.next();
    }
    return this._loadNextEncounterHeader();
  }
  
  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    
    const startOffset = this.offset;
    
    // Read encounterID
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;
    
    // Read timestamp
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER 
      ? new Date(tsNumber) 
      : new Date(NaN);
    
    // Read count
    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;
    
    // Read dataLength
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(this.data, this.offset);
    this.offset += dataLenBytes;
    
    this._currentHeader = {
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    };
    
    this._messagesReadInEncounter = 0;
    this._bytesProcessed += (this.offset - startOffset);
    
    return true;
  }
}

/**
 * Fast varint reader - inline for speed, no object allocation for result
 */
function readVarintFast(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;
  
  // Unroll common cases (1-3 bytes)
  let byte = data[offset];
  if ((byte & 0x80) === 0) {
    return { value: byte, bytesRead: 1 };
  }
  value = byte & 0x7f;
  
  byte = data[offset + 1];
  if ((byte & 0x80) === 0) {
    return { value: value | (byte << 7), bytesRead: 2 };
  }
  value |= (byte & 0x7f) << 7;
  
  byte = data[offset + 2];
  if ((byte & 0x80) === 0) {
    return { value: value | (byte << 14), bytesRead: 3 };
  }
  value |= (byte & 0x7f) << 14;
  
  // Fallback for larger varints
  bytesRead = 3;
  shift = 21;
  while (offset + bytesRead < data.length) {
    byte = data[offset + bytesRead];
    bytesRead++;
    value |= (byte & 0x7f) << shift;
    shift += 7;
    if ((byte & 0x80) === 0) break;
  }
  
  return { value, bytesRead };
}

// ============================================================================
// Stream Cursor - Lazy decoding with encounter-aware iteration
// ============================================================================

/**
 * A cursor for lazily iterating through a stream of encounters and messages.
 * Supports peeking at the next message and advancing through the stream.
 */
export class StreamCursor<T extends DescMessage> {
  private readonly schema: T;
  private readonly data: Uint8Array;
  private offset: number = 0;
  
  // Current encounter state
  private _currentHeader: PayloadHeader | null = null;
  private _messagesReadInEncounter: number = 0;
  private _peekedMessage: { message: MessageShape<T>; index: number; bytesConsumed: number } | null = null;
  
  // Progress tracking
  private _bytesProcessed: number = 0;
  
  constructor(schema: T, data: Uint8Array) {
    this.schema = schema;
    this.data = data;
    
    // Load first encounter header
    this._loadNextEncounterHeader();
  }
  
  /** Current encounter header, or null if no more encounters */
  get currentHeader(): PayloadHeader | null {
    return this._currentHeader;
  }
  
  /** Number of messages processed in current encounter */
  get messagesReadInEncounter(): number {
    return this._messagesReadInEncounter;
  }
  
  /** Total bytes processed so far */
  get bytesProcessed(): number {
    return this._bytesProcessed;
  }
  
  /** Total bytes in the stream */
  get bytesTotal(): number {
    return this.data.length;
  }
  
  /** Whether there are more messages in the current encounter */
  get hasMoreInEncounter(): boolean {
    if (!this._currentHeader) return false;
    return this._messagesReadInEncounter < this._currentHeader.count;
  }
  
  /** Whether there are more encounters after the current one */
  get hasMoreEncounters(): boolean {
    if (!this._currentHeader) return false;
    // Check if there's data beyond the current encounter
    const encounterEndOffset = this.offset + (this._currentHeader.dataLength - this._bytesInCurrentEncounter());
    return encounterEndOffset < this.data.length;
  }
  
  /**
   * Peek at the next message without consuming it.
   * Returns null if no more messages in current encounter.
   */
  peek(): { message: MessageShape<T>; index: number } | null {
    if (!this.hasMoreInEncounter) return null;
    
    if (!this._peekedMessage) {
      this._peekedMessage = this._decodeNextMessage();
    }
    
    if (!this._peekedMessage) return null;
    
    return {
      message: this._peekedMessage.message,
      index: this._peekedMessage.index,
    };
  }
  
  /**
   * Advance to the next message, consuming the current one.
   */
  advance(): void {
    if (!this._peekedMessage) {
      // Need to decode to know how many bytes to skip
      this._peekedMessage = this._decodeNextMessage();
    }
    
    if (this._peekedMessage) {
      this.offset += this._peekedMessage.bytesConsumed;
      this._bytesProcessed += this._peekedMessage.bytesConsumed;
      this._messagesReadInEncounter++;
      this._peekedMessage = null;
    }
  }
  
  /**
   * Move to the next encounter.
   * Returns true if there is another encounter, false if done.
   */
  nextEncounter(): boolean {
    if (!this._currentHeader) return false;
    
    // Skip remaining messages in current encounter if any
    while (this.hasMoreInEncounter) {
      this.advance();
    }
    
    // Try to load next header
    return this._loadNextEncounterHeader();
  }
  
  private _bytesInCurrentEncounter(): number {
    // Bytes read so far in current encounter's message data
    // This is tracked separately from offset since offset includes header
    return 0; // This is accounted for in _bytesProcessed
  }
  
  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    
    const startOffset = this.offset;
    
    // Read encounterID (length-prefixed string)
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;
    
    // Read firstTimestamp (varint, milliseconds since epoch)
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const firstTimestamp = new Date(Number(timestampMs));
    
    // Read count (varint)
    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;
    
    // Read dataLength (varint)
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(this.data, this.offset);
    this.offset += dataLenBytes;
    
    this._currentHeader = {
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    };
    
    this._messagesReadInEncounter = 0;
    this._bytesProcessed += (this.offset - startOffset);
    
    return true;
  }
  
  private _decodeNextMessage(): { message: MessageShape<T>; index: number; bytesConsumed: number } | null {
    if (!this.hasMoreInEncounter) return null;
    
    // Read varint length prefix
    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;
    
    if (msgStart + length > this.data.length) {
      throw new Error(
        `Invalid length-delimited message: expected ${length} bytes at offset ${msgStart}, but only ${this.data.length - msgStart} remaining`
      );
    }
    
    const messageBytes = this.data.subarray(msgStart, msgStart + length);
    const message = fromBinary(this.schema, messageBytes);
    
    // Extract index from the message's meta field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (message as any).meta;
    const index = meta?.index ?? 0;
    
    return {
      message,
      index,
      bytesConsumed: bytesRead + length,
    };
  }
}

/**
 * Create a stream cursor for lazy iteration through encounters and messages.
 */
export function createStreamCursor<T extends DescMessage>(
  schema: T,
  data: Uint8Array
): StreamCursor<T> {
  return new StreamCursor(schema, data);
}

// ============================================================================
// Fast Damage Cursor - Zero-allocation iteration
// ============================================================================

/**
 * A fast, zero-allocation cursor specifically for Damage messages.
 * Uses DamageDecoder internally and reuses memory.
 */
export class FastDamageCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new DamageDecoder();
  private offset: number = 0;
  
  private _currentHeader: PayloadHeader | null = null;
  private _messagesReadInEncounter: number = 0;
  private _bytesProcessed: number = 0;
  
  constructor(data: Uint8Array) {
    this.data = data;
    this._loadNextEncounterHeader();
  }
  
  get currentHeader(): PayloadHeader | null {
    return this._currentHeader;
  }
  
  get hasMoreInEncounter(): boolean {
    if (!this._currentHeader) return false;
    return this._messagesReadInEncounter < this._currentHeader.count;
  }
  
  get bytesProcessed(): number {
    return this._bytesProcessed;
  }
  
  get bytesTotal(): number {
    return this.data.length;
  }
  
  /**
   * Read the next message, returning the reusable message object.
   * Returns null if no more messages in current encounter.
   * WARNING: The returned object is reused - copy data if needed!
   */
  next(): ReusableDamage | null {
    if (!this.hasMoreInEncounter) return null;
    
    // Read length prefix
    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;
    
    // Decode into reusable message
    const msg = this.decoder.decode(this.data, msgStart, length);
    
    // Advance
    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;
    
    return msg;
  }
  
  /**
   * Move to the next encounter.
   */
  nextEncounter(): boolean {
    // Skip remaining messages in current encounter
    while (this.hasMoreInEncounter) {
      this.next();
    }
    return this._loadNextEncounterHeader();
  }
  
  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    
    const startOffset = this.offset;
    
    // Read encounterID
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;
    
    // Read timestamp
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    
    // Read count
    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;
    
    // Read dataLength
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(this.data, this.offset);
    this.offset += dataLenBytes;
    
    this._currentHeader = {
      encounterID,
      firstTimestamp: new Date(Number(timestampMs)),
      count,
      dataLength,
    };
    
    this._messagesReadInEncounter = 0;
    this._bytesProcessed += (this.offset - startOffset);
    
    return true;
  }
}

// ============================================================================
// Header parsing (for encounter discovery)
// ============================================================================

/**
 * Parse all encounter headers from stream data without fully decoding messages.
 * Returns headers with encounter metadata and byte sizes.
 */
export function parseAllHeaders(data: Uint8Array): PayloadHeader[] {
  const headers: PayloadHeader[] = [];
  let offset = 0;

  while (offset < data.length) {
    // Read encounterID (length-prefixed string)
    const { value: strLen, bytesRead: strLenBytes } = readVarint(data, offset);
    offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(data.subarray(offset, offset + strLen));
    offset += strLen;

    // Read firstTimestamp (varint, milliseconds since epoch)
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(data, offset);
    offset += tsBytes;
    const firstTimestamp = new Date(Number(timestampMs));

    // Read count (varint)
    const { value: count, bytesRead: countBytes } = readVarint(data, offset);
    offset += countBytes;

    // Read dataLength (varint)
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(data, offset);
    offset += dataLenBytes;

    headers.push({
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    });

    // Skip message data to get to next header
    offset += dataLength;
  }

  return headers;
}

// ============================================================================
// Varint helpers (exported for use by cursor)
// ============================================================================

/**
 * Reads a varint (up to 32-bit) from the buffer at the given offset.
 */
export function readVarint(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;

  while (offset + bytesRead < data.length) {
    const byte = data[offset + bytesRead];
    bytesRead++;

    value |= (byte & 0x7f) << shift;
    shift += 7;

    if ((byte & 0x80) === 0) {
      return { value, bytesRead };
    }

    if (bytesRead > 5) {
      throw new Error("Varint too long for 32-bit value");
    }
  }

  throw new Error("Unexpected end of data while reading varint");
}

/**
 * Reads a varint (up to 64-bit) from the buffer, returns as bigint.
 */
export function readVarint64(data: Uint8Array, offset: number): { value: bigint; bytesRead: number } {
  let value = 0n;
  let shift = 0n;
  let bytesRead = 0;

  while (offset + bytesRead < data.length) {
    const byte = data[offset + bytesRead];
    bytesRead++;

    value |= BigInt(byte & 0x7f) << shift;
    shift += 7n;

    if ((byte & 0x80) === 0) {
      return { value, bytesRead };
    }

    if (bytesRead > 10) {
      throw new Error("Varint too long for 64-bit value");
    }
  }

  throw new Error("Unexpected end of data while reading varint");
}
