---
name: frontend-data-flow
description: Chronicle frontend data flow uses React Query for REST API calls and protobuf for high-volume event streams. Types are auto-generated from Go SDK via guts. Event streams are fetched as gzip-compressed binary, decoded in workers, and cached per-instance. The InstanceEventsContext provides stream caching and deduplication.
---
# Frontend Data Flow

Chronicle's frontend handles two distinct data patterns:
1. **REST API** → JSON via React Query (metadata, user data, CRUD)
2. **Event Streams** → Protobuf binary via custom hooks (combat log events)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend Data Sources                        │
├──────────────────────────────┬──────────────────────────────────────┤
│      REST API (JSON)         │       Event Streams (Protobuf)       │
│                              │                                      │
│  typesGenerated.ts           │  chronicle_pb.ts                     │
│  (Go → TypeScript via guts)  │  (protoc-gen-es from .proto)         │
│         │                    │         │                            │
│         ▼                    │         ▼                            │
│  queries.ts                  │  decode.ts                           │
│  (React Query hooks)         │  (varint + protobuf decoding)        │
│         │                    │         │                            │
│         ▼                    │         ▼                            │
│  useQuery/useMutation        │  InstanceEventsContext               │
│         │                    │  (caching + deduplication)           │
│         │                    │         │                            │
│         │                    │         ▼                            │
│         │                    │  useInstanceEvents / usePanelAggregation
│         │                    │  (event processing in Web Workers)   │
│         ▼                    │         ▼                            │
│      Components              │      EventsPanels                    │
└──────────────────────────────┴──────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `src/api/typesGenerated.ts` | Auto-generated TypeScript types from Go SDK |
| `src/api/queries.ts` | React Query hooks for REST API |
| `src/api/proto/chronicle_pb.ts` | Protobuf message types (auto-generated) |
| `src/api/protodecode/decode.ts` | Binary decoding utilities |
| `src/hooks/instanceEvents/InstanceEventsContext.tsx` | Stream caching provider |
| `src/hooks/instanceEvents/useInstanceEvents.ts` | Event stream processing hook |
| `src/hooks/instanceEvents/types.ts` | Stream type definitions |

---

## Part 1: REST API Data (React Query)

### Type Generation

Types are generated from Go SDK structs using [guts](https://github.com/coder/guts):

```bash
# Regenerate types
go run -C ./scripts/apitypings main.go > frontend/chronicle/src/api/typesGenerated.ts
```

Source packages:
- `github.com/Emyrk/chronicle/api/chroniclesdk` → direct types
- `github.com/riverqueue/river/rivertype` → River job types (prefixed with `River`)

### React Query Hooks

All REST API calls use `@tanstack/react-query`:

```typescript
// src/api/queries.ts

// Query hook pattern
export function useLogGroup(logId: string, options?: ...) {
  return useQuery({
    queryKey: ["logGroup", logId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/logs/${logId}`);
      if (!response.ok) throw new Error("Failed to fetch log details");
      return response.json() as Promise<WoWLogGroupState>;
    },
    ...options,
  });
}

// Mutation hook pattern
export function useDeleteLogGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (logId: string) => {
      const response = await fetch(`/api/v1/raidlogs/logs/${logId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete log");
      return logId;
    },
    onSuccess: (logId) => {
      queryClient.invalidateQueries({ queryKey: ["logGroups"] });
      queryClient.removeQueries({ queryKey: ["logGroup", logId] });
    },
  });
}
```

### Query Keys Convention

```typescript
["whoami"]                    // Session check
["session"]                   // Session data
["logGroups"]                 // All user's log groups
["logGroup", logId]           // Single log group
["instance", instanceId]      // Instance metadata
["instanceYoutube", instanceId]  // YouTube sync data
["admin", "users"]            // Admin user list
["admin", "logs"]             // Admin log list
```

### Adding a New API Hook

1. Add response type to Go SDK (`api/chroniclesdk/`)
2. Run `make gen` to regenerate TypeScript types
3. Add hook to `queries.ts`:

```typescript
export function useMyData(id: string, options?: Omit<UseQueryOptions<MyDataType>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["myData", id],
    queryFn: async () => {
      const response = await fetch(`/api/v1/my-endpoint/${id}`);
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json() as Promise<MyDataType>;
    },
    retry: false,  // Disable retry for auth-sensitive endpoints
    ...options,
  });
}
```

---

## Part 2: Event Streams (Protobuf)

High-volume combat log events are served as gzip-compressed protobuf binary for performance.

### Stream Types

```typescript
// src/hooks/instanceEvents/types.ts
export type StreamType = 
  | "damage"          // DamageSchema
  | "extra_attack"    // ExtraAttackSchema
  | "heal"            // HealSchema
  | "resource_change" // ResourceChangeSchema
  | "slain"           // SlainSchema
  | "cast"            // CastSchema
  | "aura";           // AuraSchema
```

### Wire Format

Each stream endpoint returns concatenated encounter payloads:

```
┌─────────────────────────────────────────────────────────┐
│                    Encounter Payload                     │
├─────────────────────────────────────────────────────────┤
│ [varint] encounterID string length                      │
│ [bytes]  encounterID string                             │
│ [varint] firstTimestamp (milliseconds since epoch)      │
│ [varint] event count                                    │
│ [varint] data length (bytes of messages)                │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [varint] message 1 length                           │ │
│ │ [bytes]  protobuf message 1                         │ │
│ │ [varint] message 2 length                           │ │
│ │ [bytes]  protobuf message 2                         │ │
│ │ ...                                                 │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│              Next Encounter Payload...                   │
└─────────────────────────────────────────────────────────┘
```

### Decoding Functions

```typescript
// src/api/protodecode/decode.ts

// Check for gzip compression
function isGzipped(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

// Decompress using native API
async function decompressGzip(data: Uint8Array): Promise<Uint8Array>

// Decode single encounter
function decodePayload<T>(schema: DescMessage, data: Uint8Array): DecodedPayload<T>

// Decode all encounters from stream
function decodeAllPayloads<T>(schema: DescMessage, data: Uint8Array): DecodedPayload<T>[]
```

### InstanceEventsContext

Provides stream caching and deduplication at the instance level:

```typescript
// src/hooks/instanceEvents/InstanceEventsContext.tsx

export function InstanceEventsProvider({ instanceId, children }) {
  // Cache persists for lifetime of provider
  const cacheRef = useRef<Map<StreamType, CachedStream>>(new Map());
  
  // Deduplicates concurrent fetches
  const fetchingRef = useRef<Map<StreamType, Promise<CachedStream>>>(new Map());
  
  const fetchStream = useCallback(async (type: StreamType) => {
    // Return cached if available
    const cached = cacheRef.current.get(type);
    if (cached) return cached;
    
    // Return in-flight promise if already fetching
    const inFlight = fetchingRef.current.get(type);
    if (inFlight) return inFlight;
    
    // Fetch, decompress, parse headers, cache
    // ...
  }, [instanceId]);
  
  // Clear cache when instanceId changes
  if (prevInstanceIdRef.current !== instanceId) {
    cacheRef.current.clear();
  }
}
```

### CachedStream Structure

```typescript
interface CachedStream {
  data: Uint8Array;           // Raw decompressed data
  headers: PayloadHeader[];   // Parsed headers for all encounters
}

interface PayloadHeader {
  encounterID: string;
  firstTimestamp: Date;
  count: number;              // Number of events
  dataLength: number;         // Bytes of message data
}
```

### useInstanceEvents Hook

Processes streams and iterates events in index order:

```typescript
function useInstanceEvents<T>(options: {
  streams: StreamType[];
  onEvent: (event: T, streamType: StreamType, encounterID: string) => void;
  onEncounterComplete?: (encounterID: string) => void;
  deps?: unknown[];
  benchmark?: boolean;
}): {
  loading: boolean;
  processing: boolean;
  error: Error | null;
  encounterProgress: EncounterProgress | null;
  bytesProcessed: number;
  bytesTotal: number;
}
```

**Key behaviors:**
- Fetches requested streams (deduplicates via context)
- Uses cursor-based iteration for memory efficiency
- Interleaves events across streams by index
- Calls `onEncounterComplete` after each encounter
- Fast path optimization for single damage stream

### Protobuf Schema Mapping

```typescript
function getSchemaForType(type: StreamType): DescMessage {
  switch (type) {
    case "damage": return DamageSchema;
    case "extra_attack": return ExtraAttackSchema;
    case "heal": return HealSchema;
    case "resource_change": return ResourceChangeSchema;
    case "slain": return SlainSchema;
    case "cast": return CastSchema;
    case "aura": return AuraSchema;
  }
}
```

---

## Caching Strategy

| Layer | What's Cached | Lifetime | Invalidation |
|-------|--------------|----------|--------------|
| React Query | REST API responses | Configurable per-query | `invalidateQueries()` |
| InstanceEventsContext | Stream binary data | Instance mount lifetime | Instance ID change |
| Component state | Aggregated results | Re-render cycle | Deps change |

### React Query Cache Settings

```typescript
// Long-lived data (rarely changes)
staleTime: 1000 * 60 * 60,  // 1 hour

// Auth-sensitive data
retry: false,  // Don't retry on 401/403
```

---

## Adding a New Event Stream

1. **Add protobuf message** in `chronicle.proto`:
   ```protobuf
   message MyEvent {
     EventMeta meta = 1;
     string data = 2;
   }
   ```

2. **Regenerate proto types**:
   ```bash
   make gen
   ```

3. **Add stream type** in `types.ts`:
   ```typescript
   export type StreamType = "damage" | ... | "my_event";
   ```

4. **Add schema mapping** in `useInstanceEvents.ts`:
   ```typescript
   case "my_event": return MyEventSchema;
   ```

5. **Add API endpoint** in backend (`api/api.go`)

---

## Performance Considerations

### Binary vs JSON

Event streams use protobuf because:
- 5-10x smaller than JSON
- Faster parsing (no string processing)
- Type-safe decoding

### Stream Caching

- Multiple panels requesting same stream share cached data
- Fetch happens once per stream per instance
- Headers parsed once on cache, available without full decode

### Web Worker Processing

EventsPanels process events in a Web Worker:
- Keeps UI responsive during heavy aggregation
- Results serialized back (Maps become arrays)
- See `src/pages/Instance/EventsPanels/DESIGN.md`

### Memory Management

```typescript
// Cursor-based iteration - don't store references
const cursor = createStreamCursor(schema, data);
while (cursor.hasMoreInEncounter) {
  const msg = cursor.peek();  // Don't keep reference!
  // Process msg immediately
  cursor.advance();
}
```
