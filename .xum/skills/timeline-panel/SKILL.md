---
name: timeline-panel
description: >
  Timeline events panel for Chronicle. A Nivo line chart that visualizes combat data over time
  with configurable multi-series support, per-series filtering, render-time aggregation, and
  drag-to-select time range. Uses custom card-back editor, base64 panelOption persistence,
  and several framework extension points (hydrateContext, renderCardBack, processAllEvents,
  _-prefix convention).
---

# Timeline Panel

## When to Use This Skill

Use when:
- Modifying the Timeline panel (chart, processor, editor, persistence)
- Debugging timeline data issues (wrong values, missing series, stale filters)
- Adding new aggregation types or stream support
- Understanding the custom card-back / panelOption persistence pattern
- Working with framework extension points introduced by the timeline

## File Structure

```
frontend/chronicle/src/pages/Instance/EventsPanels/Timeline/
├── timelineTypes.ts           — Shared types, constants, serialization/deserialization
├── timeline.processor.ts      — Worker-safe processor (multi-stream, per-series filtering)
├── aggregations.ts            — Aggregation registry (sum, rolling_avg, per_second, cumulative)
├── Timeline.tsx               — React panel + Nivo chart rendering
└── TimelineFilterEditor.tsx   — Custom card-back editor (tabbed: Settings + Series)
```

## Architecture

### Data Model

```typescript
interface TimelineSeriesConfig {
  id: string;                    // Unique: "s0", "s1", etc.
  name: string;                  // User-editable display name
  stream: StreamType;            // "damage" | "heal" | "resource_change" | etc.
  aggregation: AggregationType;  // "sum" | "rolling_avg" | "per_second" | "cumulative"
  color: string;                 // Hex color
  filters: PanelFilter[];        // Per-series filters (AND/OR combinators)
}

interface TimelineSettings {
  binMs: number;  // Bucket width, default 1000ms
}

// Stored in panelContext as:
// { timelineSeries: TimelineSeriesConfig[], timelineSettings: TimelineSettings }
```

### Data Flow

```
Card-back edit → updateContext()
  ├→ setPanelContext({ timelineSeries, timelineSettings })   [runtime state]
  └→ persistOption() → setPanelOption("tl:<base64>")         [URL persistence]
        ↓
panelContextVersion bumps → usePanelAggregation effect fires
        ↓
Worker receives ProcessorContext with panelContext
        ↓
timelineProcessor.processEvent():
  - getConfigs(context) reads timelineSeries (or FALLBACK_SERIES)
  - Per-series: check stream match → compile filter → bin event amount
        ↓
TimelineResult { series: Map<id, bins[]>, seriesMeta, binMs, binCount }
        ↓
serializeResult() skips _filterCache (function values can't cross postMessage)
        ↓
TimelineContent applies aggregation at RENDER time (instant switching)
        ↓
Nivo ResponsiveLine renders with per-line colors
```

## Processor Details

**File:** `timeline.processor.ts`

### Key Properties

```typescript
export const timelineProcessor: PanelProcessor<TimelineResult, ProcessorEvent> = {
  id: "timeline",
  streams: ["damage", "heal", "resource_change", "extra_attack", "slain", "cast", "aura"],
  processAllEvents: true,  // Bypasses global filter gate — timeline does its own per-series filtering
  // ...
};
```

### Per-Series Filter Cache (`_filterCache`)

The processor caches compiled filter predicates on the result state:

```typescript
// In processEvent:
if (cfg.filters.length > 0) {
  let predicate = state._filterCache.get(cfg.id);
  if (!predicate) {
    predicate = compileFilters(cfg.filters, context);
    state._filterCache.set(cfg.id, predicate);
  }
  if (!predicate(event)) continue;
}
```

**Critical:** `_filterCache` is a `Map<string, FilterPredicate>` (functions). Functions cannot be serialized via `postMessage`. The `_` prefix causes `serializeResult()` in `panelWorker.ts` to skip this field:

```typescript
// panelWorker.ts — serializeResult()
if (key.startsWith("_")) continue;  // Skip transient worker-only fields
```

**Convention:** Any processor can use `_`-prefixed fields for non-serializable worker-only state.

### Event Amount Extraction

```typescript
function getEventAmount(event: ProcessorEvent): number {
  case "damage" / "heal" / "resource_change" / "extra_attack": return event.amount;
  case "slain" / "cast" / "aura": return 1;  // count
}
```

**Note:** This uses `event.amount` directly. The Damage Done panel also uses `event.amount` but may include tailer amounts separately. If cumulative values differ from other panels, check whether tailers or entity filtering (source_type/target_type) account for the difference.

### Fallback Series

Two separate fallback constants exist and **must be kept in sync**:

| Location | Variable | Purpose |
|----------|----------|---------|
| `timeline.processor.ts` | `FALLBACK_SERIES` | Used by worker when `panelContext` is null |
| `timelineTypes.ts` | `FALLBACK_SERIES_CONFIG` | Used by render side for `activeSeriesIds` and card-back UI |

Both must use `id: "s0"`. If IDs don't match, the render side filters out all processor results.

**Known issue:** The processor's fallback has default filters (source_type: player/pet, target_type: enemy) but the render-side fallback has `filters: []`. These should be synced.

## Persistence System

### Token Format

Timeline config is stored as a `tl:` token in the comma-separated `panelOption` string:

```
panelOption = "tl:eyJzZXJpZXMiOi...,bc:#ef4444,t:Custom Title"
               ↑                     ↑           ↑
               Timeline (base64 JSON) BorderColor  CustomTitle
```

### Serialization Functions (timelineTypes.ts)

| Function | Direction | Purpose |
|----------|-----------|---------|
| `serializeTimelineConfig(series, settings)` | → base64 | Encode config for `tl:` token |
| `deserializeTimelineConfig(encoded)` | base64 → | Decode `tl:` token payload |
| `extractTimelineToken(panelOption)` | string → token | Find `tl:` in comma-separated tokens |
| `hydrateFromPanelOption(panelOption)` | string → context | Full restore: extract + deserialize → `{ timelineSeries, timelineSettings }` |

### Dual-Path Updates (TimelineFilterEditor)

Every config change writes to BOTH paths:
1. `setPanelContext({...panelContext, timelineSeries, timelineSettings})` — immediate runtime state
2. `persistOption(series, settings)` → `setPanelOption("tl:<base64>,...")` — URL persistence

`persistOption` preserves non-timeline tokens (bc:, t:, g:, p:) when rebuilding the panelOption string.

## Framework Extension Points

The timeline introduced or uses these framework-level patterns:

### 1. `hydrateContext` (types.ts → PanelDefinition)

```typescript
hydrateContext?: (panelOption: string) => Record<string, unknown> | null;
```

Called in the `panelType` effect in `EventsPanel.tsx` **after** the default context reset. Prevents a race condition where the parent's `setPanelContext(null)` overwrites the child's `useEffect` hydration.

**Timeline usage:**
```typescript
hydrateContext: (panelOption) => hydrateFromPanelOption(panelOption)
```

### 2. `renderCardBack` (types.ts → PanelDefinition)

```typescript
renderCardBack?: (props: CardBackProps) => React.ReactNode;
```

Replaces the default `PanelFilterEditor` on the card back. Timeline uses this for its tabbed editor.

**Impact on EventsPanel.tsx:**
- `flipCard()` skips `applyFilters(pendingFilters)` for panels with `renderCardBack`
- `closeFilterEditor()` skips filter application too
- This prevents the standard filter buffering from clobbering the timeline's own `panelContext` updates

### 3. `processAllEvents` (processorTypes.ts → PanelProcessor)

```typescript
processAllEvents?: boolean;
```

When `true`, the worker skips the global `filterPredicate(event)` gate before calling `processEvent`. Timeline sets this because it manages per-series filtering internally.

### 4. `_`-prefix convention (panelWorker.ts)

Object keys starting with `_` are skipped during `serializeResult()`. Use for non-serializable worker-only fields (e.g., compiled filter functions).

## Rendering (Timeline.tsx)

### Nivo Integration

- Custom `ColoredSeries extends LineSeries` type with `color` field
- `@nivo/line` types: `LineSeries`, `LineCustomSvgLayerProps<T>`, `SliceTooltipProps<T>` (all generic)
- Series `id` must be the **unique series id** (`"s0"`, `"s1"`) — NOT the display name. Using display names causes nivo to merge series with the same name.

### Tooltip

`TimelineSliceTooltip` receives `seriesMeta` as an extra prop to look up display names from unique series IDs:

```tsx
sliceTooltip={(props) => <TimelineSliceTooltip {...props} seriesMeta={result.seriesMeta} />}
```

### Render-Time Aggregation

The processor always stores **raw sums**. Aggregation is applied in the render `useMemo`:

```typescript
const displayBins = applyAggregation(rawBins, result.binMs, meta.aggregation);
```

This means switching aggregation type (sum → cumulative → per_second) is instant with no reprocessing.

### Active Series Filtering

`activeSeriesIds` is derived from `getSeriesConfigs(panelContext)` and filters out stale series from the result (e.g., after deletion):

```typescript
const activeSeriesIds = useMemo(() => {
  const configs = getSeriesConfigs(pc);
  return new Set(configs.map((c) => c.id));
}, [pc]);
```

### Time Range (Drag-to-Select)

- Click-drag sets `TimeRangeContext` (used by all panels)
- Double-click resets
- Custom Nivo layer renders blue highlight rect over selected range

## Card-Back Editor (TimelineFilterEditor.tsx)

### Tab Layout

```
⚙️ Settings │ Series 1 │ Series 2 │ [+]
```

- **Settings tab** (index -1): Bin size presets, border color, custom title
- **Series tabs** (index 0+): Name, stream picker, aggregation picker, color picker, per-series filters with AND/OR combinators
- **+ button**: Adds new series via `createDefaultSeries(seriesConfigs.length)`

### Per-Series Filters

Uses the same `FilterBlock` component as standard panels, with full AND/OR combinator support:
- Groups by combinator (AND separates groups, OR within groups)
- Clickable AND/OR badges toggle the combinator
- Move up/down buttons for reordering

## Adding a New Aggregation Type

1. Add to `AggregationType` union in `timelineTypes.ts`
2. Add entry to `AGGREGATIONS` in `aggregations.ts`:
   ```typescript
   my_agg: { label: "My Aggregation", fn: (raw, binMs) => /* transform bins */ },
   ```
3. The dropdown in `TimelineFilterEditor` auto-generates from the `AGGREGATIONS` registry

## Common Pitfalls

### 1. Fallback Desync
Two fallback constants (`FALLBACK_SERIES` in processor, `FALLBACK_SERIES_CONFIG` in types) must have matching `id` fields. Mismatched IDs → `activeSeriesIds` filter drops all data → "No data for selected encounters".

### 2. Filter Cache Serialization
`_filterCache` contains functions. Without the `_`-prefix skip in `serializeResult()`, `postMessage` throws `DataCloneError` and the worker silently fails. Always use `_` prefix for non-serializable state.

### 3. Nivo ID Collisions
Using display names as nivo series `id` causes nivo to merge same-named series. Always use unique internal IDs (`"s0"`, `"s1"`).

### 4. Flip-Back Filter Clobber
Without the `renderCardBack` check in `flipCard()`, the standard filter buffering calls `applyFilters([])` on flip-back, which triggers a competing `setPanelContext` update. For panels with custom card-backs, this must be skipped.

### 5. panelType Effect Overwriting Hydration
Without `hydrateContext`, the parent's panelType effect resets `panelContext` to null AFTER the child's `useEffect` hydrates it from `panelOption`. The `hydrateContext` hook runs inside the parent effect, ensuring correct ordering.

### 6. Global Filter Gate
Without `processAllEvents: true`, the worker's global filter gate runs before `processEvent`. While `compileFilters([])` returns a pass-all predicate, setting the flag explicitly is defensive and documents the intent.
