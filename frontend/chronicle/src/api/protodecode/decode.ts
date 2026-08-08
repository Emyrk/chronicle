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
 * Activity entry from encounter period tracking.
 * Indicates when a unit becomes active, ends activity, is slain, or bumps its activity timer.
 */
export interface ReusableActivityEntry {
  guid: string;
  eventType: string;  // "start" | "end" | "slain" | "bump"
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
  activity: ReusableActivityEntry[];
  activityCount: number;  // Actual number of activity entries
  isSynthetic: boolean;
  spellId: number | null; // From SpellData field 10
  spellAttackOutcome: number | null; // From SpellData field 3 (AttackOutcome bitmask)
  overkill: number;
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
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    spellId: null,
    spellAttackOutcome: null,
    overkill: 0,
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
    msg.activityCount = 0;
    msg.isSynthetic = false;
    msg.spellId = null;
    msg.spellAttackOutcome = null;
    msg.overkill = 0;
    
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
        else if (fieldNumber === 11) msg.overkill = value;
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
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
        } else if (fieldNumber === 10) {
          // SpellData - decode nested to get spell ID
          // SpellData: 1=id (varint), 2=name (string)
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            
            if (spellWire === 0) {
              // varint fields
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) msg.spellId = value;
              else if (spellField === 3) msg.spellAttackOutcome = value;
            } else if (spellWire === 2) {
              // string field (name) - skip it
              const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
              offset += sLenBytes + sLen;
            }
          }
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
  school: number;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
  spellId: number | null; // From SpellData field 8
  spellAttackOutcome: number | null; // From SpellData field 3 (AttackOutcome bitmask)
  overheal: number;
  absorbed: number;
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
 *   8: spellData (SpellData) - nested: 1=id, 2=name
 *   9: school (School enum, varint)
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
    overheal: 0,
    absorbed: 0,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    spellId: null,
    spellAttackOutcome: null,
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
    msg.activityCount = 0;
    msg.isSynthetic = false;
    msg.spellId = null;
    msg.spellAttackOutcome = null;
    msg.overheal = 0;
    msg.absorbed = 0;
    
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
        else if (fieldNumber === 9) msg.school = value;
        else if (fieldNumber === 10) msg.overheal = value;
        else if (fieldNumber === 11) msg.absorbed = value;
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
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
        } else if (fieldNumber === 8) {
          // SpellData - decode nested (1=id, 2=name)
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) msg.spellId = value;
              else if (spellField === 3) msg.spellAttackOutcome = value;
            } else if (spellWire === 2) {
              // Skip name field (we use sourceName)
              const { value: sLen, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead + sLen;
            }
          }
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
  
  /**
   * Skip to the next encounter without decoding events.
   * Uses dataLength from header to jump directly by byte offset.
   */
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
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
  spellId: number | null;
  spellAttackOutcome: number | null;
  overResource: number;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
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
    spellId: null,
    spellAttackOutcome: null,
    overResource: 0,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
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
    msg.spellId = null;
    msg.spellAttackOutcome = null;
    msg.overResource = 0;
    msg.activityCount = 0;
    msg.isSynthetic = false;
    
    while (offset < end) {
      const tag = data[offset++];
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;
      
      if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        
        if (fieldNumber === 4) msg.amount = value;
        else if (fieldNumber === 10) msg.overResource = value;
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
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
        } else if (fieldNumber === 9) {
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) msg.spellId = value;
              else if (spellField === 3) msg.spellAttackOutcome = value;
            } else if (spellWire === 2) {
              const { value: spellLen, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead + spellLen;
            }
          }
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
  
  /**
   * Skip to the next encounter without decoding events.
   * Uses dataLength from header to jump directly by byte offset.
   */
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
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
  spellId: number | null;
  spellAttackOutcome: number | null;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

/**
 * Zero-allocation ExtraAttack decoder.
 * 
 * ExtraAttack proto field numbers:
 *   1: meta (EventMeta)
 *   2: target (string)
 *   3: amount (int32)
 *   5: sourceName (string)
 *   6: spellData (SpellData) - nested: 1=id, 2=name, 3=attack_outcome
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
    spellId: null,
    spellAttackOutcome: null,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
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
    msg.spellId = null;
    msg.spellAttackOutcome = null;
    msg.activityCount = 0;
    msg.isSynthetic = false;
    
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 2) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 5) {
          msg.sourceName = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 6) {
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) msg.spellId = value;
              else if (spellField === 3) msg.spellAttackOutcome = value;
            } else if (spellWire === 2) {
              const { value: spellLen, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead + spellLen;
            }
          }
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
  
  /**
   * Skip to the next encounter without decoding events.
   * Uses dataLength from header to jump directly by byte offset.
   */
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
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
  spellId: number | null;
  spellAttackOutcome: number | null;
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
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
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
 *   10: spellData (SpellData) - nested: 1=id, 2=name, 3=attack_outcome
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
    spellId: null,
    spellAttackOutcome: null,
  };
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableSlain = {
    type: "slain",
    index: 0,
    offsetMilli: 0,
    target: "",
    caster: "",
    attribution: null,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
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
    msg.activityCount = 0;
    msg.isSynthetic = false;
    
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
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
          attr.spellId = null;
          attr.spellAttackOutcome = null;
          
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
                offset += attrLen;
              } else if (attrField === 4) {
                attr.sourceName = this.textDecoder.decode(data.subarray(offset, offset + attrLen));
                offset += attrLen;
              } else if (attrField === 10) {
                const spellEnd = offset + attrLen;
                while (offset < spellEnd) {
                  const spellTag = data[offset++];
                  const spellField = spellTag >> 3;
                  const spellWire = spellTag & 0x7;
                  if (spellWire === 0) {
                    const { value, bytesRead } = readVarintFast(data, offset);
                    offset += bytesRead;
                    if (spellField === 1) attr.spellId = value;
                    else if (spellField === 3) attr.spellAttackOutcome = value;
                  } else if (spellWire === 2) {
                    const { value: spellLen, bytesRead } = readVarintFast(data, offset);
                    offset += bytesRead + spellLen;
                  }
                }
              } else {
                // Skip field 5 (target) and field 1 (meta) - not needed for attribution
                offset += attrLen;
              }
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
  
  /**
   * Skip to the next encounter without decoding events.
   * Uses dataLength from header to jump directly by byte offset.
   */
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
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
// Resurrection Decoder
// ============================================================================

export interface ReusableResurrectionSpell {
  id: number;
  name: string;
}

export interface ReusableResurrection {
  type: "ressurection";
  index: number;
  offsetMilli: number;
  source: string;
  target: string;
  spell: ReusableResurrectionSpell;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

export class ResurrectionDecoder {
  private readonly textDecoder = sharedTextDecoder;
  private readonly reusableSpell: ReusableResurrectionSpell = { id: 0, name: "" };

  readonly message: ReusableResurrection = {
    type: "ressurection",
    index: 0,
    offsetMilli: 0,
    source: "",
    target: "",
    spell: this.reusableSpell,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };

  decode(data: Uint8Array, offset: number, length: number): ReusableResurrection {
    const end = offset + length;
    const msg = this.message;
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.source = "";
    msg.target = "";
    msg.spell.id = 0;
    msg.spell.name = "";
    msg.activityCount = 0;
    msg.isSynthetic = false;

    while (offset < end) {
      const tag = data[offset++];
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;

      if (wireType === 2) {
        const { value: len, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;

        if (fieldNumber === 1) {
          const metaEnd = offset + len;
          while (offset < metaEnd) {
            const metaTag = data[offset++];
            const metaField = metaTag >> 3;
            const metaWire = metaTag & 0x7;
            if (metaWire === 0) {
              const decoded = readVarintFast(data, offset);
              offset += decoded.bytesRead;
              if (metaField === 1) msg.index = decoded.value;
              else if (metaField === 2) msg.offsetMilli = decoded.value;
              else if (metaField === 4) msg.isSynthetic = decoded.value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              const decoded = readVarintFast(data, offset);
              offset += decoded.bytesRead;
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              const activityEnd = offset + decoded.value;
              while (offset < activityEnd) {
                const activityTag = data[offset++];
                const activityField = activityTag >> 3;
                const activityWire = activityTag & 0x7;
                if (activityWire !== 2) {
                  const skipped = readVarintFast(data, offset);
                  offset += skipped.bytesRead;
                  continue;
                }
                const text = readVarintFast(data, offset);
                offset += text.bytesRead;
                const value = this.textDecoder.decode(data.subarray(offset, offset + text.value));
                if (activityField === 1) entry.guid = value;
                else if (activityField === 2) entry.eventType = value;
                offset += text.value;
              }
              msg.activityCount++;
            } else {
              offset = skipField(data, offset, metaWire);
            }
          }
        } else if (fieldNumber === 2) {
          msg.source = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 3) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 4) {
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            if (spellWire === 0) {
              const decoded = readVarintFast(data, offset);
              offset += decoded.bytesRead;
              if (spellField === 1) msg.spell.id = decoded.value;
            } else if (spellWire === 2) {
              const decoded = readVarintFast(data, offset);
              offset += decoded.bytesRead;
              if (spellField === 2) {
                msg.spell.name = this.textDecoder.decode(data.subarray(offset, offset + decoded.value));
              }
              offset += decoded.value;
            } else {
              offset = skipField(data, offset, spellWire);
            }
          }
        } else {
          offset += len;
        }
      } else {
        offset = skipField(data, offset, wireType);
      }
    }

    return msg;
  }
}

function skipField(data: Uint8Array, offset: number, wireType: number): number {
  if (wireType === 0) return offset + readVarintFast(data, offset).bytesRead;
  if (wireType === 1) return offset + 8;
  if (wireType === 2) {
    const decoded = readVarintFast(data, offset);
    return offset + decoded.bytesRead + decoded.value;
  }
  if (wireType === 5) return offset + 4;
  throw new Error(`Unsupported protobuf wire type: ${wireType}`);
}

export class FastResurrectionCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new ResurrectionDecoder();
  private offset = 0;
  private _currentHeader: PayloadHeader | null = null;
  private _messagesReadInEncounter = 0;
  private _bytesProcessed = 0;

  constructor(data: Uint8Array) {
    this.data = data;
    this._loadNextEncounterHeader();
  }

  get currentHeader(): PayloadHeader | null { return this._currentHeader; }
  get hasMoreInEncounter(): boolean {
    return this._currentHeader !== null && this._messagesReadInEncounter < this._currentHeader.count;
  }
  get bytesProcessed(): number { return this._bytesProcessed; }
  get bytesTotal(): number { return this.data.length; }

  next(): ReusableResurrection | null {
    if (!this.hasMoreInEncounter) return null;
    const decoded = readVarint(this.data, this.offset);
    const msgStart = this.offset + decoded.bytesRead;
    const msg = this.decoder.decode(this.data, msgStart, decoded.value);
    this.offset = msgStart + decoded.value;
    this._bytesProcessed += decoded.bytesRead + decoded.value;
    this._messagesReadInEncounter++;
    return msg;
  }

  nextEncounter(): boolean {
    while (this.hasMoreInEncounter) this.next();
    return this._loadNextEncounterHeader();
  }

  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) return this.nextEncounter();
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
    return this._loadNextEncounterHeader();
  }

  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    const startOffset = this.offset;
    const encounterLength = readVarint(this.data, this.offset);
    this.offset += encounterLength.bytesRead;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + encounterLength.value));
    this.offset += encounterLength.value;
    const timestamp = readVarint64(this.data, this.offset);
    this.offset += timestamp.bytesRead;
    const count = readVarint(this.data, this.offset);
    this.offset += count.bytesRead;
    const dataLength = readVarint(this.data, this.offset);
    this.offset += dataLength.bytesRead;
    this._currentHeader = {
      encounterID,
      firstTimestamp: new Date(Number(timestamp.value)),
      count: count.value,
      dataLength: dataLength.value,
    };
    this._messagesReadInEncounter = 0;
    this._bytesProcessed += this.offset - startOffset;
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
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
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
    activity: [],
    activityCount: 0,
    isSynthetic: false,
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
    msg.activityCount = 0;
    msg.isSynthetic = false;
    
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
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
  
  /**
   * Skip to the next encounter without decoding events.
   * Uses dataLength from header to jump directly by byte offset.
   */
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
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
 * Aura state types from proto enum (preferred over AuraApplication)
 */
export const AuraState = {
  Unknown: 0,
  Added: 1,
  Removed: 2,
  Modified: 3,
} as const;

export type AuraState = (typeof AuraState)[keyof typeof AuraState];

/**
 * Reusable Aura message object
 */
export interface ReusableAura {
  type: "aura";
  index: number;
  offsetMilli: number;
  target: string;
  spellName: string;
  spellId: number | null;
  spellAttackOutcome: number | null;
  amount: number;
  application: AuraApplication;
  state: AuraState;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
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
    spellId: null,
    spellAttackOutcome: null,
    amount: 0,
    application: AuraApplication.Unknown,
    state: AuraState.Unknown,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
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
    msg.spellId = null;
    msg.spellAttackOutcome = null;
    msg.amount = 0;
    msg.application = AuraApplication.Unknown;
    msg.state = AuraState.Unknown;
    msg.activityCount = 0;
    msg.isSynthetic = false;
    
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
        else if (fieldNumber === 6) msg.state = value as AuraState;
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 2) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 3) {
          msg.spellName = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 7) {
          // SpellData - decode nested message (field 1: id, field 2: name)
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            
            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) msg.spellId = value;
              else if (spellField === 3) msg.spellAttackOutcome = value;
            } else if (spellWire === 2) {
              // Spell name string - skip, we already have spellName from field 3
              const { value: spellLen, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              offset += spellLen;
            }
          }
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
  
  /**
   * Skip to the next encounter without decoding events.
   * Uses dataLength from header to jump directly by byte offset.
   */
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
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

// ============================================================================
// AuraCast Decoder - Decodes aura application events with timing info
// ============================================================================

/**
 * Reusable SpellData object for AuraCast (id + name)
 */
export interface ReusableAuraCastSpell {
  id: number;
  name: string;
  attackOutcome: number | null;
}

/**
 * Reusable AuraCast message object
 */
export interface ReusableAuraCast {
  type: "aura_cast";
  index: number;
  offsetMilli: number;
  caster: string;
  target: string | null;
  spell: ReusableAuraCastSpell;
  effect: number;
  amplitude: number;
  effectMiscValue: number;
  durationMS: number;
  capStatus: number;
  effectAuraName: number;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

/**
 * Zero-allocation AuraCast decoder.
 * 
 * AuraCast proto field numbers:
 *   1: meta (EventMeta)
 *   2: spell (SpellData) - nested: 1=id, 2=name
 *   3: caster (string)
 *   4: target (optional string)
 *   5: effect (int32)
 *   6: amplitude (int32)
 *   7: effectMiscValue (int32)
 *   8: durationMS (int32)
 *   9: capStatus (int32)
 *  10: effectAuraName (int32)
 */
export class AuraCastDecoder {
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable spell object - mutated on each decode */
  private readonly reusableSpell: ReusableAuraCastSpell = {
    id: 0,
    name: "",
    attackOutcome: null,
  };
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableAuraCast = {
    type: "aura_cast",
    index: 0,
    offsetMilli: 0,
    caster: "",
    target: null,
    spell: this.reusableSpell,
    effect: 0,
    amplitude: 0,
    effectMiscValue: 0,
    durationMS: 0,
    capStatus: 0,
    effectAuraName: 0,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };
  
  /**
   * Decode an AuraCast message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableAuraCast {
    const end = offset + length;
    const msg = this.message;
    const spell = this.reusableSpell;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.caster = "";
    msg.target = null;
    spell.id = 0;
    spell.name = "";
    spell.attackOutcome = null;
    msg.effect = 0;
    msg.amplitude = 0;
    msg.effectMiscValue = 0;
    msg.durationMS = 0;
    msg.capStatus = 0;
    msg.effectAuraName = 0;
    msg.activityCount = 0;
    msg.isSynthetic = false;
    
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 2) {
          // SpellData - decode nested (1=id, 2=name)
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            
            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) spell.id = value;
              else if (spellField === 3) spell.attackOutcome = value;
            } else if (spellWire === 2) {
              const { value: spellLen, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 2) {
                spell.name = this.textDecoder.decode(data.subarray(offset, offset + spellLen));
              }
              offset += spellLen;
            }
          }
        } else if (fieldNumber === 3) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 4) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        if (fieldNumber === 5) msg.effect = value;
        else if (fieldNumber === 6) msg.amplitude = value;
        else if (fieldNumber === 7) msg.effectMiscValue = value;
        else if (fieldNumber === 8) msg.durationMS = value;
        else if (fieldNumber === 9) msg.capStatus = value;
        else if (fieldNumber === 10) msg.effectAuraName = value;
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for AuraCast events with zero-allocation decoding.
 */
export class FastAuraCastCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new AuraCastDecoder();
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
  next(): ReusableAuraCast | null {
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
  
  /**
   * Skip to the next encounter without decoding events.
   * Uses dataLength from header to jump directly by byte offset.
   */
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
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
// SpellGo Decoder - Decodes spell completion events with hit/miss info
// ============================================================================

/**
 * Reusable SpellGo spell data object (from SpellData: id + name)
 */
export interface ReusableSpellGoSpell {
  id: number;
  name: string;
  attackOutcome: number | null;
}

/**
 * Reusable SpellGo message object
 */
export interface ReusableSpellGo {
  type: "spell_go";
  index: number;
  offsetMilli: number;
  caster: string;
  target: string;
  spell: ReusableSpellGoSpell;  // SpellData: id + name
  numHits: number;
  numMisses: number;
  itemId: number | null;
  corpseOwner: string | null;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

/**
 * Zero-allocation SpellGo decoder.
 * 
 * SpellGo proto field numbers:
 *   1: meta (EventMeta)
 *   2: itemID (optional int32)
 *   3: spellData (SpellData)
 *   4: caster (string)
 *   5: target (optional string)
 *   6: numHits (int32)
 *   7: numMisses (int32)
 *   8: corpseOwner (optional string)
 */
export class SpellGoDecoder {
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable spell object - mutated on each decode */
  private readonly reusableSpell: ReusableSpellGoSpell = {
    id: 0,
    name: "",
    attackOutcome: null,
  };
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableSpellGo = {
    type: "spell_go",
    index: 0,
    offsetMilli: 0,
    caster: "",
    target: "",
    spell: this.reusableSpell,
    numHits: 0,
    numMisses: 0,
    itemId: null,
    corpseOwner: null,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };
  
  /**
   * Decode a SpellGo message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableSpellGo {
    const end = offset + length;
    const msg = this.message;
    const spell = this.reusableSpell;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.caster = "";
    msg.target = "";
    spell.id = 0;
    spell.name = "";
    spell.attackOutcome = null;
    msg.numHits = 0;
    msg.numMisses = 0;
    msg.itemId = null;
    msg.corpseOwner = null;
    msg.activityCount = 0;
    msg.isSynthetic = false;
    
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 3) {
          // SpellData - decode nested (1=id, 2=name, 3=attack_outcome)
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            
            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) spell.id = value;
              else if (spellField === 3) spell.attackOutcome = value;
            } else if (spellWire === 2) {
              const { value: spellLen, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 2) {
                spell.name = this.textDecoder.decode(data.subarray(offset, offset + spellLen));
              }
              offset += spellLen;
            }
          }
        } else if (fieldNumber === 4) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 5) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 8) {
          msg.corpseOwner = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        if (fieldNumber === 2) msg.itemId = value;
        else if (fieldNumber === 6) msg.numHits = value;
        else if (fieldNumber === 7) msg.numMisses = value;
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for SpellGo events with zero-allocation decoding.
 */
export class FastSpellGoCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new SpellGoDecoder();
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
  next(): ReusableSpellGo | null {
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
  
  /**
   * Skip to the next encounter without decoding events.
   * Uses dataLength from header to jump directly by byte offset.
   */
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
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
// SpellStart Decoder - Decodes spell cast start events
// ============================================================================

/**
 * Reusable SpellStart spell data object (from SpellData: id + name)
 */
export interface ReusableSpellStartSpell {
  id: number;
  name: string;
  attackOutcome: number | null;
}

/**
 * Reusable SpellStart message object
 */
export interface ReusableSpellStart {
  type: "spell_start";
  index: number;
  offsetMilli: number;
  caster: string;
  target: string;
  spell: ReusableSpellStartSpell;
  itemId: number | null;
  castFlags: number;
  castTimeMilli: number;
  channelTimeMilli: number;
  spellType: number;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

/**
 * Zero-allocation SpellStart decoder.
 * 
 * SpellStart proto field numbers:
 *   1: meta (EventMeta)
 *   2: itemID (optional int32)
 *   3: spellData (SpellData)
 *   4: caster (string)
 *   5: target (optional string)
 *   6: castFlags (int32)
 *   7: castTimeMilli (int32)
 *   8: channelTimeMilli (int32)
 *   9: spellType (int32)
 */
export class SpellStartDecoder {
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable spell object - mutated on each decode */
  private readonly reusableSpell: ReusableSpellStartSpell = {
    id: 0,
    name: "",
    attackOutcome: null,
  };
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableSpellStart = {
    type: "spell_start",
    index: 0,
    offsetMilli: 0,
    caster: "",
    target: "",
    spell: this.reusableSpell,
    itemId: null,
    castFlags: 0,
    castTimeMilli: 0,
    channelTimeMilli: 0,
    spellType: 0,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };
  
  /**
   * Decode a SpellStart message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableSpellStart {
    const end = offset + length;
    const msg = this.message;
    const spell = this.reusableSpell;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.caster = "";
    msg.target = "";
    spell.id = 0;
    spell.name = "";
    spell.attackOutcome = null;
    msg.itemId = null;
    msg.castFlags = 0;
    msg.castTimeMilli = 0;
    msg.channelTimeMilli = 0;
    msg.spellType = 0;
    msg.activityCount = 0;
    msg.isSynthetic = false;
    
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 3) {
          // SpellData - decode nested (1=id, 2=name, 3=attack_outcome)
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            
            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) spell.id = value;
              else if (spellField === 3) spell.attackOutcome = value;
            } else if (spellWire === 2) {
              const { value: spellLen, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 2) {
                spell.name = this.textDecoder.decode(data.subarray(offset, offset + spellLen));
              }
              offset += spellLen;
            }
          }
        } else if (fieldNumber === 4) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 5) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        if (fieldNumber === 2) msg.itemId = value;
        else if (fieldNumber === 6) msg.castFlags = value;
        else if (fieldNumber === 7) msg.castTimeMilli = value;
        else if (fieldNumber === 8) msg.channelTimeMilli = value;
        else if (fieldNumber === 9) msg.spellType = value;
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for SpellStart events with zero-allocation decoding.
 */
export class FastSpellStartCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new SpellStartDecoder();
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
  next(): ReusableSpellStart | null {
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
  
  /**
   * Skip to the next encounter without decoding events.
   * Uses dataLength from header to jump directly by byte offset.
   */
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
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
// SpellFail Decoder - Decodes spell cast failure events
// ============================================================================

/**
 * Reusable SpellFail spell data object (from SpellData: id + name)
 */
export interface ReusableSpellFailSpell {
  id: number;
  name: string;
  attackOutcome: number | null;
}

/**
 * Reusable SpellFail message object
 */
export interface ReusableSpellFail {
  type: "spell_fail";
  index: number;
  offsetMilli: number;
  caster: string;
  spell: ReusableSpellFailSpell;
  failedByServer: boolean;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

/**
 * Zero-allocation SpellFail decoder.
 * 
 * SpellFail proto field numbers:
 *   1: meta (EventMeta)
 *   2: caster (string)
 *   3: spellData (SpellData)
 *   4: failedBySever (bool)
 */
export class SpellFailDecoder {
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable spell object - mutated on each decode */
  private readonly reusableSpell: ReusableSpellFailSpell = {
    id: 0,
    name: "",
    attackOutcome: null,
  };
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableSpellFail = {
    type: "spell_fail",
    index: 0,
    offsetMilli: 0,
    caster: "",
    spell: this.reusableSpell,
    failedByServer: false,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };
  
  /**
   * Decode a SpellFail message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableSpellFail {
    const end = offset + length;
    const msg = this.message;
    const spell = this.reusableSpell;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.caster = "";
    spell.id = 0;
    spell.name = "";
    spell.attackOutcome = null;
    msg.failedByServer = false;
    msg.activityCount = 0;
    msg.isSynthetic = false;
    
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 2) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 3) {
          // SpellData - decode nested (1=id, 2=name, 3=attack_outcome)
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            
            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) spell.id = value;
              else if (spellField === 3) spell.attackOutcome = value;
            } else if (spellWire === 2) {
              const { value: spellLen, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 2) {
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
        if (fieldNumber === 4) msg.failedByServer = value !== 0;
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for SpellFail events with zero-allocation decoding.
 */
export class FastSpellFailCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new SpellFailDecoder();
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
  
  next(): ReusableSpellFail | null {
    if (!this.hasMoreInEncounter) return null;
    
    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;
    
    const msg = this.decoder.decode(this.data, msgStart, length);
    
    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;
    
    return msg;
  }
  
  nextEncounter(): boolean {
    while (this.hasMoreInEncounter) {
      this.next();
    }
    return this._loadNextEncounterHeader();
  }
  
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
    return this._loadNextEncounterHeader();
  }
  
  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    
    const startOffset = this.offset;
    
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;
    
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER 
      ? new Date(tsNumber) 
      : new Date(NaN);
    
    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;
    
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
// UnitClassification Decoder - Decodes unit classification change events
// ============================================================================

/**
 * Reusable UnitClassification message object
 */
export interface ReusableUnitClassification {
  type: "unit_classification";
  index: number;
  offsetMilli: number;
  target: string;
  unitType: number;
  affiliation: number;
  owner: string | null;
  controller: string | null;
  spellId: number;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

/**
 * Zero-allocation UnitClassification decoder.
 * 
 * UnitClassification proto field numbers:
 *   1: meta (EventMeta)
 *   2: target (string)
 *   3: unitType (int32)
 *   4: affiliation (int32)
 *   5: owner (optional string)
 *   6: controller (optional string)
 *   7: spellId (int32)
 */
export class UnitClassificationDecoder {
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableUnitClassification = {
    type: "unit_classification",
    index: 0,
    offsetMilli: 0,
    target: "",
    unitType: 0,
    affiliation: 0,
    owner: null,
    controller: null,
    spellId: 0,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };
  
  /**
   * Decode a UnitClassification message into the reusable object.
   * Returns the same `this.message` reference, mutated.
   */
  decode(data: Uint8Array, offset: number, length: number): ReusableUnitClassification {
    const end = offset + length;
    const msg = this.message;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.target = "";
    msg.unitType = 0;
    msg.affiliation = 0;
    msg.owner = null;
    msg.controller = null;
    msg.spellId = 0;
    msg.activityCount = 0;
    msg.isSynthetic = false;
    
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 2) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 5) {
          msg.owner = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 6) {
          msg.controller = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        if (fieldNumber === 3) msg.unitType = value;
        else if (fieldNumber === 4) msg.affiliation = value;
        else if (fieldNumber === 7) msg.spellId = value;
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for UnitClassification events with zero-allocation decoding.
 */
export class FastUnitClassificationCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new UnitClassificationDecoder();
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
  
  next(): ReusableUnitClassification | null {
    if (!this.hasMoreInEncounter) return null;
    
    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;
    
    const msg = this.decoder.decode(this.data, msgStart, length);
    
    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;
    
    return msg;
  }
  
  nextEncounter(): boolean {
    while (this.hasMoreInEncounter) {
      this.next();
    }
    return this._loadNextEncounterHeader();
  }
  
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
    return this._loadNextEncounterHeader();
  }
  
  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    
    const startOffset = this.offset;
    
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;
    
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER 
      ? new Date(tsNumber) 
      : new Date(NaN);
    
    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;
    
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

export const DispelType = {
  None: 0,
  Magic: 1,
  Curse: 2,
  Disease: 3,
  Poison: 4,
  Stealth: 5,
  Invisibility: 6,
} as const;

export type DispelType = (typeof DispelType)[keyof typeof DispelType];

export interface ReusableDispel {
  type: "dispel";
  index: number;
  offsetMilli: number;
  caster: string;
  target: string;
  spellId: number | null;
  spellName: string;
  spellAttackOutcome: number | null;
  dispelType: DispelType;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

/**
 * Zero-allocation Dispel decoder.
 * 
 * Dispel proto field numbers:
 *   1: meta (EventMeta)
 *   2: caster (string)
 *   3: target (string)
 *   4: spellData (SpellData) - nested: 1=id, 2=name, 3=attack_outcome
 *   5: dispelType (DispelType enum)
 */
export class DispelDecoder {
  private readonly textDecoder = sharedTextDecoder;
  
  /** Reusable message - mutated on each decode */
  readonly message: ReusableDispel = {
    type: "dispel",
    index: 0,
    offsetMilli: 0,
    caster: "",
    target: "",
    spellId: null,
    spellName: "",
    spellAttackOutcome: null,
    dispelType: DispelType.None,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };
  
  decode(data: Uint8Array, offset: number, length: number): ReusableDispel {
    const end = offset + length;
    const msg = this.message;
    
    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.caster = "";
    msg.target = "";
    msg.spellId = null;
    msg.spellName = "";
    msg.spellAttackOutcome = null;
    msg.dispelType = DispelType.None;
    msg.activityCount = 0;
    msg.isSynthetic = false;
    
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;
              
              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";
              
              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;
                
                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 2) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 3) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 4) {
          // SpellData - decode nested
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;
            
            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) msg.spellId = value;
              else if (spellField === 3) msg.spellAttackOutcome = value;
            } else if (spellWire === 2) {
              const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
              offset += sLenBytes;
              if (spellField === 2) {
                msg.spellName = this.textDecoder.decode(data.subarray(offset, offset + sLen));
              }
              offset += sLen;
            }
          }
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        if (fieldNumber === 5) msg.dispelType = value as DispelType;
      }
    }
    
    return msg;
  }
}

/**
 * Fast cursor for Dispel events with zero-allocation decoding.
 */
export class FastDispelCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new DispelDecoder();
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
  
  next(): ReusableDispel | null {
    if (!this.hasMoreInEncounter) return null;
    
    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;
    
    const msg = this.decoder.decode(this.data, msgStart, length);
    
    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;
    
    return msg;
  }
  
  nextEncounter(): boolean {
    while (this.hasMoreInEncounter) {
      this.next();
    }
    return this._loadNextEncounterHeader();
  }
  
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
    return this._loadNextEncounterHeader();
  }
  
  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }
    
    const startOffset = this.offset;
    
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;
    
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER 
      ? new Date(tsNumber) 
      : new Date(NaN);
    
    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;
    
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
// ============================================================================
// Interrupt - Spell interrupt events
// ============================================================================

export const InterruptSchool = {
  Unknown: 0,
  None: 1,
  Physical: 2,
  Holy: 3,
  Fire: 4,
  Nature: 5,
  Frost: 6,
  Shadow: 7,
  Arcane: 8,
} as const;

export type InterruptSchool = (typeof InterruptSchool)[keyof typeof InterruptSchool];

export interface ReusableInterrupt {
  type: "interrupt";
  index: number;
  offsetMilli: number;
  caster: string;
  target: string;
  spellName: string;
  extraSpellId: number;
  extraSchool: InterruptSchool;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

/**
 * Zero-allocation Interrupt decoder.
 *
 * Interrupt proto field numbers:
 *   1: meta (EventMeta)
 *   2: caster (string)
 *   3: target (string)
 *   4: spell_name (string) — plain string, NOT nested SpellData
 *   5: extra_spell_id (int32 varint)
 *   6: extra_school (School enum varint)
 */
export class InterruptDecoder {
  private readonly textDecoder = sharedTextDecoder;

  /** Reusable message - mutated on each decode */
  readonly message: ReusableInterrupt = {
    type: "interrupt",
    index: 0,
    offsetMilli: 0,
    caster: "",
    target: "",
    spellName: "",
    extraSpellId: 0,
    extraSchool: InterruptSchool.Unknown,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };

  decode(data: Uint8Array, offset: number, length: number): ReusableInterrupt {
    const end = offset + length;
    const msg = this.message;

    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.caster = "";
    msg.target = "";
    msg.spellName = "";
    msg.extraSpellId = 0;
    msg.extraSchool = InterruptSchool.Unknown;
    msg.activityCount = 0;
    msg.isSynthetic = false;

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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;

              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";

              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;

                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 2) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 3) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 4) {
          // spell_name - plain string
          msg.spellName = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        if (fieldNumber === 5) msg.extraSpellId = value;
        else if (fieldNumber === 6) msg.extraSchool = value as InterruptSchool;
      }
    }

    return msg;
  }
}

/**
 * Fast cursor for Interrupt events with zero-allocation decoding.
 */
export class FastInterruptCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new InterruptDecoder();
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

  next(): ReusableInterrupt | null {
    if (!this.hasMoreInEncounter) return null;

    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;

    const msg = this.decoder.decode(this.data, msgStart, length);

    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;

    return msg;
  }

  nextEncounter(): boolean {
    // Skip remaining messages in current encounter
    while (this.hasMoreInEncounter) {
      const { value: length, bytesRead } = readVarint(this.data, this.offset);
      this.offset += bytesRead + length;
      this._bytesProcessed += bytesRead + length;
      this._messagesReadInEncounter++;
    }
    return this._loadNextEncounterHeader();
  }

  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
    return this._loadNextEncounterHeader();
  }

  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }

    const startOffset = this.offset;

    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;

    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER
      ? new Date(tsNumber)
      : new Date(NaN);

    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;

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
// Absorbed - Damage absorbed by shields (e.g. Power Word: Shield)
// ============================================================================

export interface ReusableAbsorbed {
  type: "absorbed";
  index: number;
  offsetMilli: number;
  attacker: string;
  target: string;
  damageSpellId: number | null;
  damageSpellName: string | null;
  caster: string;
  absorbSpellId: number | null;
  absorbSpellName: string | null;
  absorbSchool: number;
  amount: number;
  /** True when absorb attribution was synthetically inferred (e.g. vanilla logs). */
  estimated: boolean;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

/**
 * Zero-allocation Absorbed decoder.
 *
 * Absorbed proto field numbers:
 *   1: meta (EventMeta)
 *   2: attacker (string)
 *   3: target (string)
 *   4: damageSpellData (optional SpellData) — nested: 1=id, 2=name, 3=attack_outcome
 *   5: caster (string)
 *   6: absorbSpellData (optional SpellData) — nested: 1=id, 2=name, 3=attack_outcome
 *   7: absorbSchool (School enum varint)
 *   8: amount (int32 varint)
 *   9: estimated (bool varint)
 */
export class AbsorbedDecoder {
  private readonly textDecoder = sharedTextDecoder;

  /** Reusable message - mutated on each decode */
  readonly message: ReusableAbsorbed = {
    type: "absorbed",
    index: 0,
    offsetMilli: 0,
    attacker: "",
    target: "",
    damageSpellId: null,
    damageSpellName: null,
    caster: "",
    absorbSpellId: null,
    absorbSpellName: null,
    absorbSchool: 0,
    amount: 0,
    estimated: false,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };

  decode(data: Uint8Array, offset: number, length: number): ReusableAbsorbed {
    const end = offset + length;
    const msg = this.message;

    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.attacker = "";
    msg.target = "";
    msg.damageSpellId = null;
    msg.damageSpellName = null;
    msg.caster = "";
    msg.absorbSpellId = null;
    msg.absorbSpellName = null;
    msg.absorbSchool = 0;
    msg.amount = 0;
    msg.estimated = false;
    msg.activityCount = 0;
    msg.isSynthetic = false;

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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;

              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";

              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;

                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 2) {
          msg.attacker = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 3) {
          msg.target = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 4) {
          // damageSpellData - decode nested SpellData
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;

            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) msg.damageSpellId = value;
            } else if (spellWire === 2) {
              const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
              offset += sLenBytes;
              if (spellField === 2) {
                msg.damageSpellName = this.textDecoder.decode(data.subarray(offset, offset + sLen));
              }
              offset += sLen;
            }
          }
        } else if (fieldNumber === 5) {
          msg.caster = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 6) {
          // absorbSpellData - decode nested SpellData
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;

            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) msg.absorbSpellId = value;
            } else if (spellWire === 2) {
              const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
              offset += sLenBytes;
              if (spellField === 2) {
                msg.absorbSpellName = this.textDecoder.decode(data.subarray(offset, offset + sLen));
              }
              offset += sLen;
            }
          }
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        // Varint
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        if (fieldNumber === 7) msg.absorbSchool = value;
        else if (fieldNumber === 8) msg.amount = value;
        else if (fieldNumber === 9) msg.estimated = value !== 0;
      }
    }

    return msg;
  }
}

/**
 * Fast cursor for Absorbed events with zero-allocation decoding.
 */
export class FastAbsorbedCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new AbsorbedDecoder();
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

  next(): ReusableAbsorbed | null {
    if (!this.hasMoreInEncounter) return null;

    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;

    const msg = this.decoder.decode(this.data, msgStart, length);

    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;

    return msg;
  }

  nextEncounter(): boolean {
    while (this.hasMoreInEncounter) {
      const { value: length, bytesRead } = readVarint(this.data, this.offset);
      this.offset += bytesRead + length;
      this._bytesProcessed += bytesRead + length;
      this._messagesReadInEncounter++;
    }
    return this._loadNextEncounterHeader();
  }

  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
    return this._loadNextEncounterHeader();
  }

  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }

    const startOffset = this.offset;

    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;

    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER
      ? new Date(tsNumber)
      : new Date(NaN);

    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;

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

// CombatantInfo - Per-encounter gear/talent snapshots
// ============================================================================

export interface ReusableCombatantGearSlot {
  itemId: number;
  enchantId: number | null;
  temporaryEnchantId: number | null;
}

export interface ReusableCombatantTalents {
  summary: number[];
  trees: string[];
}

export interface ReusableCombatantInfo {
  type: "combatant_info";
  index: number;
  offsetMilli: number;
  guid: string;
  name: string;
  heroClass: string;
  race: string;
  gender: number;
  guildName: string | null;
  gear: ReusableCombatantGearSlot[];
  gearCount: number;
  talents: ReusableCombatantTalents | null;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

/**
 * Zero-allocation CombatantInfo decoder.
 *
 * CombatantInfo proto field numbers:
 *   1: meta (EventMeta)
 *   2: guid (string)
 *   3: name (string)
 *   4: heroClass (int32)
 *   5: race (int32)
 *   6: gender (int32)
 *   7: guildName (optional string)
 *   8: gear (repeated CombatantGearSlot)
 *   9: talents (optional CombatantTalents)
 */
export class CombatantInfoDecoder {
  private readonly textDecoder = sharedTextDecoder;

  /** Reusable message - mutated on each decode */
  readonly message: ReusableCombatantInfo = {
    type: "combatant_info",
    index: 0,
    offsetMilli: 0,
    guid: "",
    name: "",
    heroClass: "",
    race: "",
    gender: 0,
    guildName: null,
    gear: [],
    gearCount: 0,
    talents: null,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };

  decode(data: Uint8Array, offset: number, length: number): ReusableCombatantInfo {
    const end = offset + length;
    const msg = this.message;

    // Reset
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.guid = "";
    msg.name = "";
    msg.heroClass = "";
    msg.race = "";
    msg.gender = 0;
    msg.guildName = null;
    msg.gearCount = 0;
    msg.talents = null;
    msg.activityCount = 0;
    msg.isSynthetic = false;

    while (offset < end) {
      const tag = data[offset++];
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;

      if (wireType === 2) {
        // Length-delimited
        const { value: len, bytesRead: lenBytes } = readVarintFast(data, offset);
        offset += lenBytes;

        if (fieldNumber === 1) {
          // EventMeta
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
              else if (metaField === 4) msg.isSynthetic = value !== 0;
            } else if (metaWire === 2 && metaField === 3) {
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;

              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";

              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;

                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 2) {
          msg.guid = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 3) {
          msg.name = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 4) {
          msg.heroClass = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 5) {
          msg.race = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 7) {
          msg.guildName = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 8) {
          // CombatantGearSlot (repeated)
          if (msg.gearCount >= msg.gear.length) {
            msg.gear.push({ itemId: 0, enchantId: null, temporaryEnchantId: null });
          }
          const slot = msg.gear[msg.gearCount];
          slot.itemId = 0;
          slot.enchantId = null;
          slot.temporaryEnchantId = null;

          const slotEnd = offset + len;
          while (offset < slotEnd) {
            const slotTag = data[offset++];
            const slotField = slotTag >> 3;
            const slotWire = slotTag & 0x7;

            if (slotWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (slotField === 1) slot.itemId = value;
              else if (slotField === 2) slot.enchantId = value;
              else if (slotField === 3) slot.temporaryEnchantId = value;
            }
          }
          msg.gearCount++;
        } else if (fieldNumber === 9) {
          // CombatantTalents
          const talentsEnd = offset + len;
          const summary: number[] = [];
          const trees: string[] = [];
          while (offset < talentsEnd) {
            const tTag = data[offset++];
            const tField = tTag >> 3;
            const tWire = tTag & 0x7;

            if (tWire === 0 && tField === 1) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              summary.push(value);
            } else if (tWire === 2 && tField === 1) {
              // packed repeated int32
              const { value: packedLen, bytesRead: packedLenBytes } = readVarintFast(data, offset);
              offset += packedLenBytes;
              const packedEnd = offset + packedLen;
              while (offset < packedEnd) {
                const { value, bytesRead } = readVarintFast(data, offset);
                offset += bytesRead;
                summary.push(value);
              }
            } else if (tWire === 2 && tField === 2) {
              // string: rank digits for one tree tab
              const { value: strLen, bytesRead: strLenBytes } = readVarintFast(data, offset);
              offset += strLenBytes;
              trees.push(this.textDecoder.decode(data.subarray(offset, offset + strLen)));
              offset += strLen;
            } else if (tWire === 2) {
              const { value: skipLen, bytesRead: skipLenBytes } = readVarintFast(data, offset);
              offset += skipLenBytes + skipLen;
            } else if (tWire === 0) {
              const { bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
            }
          }
          msg.talents = { summary, trees };
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        if (fieldNumber === 6) msg.gender = value;
      }
    }

    return msg;
  }
}

/**
 * Fast cursor for CombatantInfo events with zero-allocation decoding.
 */
export class FastCombatantInfoCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new CombatantInfoDecoder();
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

  next(): ReusableCombatantInfo | null {
    if (!this._currentHeader) return null;
    if (this._messagesReadInEncounter >= this._currentHeader.count) return null;

    const { value: msgLen, bytesRead: msgLenBytes } = readVarint(this.data, this.offset);
    this.offset += msgLenBytes;

    const msg = this.decoder.decode(this.data, this.offset, msgLen);
    this.offset += msgLen;
    this._messagesReadInEncounter++;
    this._bytesProcessed += msgLenBytes + msgLen;

    return msg;
  }

  /** Alias for nextEncounter – matches the interface used by other cursors. */
  skipEncounter(): boolean {
    return this.nextEncounter();
  }

  nextEncounter(): boolean {
    // Skip remaining messages in current encounter
    while (this.hasMoreInEncounter) {
      const { value: msgLen, bytesRead: msgLenBytes } = readVarint(this.data, this.offset);
      this.offset += msgLenBytes + msgLen;
      this._messagesReadInEncounter++;
      this._bytesProcessed += msgLenBytes + msgLen;
    }

    return this._loadNextEncounterHeader();
  }

  private _loadNextEncounterHeader(): boolean {
    if (this.offset >= this.data.length) {
      this._currentHeader = null;
      return false;
    }

    const startOffset = this.offset;

    // Read encounterID (varint-length-prefixed string)
    const { value: strLen, bytesRead: strLenBytes } = readVarint(this.data, this.offset);
    this.offset += strLenBytes;
    const encounterID = sharedTextDecoder.decode(this.data.subarray(this.offset, this.offset + strLen));
    this.offset += strLen;

    // Read timestamp (varint64, milliseconds since epoch)
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(this.data, this.offset);
    this.offset += tsBytes;
    const tsNumber = Number(timestampMs);
    const firstTimestamp = tsNumber >= 0 && tsNumber < Number.MAX_SAFE_INTEGER
      ? new Date(tsNumber)
      : new Date(NaN);

    const { value: count, bytesRead: countBytes } = readVarint(this.data, this.offset);
    this.offset += countBytes;

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
  
  /**
   * Skip to the next encounter without decoding events.
   * Uses dataLength from header to jump directly.
   */
  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    
    // If we've already read some messages, fall back to nextEncounter
    // since we can't easily calculate remaining bytes
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    
    // Jump past all message data in this encounter
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
    
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
// Consume decoder + cursor
// ============================================================================

export interface ReusableConsumeSpell {
  id: number;
  name: string;
}

/**
 * Reusable Consume message object
 */
export interface ReusableConsume {
  type: "consume";
  index: number;
  offsetMilli: number;
  consumeId: string;
  evidenceId: string;
  player: string;
  itemId: number | null;
  itemName: string | null;
  candidateItemIds: number[];
  candidateItemIdsCount: number;
  spell: ReusableConsumeSpell;
  kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // EvidenceKind enum
  confidence: 0 | 1 | 2 | 3 | 4;          // EvidenceConfidence enum
  consumedAtUnixMilli: number | null;
  observedAtUnixMilli: number;
  amount: number | null;
  resourceType: string | null;
  isProjection: boolean;
  activity: ReusableActivityEntry[];
  activityCount: number;
  isSynthetic: boolean;
}

/**
 * Zero-allocation Consume decoder.
 *
 * Consume proto field numbers:
 *   1: meta (EventMeta)
 *   2: consumeId (string)
 *   3: evidenceId (string)
 *   4: player (string)
 *   5: itemId (optional int32)
 *   6: candidateItemIds (repeated int32, packed)
 *   7: spellData (SpellData)
 *   8: kind (EvidenceKind enum)
 *   9: confidence (EvidenceConfidence enum)
 *   10: consumedAtUnixMilli (optional int64)
 *   11: observedAtUnixMilli (int64)
 *   12: amount (optional int32)
 *   13: resourceType (optional string)
 *   14: isProjection (bool)
 *   15: itemName (optional string)
 */
function readInt64Number(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  const decoded = readVarint64(data, offset);
  return {
    value: Number(BigInt.asIntN(64, decoded.value)),
    bytesRead: decoded.bytesRead,
  };
}

export class ConsumeDecoder {
  private readonly textDecoder = sharedTextDecoder;

  private readonly reusableSpell: ReusableConsumeSpell = {
    id: 0,
    name: "",
  };

  readonly message: ReusableConsume = {
    type: "consume",
    index: 0,
    offsetMilli: 0,
    consumeId: "",
    evidenceId: "",
    player: "",
    itemId: null,
    itemName: null,
    candidateItemIds: [],
    candidateItemIdsCount: 0,
    spell: this.reusableSpell,
    kind: 0,
    confidence: 0,
    consumedAtUnixMilli: null,
    observedAtUnixMilli: 0,
    amount: null,
    resourceType: null,
    isProjection: false,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };

  decode(data: Uint8Array, offset: number, length: number): ReusableConsume {
    const end = offset + length;
    const msg = this.message;
    const spell = this.reusableSpell;

    // Reset fields
    msg.index = 0;
    msg.offsetMilli = 0;
    msg.consumeId = "";
    msg.evidenceId = "";
    msg.player = "";
    msg.itemId = null;
    msg.itemName = null;
    msg.candidateItemIdsCount = 0;
    spell.id = 0;
    spell.name = "";
    msg.kind = 0;
    msg.confidence = 0;
    msg.consumedAtUnixMilli = null;
    msg.observedAtUnixMilli = 0;
    msg.amount = null;
    msg.resourceType = null;
    msg.isProjection = false;
    msg.activityCount = 0;
    msg.isSynthetic = false;

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
              if (metaField === 2) {
                const { value, bytesRead } = readInt64Number(data, offset);
                offset += bytesRead;
                msg.offsetMilli = value;
              } else {
                const { value, bytesRead } = readVarintFast(data, offset);
                offset += bytesRead;
                if (metaField === 1) msg.index = value;
                else if (metaField === 4) msg.isSynthetic = value !== 0;
              }
            } else if (metaWire === 2 && metaField === 3) {
              // ActivityEntry - decode nested repeated message
              const { value: actLen, bytesRead: actLenBytes } = readVarintFast(data, offset);
              offset += actLenBytes;

              if (msg.activityCount >= msg.activity.length) {
                msg.activity.push({ guid: "", eventType: "" });
              }
              const entry = msg.activity[msg.activityCount];
              entry.guid = "";
              entry.eventType = "";

              const actEnd = offset + actLen;
              while (offset < actEnd) {
                const actTag = data[offset++];
                const actField = actTag >> 3;
                const actWire = actTag & 0x7;

                if (actWire === 2) {
                  const { value: sLen, bytesRead: sLenBytes } = readVarintFast(data, offset);
                  offset += sLenBytes;
                  if (actField === 1) entry.guid = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  else if (actField === 2) entry.eventType = this.textDecoder.decode(data.subarray(offset, offset + sLen));
                  offset += sLen;
                }
              }
              msg.activityCount++;
            }
          }
        } else if (fieldNumber === 2) {
          msg.consumeId = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 3) {
          msg.evidenceId = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 4) {
          msg.player = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 6) {
          // Packed repeated int32 - candidateItemIds
          const packedEnd = offset + len;
          while (offset < packedEnd) {
            const { value, bytesRead } = readVarintFast(data, offset);
            offset += bytesRead;
            if (msg.candidateItemIdsCount >= msg.candidateItemIds.length) {
              msg.candidateItemIds.push(0);
            }
            msg.candidateItemIds[msg.candidateItemIdsCount] = value;
            msg.candidateItemIdsCount++;
          }
        } else if (fieldNumber === 7) {
          // SpellData - decode nested (1=id, 2=name)
          const spellEnd = offset + len;
          while (offset < spellEnd) {
            const spellTag = data[offset++];
            const spellField = spellTag >> 3;
            const spellWire = spellTag & 0x7;

            if (spellWire === 0) {
              const { value, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 1) spell.id = value;
            } else if (spellWire === 2) {
              const { value: spellLen, bytesRead } = readVarintFast(data, offset);
              offset += bytesRead;
              if (spellField === 2) {
                spell.name = this.textDecoder.decode(data.subarray(offset, offset + spellLen));
              }
              offset += spellLen;
            }
          }
        } else if (fieldNumber === 13) {
          // resourceType (optional string)
          msg.resourceType = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else if (fieldNumber === 15) {
          // itemName (optional string)
          msg.itemName = this.textDecoder.decode(data.subarray(offset, offset + len));
          offset += len;
        } else {
          offset += len;
        }
      } else if (wireType === 0) {
        // int64 timestamps need the full varint width; the remaining fields fit
        // in 32 bits and use the faster decoder.
        if (fieldNumber === 10 || fieldNumber === 11) {
          const { value, bytesRead } = readInt64Number(data, offset);
          offset += bytesRead;
          if (fieldNumber === 10) msg.consumedAtUnixMilli = value;
          else msg.observedAtUnixMilli = value;
          continue;
        }

        const { value, bytesRead } = readVarintFast(data, offset);
        offset += bytesRead;
        if (fieldNumber === 5) msg.itemId = value;
        else if (fieldNumber === 6) {
          // Non-packed repeated int32 (individual element)
          if (msg.candidateItemIdsCount >= msg.candidateItemIds.length) {
            msg.candidateItemIds.push(0);
          }
          msg.candidateItemIds[msg.candidateItemIdsCount] = value;
          msg.candidateItemIdsCount++;
        }
        else if (fieldNumber === 8) msg.kind = value as ReusableConsume["kind"];
        else if (fieldNumber === 9) msg.confidence = value as ReusableConsume["confidence"];
        else if (fieldNumber === 12) msg.amount = value;
        else if (fieldNumber === 14) msg.isProjection = value !== 0;
      }
    }

    return msg;
  }
}

/**
 * Fast cursor for Consume events with zero-allocation decoding.
 */
export class FastConsumeCursor {
  private readonly data: Uint8Array;
  private readonly decoder = new ConsumeDecoder();
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

  next(): ReusableConsume | null {
    if (!this.hasMoreInEncounter) return null;

    const { value: length, bytesRead } = readVarint(this.data, this.offset);
    const msgStart = this.offset + bytesRead;

    const msg = this.decoder.decode(this.data, msgStart, length);

    this.offset = msgStart + length;
    this._bytesProcessed += bytesRead + length;
    this._messagesReadInEncounter++;

    return msg;
  }

  nextEncounter(): boolean {
    while (this.hasMoreInEncounter) {
      this.next();
    }
    return this._loadNextEncounterHeader();
  }

  skipEncounter(): boolean {
    if (!this._currentHeader) return false;
    if (this._messagesReadInEncounter > 0) {
      return this.nextEncounter();
    }
    this.offset += this._currentHeader.dataLength;
    this._bytesProcessed += this._currentHeader.dataLength;
    this._currentHeader = null;
    this._messagesReadInEncounter = 0;
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
    const { value: dataLength, bytesRead: dlBytes } = readVarint(this.data, this.offset);
    this.offset += dlBytes;

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
