# EventsPanels Design

This directory contains the event aggregation panel system for displaying combat log metrics.

## Overview

EventsPanels process raw combat log event streams (damage, heal, resource_change, slain, cast, aura, extra_attack) and aggregate them into displayable metrics. Each panel type defines its own aggregation logic and rendering, allowing for different result types and visualizations.

**Key feature:** Event processing runs in a Web Worker pool to keep the UI responsive.

## Architecture

```
EventsPanels/
├── types.ts               # React-side type definitions (PanelContext, PanelDefinition)
├── processorTypes.ts      # Worker-safe types (ProcessorContext, PanelProcessor, ProcessorEvent)
├── panelWorker.ts         # Web Worker that runs processEvent
├── workerPool.ts          # Worker pool manager (reuses workers across panels)
├── usePanelAggregation.ts # Hook that manages worker lifecycle
├── EventsPanel.tsx        # Container component with panel selector
├── PanelSelector.tsx      # Dropdown with categories and fuzzy search
├── PanelTimingContext.tsx # Performance timing for panels
├── GenericPanel.tsx       # Shared loading/error wrapper + stats footer
├── EntityValueList.tsx    # Simple list renderer for Map<string, number>
├── processors/            # Shared processors and utilities
│   ├── index.ts           # Registry of all processors (processorRegistry)
│   ├── guidCache.ts       # GUID parsing cache for performance
│   ├── abilityBreakout.ts # Shared ability breakout accumulation
│   ├── healing.processor.ts      # Unified healing processor
│   ├── mitigation.processor.ts   # Damage mitigation
│   ├── avoidance.processor.ts    # Avoidance stats
│   └── allActivityDebug.processor.ts
├── DamageDone/            # Panel with processor in same directory
│   ├── damageDone.processor.ts
│   ├── DamageDone.tsx
│   ├── DamageDoneContent.tsx
│   └── DamageDoneBreakout.tsx
├── DamageTaken/           # Similar structure...
├── HealingDone/
├── HealingTaken/
├── Deaths/
├── ExtraAttacks/
├── ResourceRegen/
├── Mitigation/
├── Roles/
├── Innervate/             # Class-specific panels
├── Empty/
└── index.ts               # Public exports
```

## Worker Architecture

```
Main Thread                          Web Worker
─────────────                        ──────────
                                     
usePanelAggregation                  panelWorker.ts
  │                                    │
  ├─ Fetch streams (cached)            │
  ├─ Create Worker ─────────────────►  │
  ├─ postMessage(WorkerRequest) ────►  ├─ processorRegistry[panelId]
  │                                    ├─ Iterate all events
  │                                    ├─ Call processor.processEvent()
  │  ◄─── postMessage(WorkerResponse)  ├─ Serialize result (Map → Array)
  ├─ Deserialize result                │
  ├─ setResult(state)                  │
  └─ Terminate worker on cleanup       │
```

**Cancellation:** When context changes mid-processing, the current worker is terminated
and a new one is started. Stale responses are ignored via `requestId` matching.

## Key Types

### EntitySelection & PanelContext

Context available to panels for filtering and rendering:

```typescript
interface EntitySelection {
  enemyIds: Set<string>;   // Selected enemy GUIDs
  playerIds: Set<string>;  // Selected player GUIDs
}

interface PanelContext {
  instance: Instance;              // Full instance data (players, encounters, metadata)
  selectedEncounterIds: string[];  // IDs of selected encounters
  entitySelection: EntitySelection; // Selected entities for filtering
  onSelectEncounters?: (ids: string[]) => void;  // Callback to select encounters
  onTogglePlayer?: (id: string) => void;         // Callback to toggle player selection
  pagination?: ProcessorPagination;              // For paginated panels
}
```

### PanelProcessor<TResult, TEvent> (Worker-safe)

The processor interface that runs in the Web Worker:

```typescript
interface PanelProcessor<TResult, TEvent extends ProcessorEvent = ProcessorEvent> {
  id: string;                    // Unique identifier
  streams: StreamType[];         // Required streams (see StreamType below)
  
  createState: () => TResult;    // Initialize aggregation state
  
  processEvent: (              // Called for each event in the worker
    state: TResult,
    event: TEvent,               // Typed event based on stream
    encounterID: string,
    firstTimestamp: Date,        // First timestamp of encounter
    streamType: StreamType,
    context: ProcessorContext,   // Serializable context
  ) => void;
}

// Available stream types
type StreamType = "damage" | "heal" | "resource_change" | "slain" | "cast" | "aura" | "extra_attack";
```

### PanelDefinition<TResult> (React wrapper)

Extends processor with React-specific properties:

```typescript
interface PanelDefinition<TResult, TEvent> extends PanelProcessor<TResult, TEvent> {
  label: string;                 // Display name
  icon: React.ReactNode;         // Icon component
  
  supportsPerSecond?: boolean;   // Show per-second toggle checkbox
  checkboxLabel?: string;        // Custom checkbox label (default: "Per second")
  selfManagesAggregation?: boolean; // Panel handles its own data loading
  
  render: (props: PanelRenderProps<TResult>) => React.ReactNode;
}
```

### PanelRenderProps<TResult>

Props passed to the panel's render function:

```typescript
interface PanelRenderProps<TResult> {
  result: TResult;              // Aggregated state
  totalEvents: number;          // Events processed
  processingTimeMs: number | null;
  durationMs: number;           // Encounter duration
  perSecond: boolean;           // User toggle for /s display
  checkboxChecked: boolean;     // Generic checkbox state (same as perSecond)
  loading: boolean;
  processing: boolean;
  error: Error | null;
  context: PanelContext;        // Full context for rendering
}
```

### ProcessorEvent Types

Events are typed based on the stream they come from:

```typescript
type ProcessorEvent = 
  | DamageProcessorEvent      // { type: "damage", caster, target, amount, hitType, school, tailers, ... }
  | HealProcessorEvent        // { type: "heal", caster, target, amount, hitType, school }
  | ResourceChangeProcessorEvent  // { type: "resource_change", caster, target, amount, resourceType, direction }
  | ExtraAttackProcessorEvent     // { type: "extra_attack", target, amount, sourceName }
  | SlainProcessorEvent       // { type: "slain", target, caster, attribution }
  | CastProcessorEvent        // { type: "cast", caster, target, action, spell }
  | AuraProcessorEvent;       // { type: "aura", target, spellName, amount, application }

// All events have common metadata:
interface EventMeta {
  index: number;        // Event index in stream
  offsetMilli: number;  // Time offset from encounter start
}
```

## Data Flow

1. **EventsPanel** receives `context` (PanelContext) and `panelType`
2. **usePanelAggregation** hook:
   - Fetches required streams from `InstanceEventsContext` (cached)
   - Creates a Web Worker
   - Sends streams + serialized context to worker
   - Worker iterates all events, calls `processor.processEvent()`
   - Worker returns serialized result
   - Hook deserializes result (Map reconstruction)
3. **panel.render()** displays the result on main thread

## Adding a New Panel

Panels are split into two files: a **processor** (worker-safe) and a **React wrapper**.

### Step 1: Create the processor

Create `MyPanel/myPanel.processor.ts` (or `processors/myPanel.processor.ts` for shared processors):

```typescript
// Pure TypeScript - NO React, NO JSX (runs in Web Worker)
import type { PanelProcessor, ProcessorContext, HealProcessorEvent } from "../processorTypes";

export interface MyPanelResult {
  data: Map<string, number>;
  // Use Maps for aggregated data - they serialize automatically
}

export const myPanelProcessor: PanelProcessor<MyPanelResult, HealProcessorEvent> = {
  id: "my_panel",
  streams: ["heal"],  // Request the streams you need
  
  createState: (): MyPanelResult => ({
    data: new Map(),
  }),
  
  processEvent: (state, event, encounterID, firstTimestamp, streamType, context) => {
    // Filter by selected encounters
    if (!context.selectedEncounterIds.has(encounterID)) return;
    
    // Filter by selected players if any are selected
    if (context.entitySelection.playerIds.size > 0) {
      if (!context.entitySelection.playerIds.has(event.caster)) return;
    }
    
    // Accumulate data
    const key = event.caster || "Unknown";
    state.data.set(key, (state.data.get(key) || 0) + event.amount);
  },
};
```

### Step 2: Register the processor (`processors/index.ts`)

```typescript
import { myPanelProcessor } from "../MyPanel/myPanel.processor";

export { myPanelProcessor } from "../MyPanel/myPanel.processor";
export type { MyPanelResult } from "../MyPanel/myPanel.processor";

export const processorRegistry: Record<string, PanelProcessor<any, any>> = {
  // ... existing processors
  my_panel: myPanelProcessor,
};
```

### Step 3: Create the React wrapper (`MyPanel/MyPanel.tsx`)

```typescript
import { Heart } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { GenericPanel } from "../GenericPanel";
import { myPanelProcessor, type MyPanelResult } from "./myPanel.processor";

export function createMyPanel(): PanelDefinition<MyPanelResult, HealProcessorEvent> {
  return {
    ...myPanelProcessor,  // Spread id, streams, createState, processEvent
    label: "My Panel",
    icon: <Heart className="h-4 w-4" />,
    supportsPerSecond: true,  // Optional: show per-second toggle
    
    render: (props: PanelRenderProps<MyPanelResult>) => (
      <GenericPanel {...props}>
        <MyPanelContent {...props} />
      </GenericPanel>
    ),
  };
}

function MyPanelContent({ result, context, perSecond, durationMs }: PanelRenderProps<MyPanelResult>) {
  // Use props.context.instance.players for name lookups
  // Use perSecond and durationMs to calculate per-second values
  return <div>...</div>;
}
```

### Step 4: Register in `EventsPanel.tsx`

```typescript
import { createMyPanel } from "./MyPanel/MyPanel";

export const PANELS: Record<string, PanelDefinition<any, any>> = {
  // ... existing panels
  my_panel: createMyPanel(),
};

// This defines EventsPanelType - TypeScript enforces steps 5 and 6
export type EventsPanelType = keyof typeof PANELS;
```

### Step 5: Add to `PANEL_CODES` in `hooks/useUrlState.ts`

```typescript
const PANEL_CODES: Record<PanelType, string> = {
  // ... existing codes
  my_panel: 'mp',  // Short code for URL
};
```

TypeScript will error if you miss this step because `PANEL_CODES` must have all keys from `EventsPanelType`.

### Step 6: Add to `PANEL_CATEGORIES` in `PanelSelector.tsx`

```typescript
const PANEL_CATEGORIES: PanelCategory[] = [
  {
    label: "Healing",
    items: ["healing_done", "healing_taken", "my_panel"],  // Add to existing category
  },
  // Or create a new category
];
```

## Performance Considerations

### Caching Behavior

| What | Cached Where | Lifetime |
|------|--------------|----------|
| Raw stream data (`Uint8Array`) | `InstanceEventsContext` | Until instance changes |
| Decoded events | Never cached | Re-decoded per worker request |
| Aggregated results | React state | Until context/panel changes |

**Stream caching:** Multiple panels requesting the same stream type share cached data. Fetch happens once per stream per instance.

**Result caching:** Each panel's aggregated result is stored in React state. When context changes (encounters, entity selection), the worker re-processes all events.

### Re-render Triggers

The aggregation hook re-runs based on context changes:

1. **Always reprocesses when:**
   - `selectedEncounterIds` changes (user selects different encounters)
   - `panel` changes (user switches panel type)
   - `panel.streams` changes
   - `entitySelection` changes (player/enemy selection)

2. **Never re-runs for:**
   - Display-only changes like `perSecond` toggle (render-only)

### Event Processing

- Events are processed in a **Web Worker pool** to keep UI responsive
- Workers are reused across panels to minimize overhead
- The `event` object is reused during iteration - **don't store references to it**
- Use `GuidCache` for repeated GUID parsing (see `processors/guidCache.ts`)

### Performance Tips

- **Filter early** - check `context.selectedEncounterIds.has(encounterID)` and `context.entitySelection` before expensive work
- **Copy values** - if you need to store event data, copy the values, not the object reference
- **Breakout data is optional** - only compute ability/target breakouts when an entity is selected

## GenericPanel Component

Wrap your render content in `GenericPanel` to get:
- Loading state ("Fetching data...")
- Processing state ("Processing...")
- Error display
- Footer with event count and processing time

```typescript
render: (props) => (
  <GenericPanel {...props}>
    <YourVisualization data={props.result} />
  </GenericPanel>
)
```

## Utility: GuidCache

For panels that parse GUIDs frequently, use `GuidCache` to avoid repeated parsing:

```typescript
import { createGuidCache, getCachedGuid, isPlayerGuidFast } from "../processors/guidCache";

createState: () => ({
  data: new Map(),
  guidCache: createGuidCache(),  // Add to state
}),

processEvent: (state, event, ...) => {
  // Fast check for player GUIDs (avoids full parsing)
  if (isPlayerGuidFast(event.caster)) {
    // It's a player
  }
  
  // Full GUID info with caching
  const guid = getCachedGuid(state.guidCache, event.caster);
  if (guid.isPlayer()) { ... }
  if (guid.isPet()) { ... }
},
```

## Utility: AbilityBreakout

For panels that show damage/healing by ability, use the shared breakout accumulator:

```typescript
import { accumulateAbilityBreakout, type DamageAbilityBreakout } from "../processors/abilityBreakout";

// In processEvent:
accumulateAbilityBreakout(state.ByAbility, entityId, abilityName, amount, hitType);
```

This tracks total damage, hit count, and hit type statistics (crit%, miss%, etc.) per ability.
