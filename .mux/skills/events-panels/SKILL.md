---
name: events-panels
description: |
  EventsPanels system for Chronicle combat log analysis. Processes WoW combat log event streams 
  (damage, heal, resource_change, slain, cast, aura, extra_attack) into displayable metrics.
  Key architecture: processors are worker-safe pure TypeScript (NO React), panels are React wrappers.
  Processing runs in a Web Worker pool to keep UI responsive.
  Includes Focus feature: right-click player rows to drill into per-ability breakdown (URL-persisted).
  Covers Sync mode aggregation policy (syncDataMode incremental vs full) and reusable
  floating breakout components (IncomingEventsBreakout, RelativeHealthBar, shared fight-offset cursor).
---

# Events Panels

## When to Use This Skill

Use this skill when:
- Adding a new panel to display combat log metrics
- Modifying existing panel aggregation logic
- Adding new stream types or event processing
- Adding or modifying the Focus feature (right-click → ability breakdown)
- Debugging panel performance issues

## Architecture Overview

EventsPanels split into two files: **processors** (worker-safe) and **React wrappers**.

```
Processor (worker-safe)     +     Panel (React wrapper)
─────────────────────────         ────────────────────────
processors/foo.processor.ts       FooPanel/Foo.tsx
- id, streams, createState        - label, icon
- processEvent()                  - render()
                                  - spreads processor props
```

**Data Flow:**
1. `usePanelAggregation` fetches required streams from `InstanceEventsContext` (cached)
2. Streams + context are sent to Web Worker via `postMessage`
3. Worker iterates events, calls `processor.processEvent()`
4. Worker returns serialized result (Maps become arrays with markers)
5. Hook deserializes result and triggers re-render

**Key Directory Structure:**
```
frontend/chronicle/src/pages/Instance/EventsPanels/
├── types.ts               # React-side types (PanelContext, PanelDefinition)
├── processorTypes.ts      # Worker-safe types (ProcessorContext, PanelProcessor)
├── panelWorker.ts         # Web Worker that runs processEvent
├── workerPool.ts          # Worker pool manager
├── usePanelAggregation.ts # Hook that manages worker lifecycle
├── EventsPanel.tsx        # Container with PANELS registry
├── PanelSelector.tsx      # Dropdown with PANEL_CATEGORIES
├── processors/            # Shared processors and utilities
│   ├── index.ts           # processorRegistry + exports
│   ├── guidCache.ts       # GUID parsing cache
│   └── abilityBreakout.ts # Shared breakout accumulation
└── <PanelName>/           # Panel directories (e.g., DamageDone/)
    ├── <name>.processor.ts
    └── <PanelName>.tsx
```

**Authoritative Reference:** `frontend/chronicle/src/pages/Instance/EventsPanels/DESIGN.md`

## Checklist for Adding a New Panel

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

### Step 2: Register the processor in `processors/index.ts`

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
import { myPanelProcessor, type MyPanelResult } from "./myPanel.processor";

export function createMyPanel(): PanelDefinition<MyPanelResult, HealProcessorEvent> {
  return {
    ...myPanelProcessor,  // Spread id, streams, createState, processEvent
    label: "My Panel",
    icon: <Heart className="h-4 w-4" />,
    supportsPerSecond: true,  // Optional: show per-second toggle
    
    render: (props: PanelRenderProps<MyPanelResult>) => (
      <MyPanelContent {...props} />
    ),
  };
}

function MyPanelContent({ result, context, perSecond, durationMs }: PanelRenderProps<MyPanelResult>) {
  // Use context.instance.players for name lookups
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

TypeScript will error if you miss this step.

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

## Key Types

### Stream Types

Available streams for `processor.streams`:

```typescript
type StreamType = "damage" | "heal" | "resource_change" | "slain" | "cast" | "aura" | "extra_attack";
```

### ProcessorEvent Types

Events are typed based on the stream they come from:

```typescript
type ProcessorEvent = 
  | DamageProcessorEvent      // { type: "damage", caster, target, amount, hitType, school, tailers }
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

### PanelProcessor<TResult, TEvent> (Worker-safe)

```typescript
interface PanelProcessor<TResult, TEvent extends ProcessorEvent = ProcessorEvent> {
  id: string;                    // Unique identifier
  streams: StreamType[];         // Required streams
  createState: () => TResult;    // Initialize aggregation state
  processEvent: (              
    state: TResult,
    event: TEvent,
    encounterID: string,
    firstTimestamp: Date,
    streamType: StreamType,
    context: ProcessorContext,
  ) => void;
}
```

### ProcessorContext (Worker-safe)

```typescript
interface ProcessorContext {
  players: Record<string, { name: string; class: string }>;
  units?: Record<string, { name: string; owner: string | null; entry: number }>;
  selectedEncounterIds: Set<string>;
  entitySelection: {
    enemyIds: Set<string>;
    playerIds: Set<string>;
  };
  pagination?: ProcessorPagination;
}
```

### PanelDefinition<TResult> (React wrapper)

```typescript
interface PanelDefinition<TResult, TEvent> extends PanelProcessor<TResult, TEvent> {
  label: string;                 // Display name
  icon: React.ReactNode;         // Icon component
  supportsPerSecond?: boolean;   // Show per-second toggle
  checkboxLabel?: string;        // Custom checkbox label
  selfManagesAggregation?: boolean; // Panel handles its own data loading
  render: (props: PanelRenderProps<TResult>) => React.ReactNode;
}
```

### PanelRenderProps<TResult>

```typescript
interface PanelRenderProps<TResult> {
  result: TResult;              // Aggregated state
  totalEvents: number;          // Events processed
  processingTimeMs: number | null;
  durationMs: number;           // Encounter duration
  perSecond: boolean;           // User toggle for /s display
  checkboxChecked: boolean;     // Same as perSecond
  loading: boolean;
  processing: boolean;
  error: Error | null;
  context: PanelContext;        // Full context for rendering
}
```

## Utilities

### GuidCache

For panels that parse GUIDs frequently:

```typescript
import { createGuidCache, getCachedGuid, isPlayerGuidFast } from "../processors/guidCache";

createState: () => ({
  data: new Map(),
  guidCache: createGuidCache(),
}),

processEvent: (state, event, ...) => {
  // Fast check (avoids full parsing)
  if (isPlayerGuidFast(event.caster)) { /* player */ }
  
  // Full GUID info with caching
  const guid = getCachedGuid(state.guidCache, event.caster);
  if (guid.isPlayer()) { ... }
  if (guid.isPet()) { ... }
},
```

### AbilityBreakout

For panels that show damage/healing by ability:

```typescript
import { accumulateAbilityBreakout, type DamageAbilityBreakout } from "../processors/abilityBreakout";

// In processEvent:
accumulateAbilityBreakout(state.ByAbility, entityId, abilityName, amount, hitType);
```

## Sync Mode & syncDataMode

Sync mode replays an encounter against a moving absolute timestamp
(`SyncModeContext.currentTimestamp`). By default, panels switch from worker
processing to **main-thread incremental processing** that only aggregates
events up to the Sync cursor — metrics grow as playback advances.

Panels choose their policy via `PanelDefinition.syncDataMode`:

| Mode | Aggregation during Sync | Duration during Sync | Use for |
|------|------------------------|----------------------|---------|
| `"incremental"` (default) | Main thread, up to the cursor | Elapsed playhead time | Metrics that should grow with playback (DPS, healing) |
| `"full"` | Web Worker, complete encounter | Full encounter duration | Whole-encounter views (Death Log) where Sync is only a presentation cursor |

Full-data panels read Sync timing themselves for presentation (cursors, playheads,
row muting) via `useSyncModeContextOptional()`. Example: Death Log declares
`syncDataMode: "full"` and mutes deaths ahead of the playhead with
`isDeathAheadOfSyncCursor()` (`Deaths/deathLogSync.ts`) instead of changing its data.

Key consequences of `"full"`:
- The panel works when selected mid-playback (no incremental state to rebuild).
- Applied filters keep running in the worker; only filter editing pauses during Sync.
- `usesIncrementalSyncProcessing()` in `usePanelAggregation.ts` is the gate.

## Reusable Breakout Components

Floating per-player breakout boxes share these building blocks:

| Component | Path | Purpose |
|-----------|------|---------|
| `BreakoutIdentity` | `components/ui/BreakoutPanel/` | Compact colored-dot + name + class header treatment |
| `RelativeHealthBar` | `components/ui/RelativeHealthBar/` | Message-driven relative health/deficit bar (damage/healing/prevented messages) |
| `IncomingEventsBreakout` | `EventsPanels/IncomingEvents/` | Incoming-event timeline with shared fight-offset cursor, configurable window |
| `FloatingIncomingEventsBreakout` | `EventsPanels/IncomingEvents/` | Draggable, resizable portal wrapper (`data-drag-handle`, mobile modal) |
| `EventTimelinePreview` | `EventsPanels/IncomingEvents/` | Narrow scrub gutter with colored event ticks |

Shared-cursor rule: breakouts synchronize by **fight offset** (encounter time), not
offset-to-anchor. Each box converts the shared offset to its local anchor-relative
cursor with `relativeCursorForFightOffset()` and clamps to its window edges
(`incomingEventsTimeline.ts`). During Sync, `syncCursorForDeath()` drives the cursor
and manual scrubbing is disabled.

## Caching Behavior

| What | Cached Where | Lifetime |
|------|--------------|----------|
| Raw stream data (`Uint8Array`) | `InstanceEventsContext` | Until instance changes |
| Decoded events | Never cached | Re-decoded per worker request |
| Aggregated results | React state | Until context/panel changes |

Multiple panels requesting the same stream type share cached data.

## Focus Feature (Right-Click → Ability Breakdown)

Panels that show per-player bar charts (via `PlayerMetricChart`) support a **Focus** feature: right-clicking a player row opens a context menu with a "Focus" option that replaces the per-player view with a per-ability bar chart for the focused player.

### Currently Supported Panels
- **DamageDone** (`DamageDoneContent.tsx`) — uses `result.ByAbility`
- **HealingDone** (`HealingDoneContent.tsx`) — uses `result.HealerByAbility` / `HealerByAbilityOverheal` / `HealerByAbilityTotal`
- **HealingTaken** (`HealingTakenContent.tsx`) — uses `result.TargetByAbility` / `TargetByAbilityOverheal` / `TargetByAbilityTotal`

### How It Works

1. **`PlayerMetricChart`** has an `onRowContextMenu` prop that fires on right-click with `(playerId, event)`
2. **`RowContextMenu`** (`components/ui/PlayerMetricChart/RowContextMenu.tsx`) renders a portal-based context menu
3. **Focus state** is persisted in `panelOption` (URL) as a `f:<playerId>` token, comma-separated with other tokens
4. **Focused view** maps `ByAbility` entries to `PlayerMetricChartData[]` and renders them through the same `PlayerMetricChart`
5. **Focused breakout** shows hit-type detail (hits/crits/misses/min/max) when clicking an ability bar
6. **`registerChartData`** registers the active view's data (focused abilities or normal players) for cross-panel comparison

### URL Encoding (`panelOption`)

Focus is encoded as `f:<playerId>` alongside other panel-specific tokens:

```
dd[f:0xABC123]                    — damage panel focused on player
pdd[pet,f:0xABC123]               — pet panel with grouping + focus
hd[overheal,ranks,f:0xABC123]     — healing done: overheal mode + ranks + focus
ht[f:0xABC123]                    — healing taken focused on player
```

### Adding Focus to a New Panel

If your panel renders a `PlayerMetricChart` with per-player data and has a `ByAbility`-style map in its processor result, add Focus by following the pattern in `DamageDoneContent.tsx`:

```typescript
// 1. Parse focus from panelOption
const focusedPlayerId = useMemo(() => {
  if (!panelOption) return null;
  const token = panelOption.split(",").find(t => t.startsWith("f:"));
  return token ? token.slice(2) : null;
}, [panelOption]);

// 2. Serialize focus back (preserve other tokens)
const setFocusedPlayerId = useCallback((id: string | null) => {
  // Combine with existing tokens (viewMode, ranks, grouping, etc.)
  setPanelOption?.(serializeWithFocus(existingTokens, id));
}, [setPanelOption, ...]);

// 3. Build focused ability data as PlayerMetricChartData[]
const focusedAbilityData = useMemo(() => {
  if (!focusedPlayerId || !result) return null;
  const abilities = result.ByAbility.get(focusedPlayerId);
  if (!abilities) return null;
  const barClassName = focusedPlayer?.className ?? "foreground";
  return [...abilities.entries()]
    .map(([name, stats]) => ({
      playerID: name, playerName: name,
      className: barClassName, specialization: "",
      value: stats.Total,
    }))
    .sort((a, b) => b.value - a.value);
}, [focusedPlayerId, result, focusedPlayer?.className]);

// 4. Build focused breakout (single ability → hit-type detail)
const focusedBreakout = useCallback((abilityName: string, pinned: boolean) => {
  // Extract single ability from ByAbility, render AbilityBreakout
}, [...]);

// 5. Register active data for comparison table
useEffect(() => {
  registerChartData?.(focusedAbilityData ?? normalData);
}, [registerChartData, focusedAbilityData, normalData]);

// 6. Update total to reflect active view
const activeData = focusedAbilityData ?? normalData;
const total = activeData.reduce((sum, d) => sum + d.value, 0);

// 7. Conditional rendering
{focusedPlayerId && focusedAbilityData ? (
  <PlayerMetricChart data={focusedAbilityData} breakout={focusedBreakout} ... />
) : (
  <PlayerMetricChart data={normalData} breakout={breakout}
    onRowContextMenu={handleRowContextMenu} ... />
)}
```

Key components to import:
- `RowContextMenu` from `@/components/ui/PlayerMetricChart/RowContextMenu`
- `AbilityBreakout`, `type AbilityData` from `@/components/ui/AbilityBreakout`
- `ChevronLeft` from `lucide-react` (for back button)

### Interaction Behavior

| Action | Normal View | Focused View |
|--------|-------------|--------------|
| Left-click row | Breakout tooltip (ability list) | Breakout tooltip (hit-type stats) |
| Right-click row | Context menu → "Focus" | No context menu |
| Back / ESC | n/a | Returns to normal view |
| Total display | Sum of all players | Sum of focused player's abilities |
| Comparison table | Matches by player ID | Matches by ability name |
| Per-second toggle | Per player | Per ability |

## Anti-Patterns

### Processors MUST NOT:
- Import React or JSX (runs in Web Worker)
- Store event object references (the object is reused - copy values)
- Hold onto non-serializable data (no functions, no circular refs)

### Performance Tips:
- **Filter early** - check `context.selectedEncounterIds.has(encounterID)` before expensive work
- **Use GuidCache** for repeated GUID parsing
- **Breakout data is optional** - only compute when entity is selected:
  ```typescript
  if (context.entitySelection.playerIds.size > 0) {
    // Compute detailed breakout
  }
  ```

### Common Mistakes:
- Forgetting to add processor to `processorRegistry` (Step 2)
- Forgetting `PANEL_CODES` in `useUrlState.ts` (Step 5) - TypeScript will error
- Importing processor types from `types.ts` instead of `processorTypes.ts` in worker code

## Example: Minimal Panel

```typescript
// empty.processor.ts
export interface EmptyResult {}

export const emptyProcessor: PanelProcessor<EmptyResult> = {
  id: "empty",
  streams: [],
  createState: () => ({}),
  processEvent: () => {},
};

// Empty.tsx
export function createEmptyPanel(): PanelDefinition<EmptyResult> {
  return {
    ...emptyProcessor,
    label: "Empty",
    icon: <Square className="h-4 w-4" />,
    render: () => <div>Select a panel type</div>,
  };
}
```
