---
name: panel-filters
description: >
  Custom filter system for Chronicle EventsPanels. Covers filter types (ability_name,
  ability_id, ability_school, ability_hittype, source_type, target_type, players, enemies),
  compilation to predicates, UI editors, AND/OR combinator logic, and adding new filters.
  Use when: modifying filter behavior, adding filter types, debugging filter matching,
  or understanding how filters flow from UI → worker → event processing.
---

# Panel Filters

## When to Use This Skill

Use this skill when:
- Adding a new filter type to EventsPanels
- Modifying filter matching logic or UI editors
- Debugging why events are filtered in/out
- Understanding AND/OR combinator grouping
- Working with filter persistence in layouts

## Architecture Overview

Filters let users narrow which combat log events a panel processes. They are **compiled once** into a predicate function, then applied per-event in the Web Worker hot loop.

```
PanelFilterEditor (UI)
  │  onChange(PanelFilter[])
  ▼
EventsPanel (state management)
  │  panelContext.filters
  ▼
usePanelAggregation (merges fixedFilters + user filters)
  │  SerializableProcessorContext.filters
  ▼
panelWorker / mainThreadProcessor
  │  compileFilters() → FilterPredicate  (called ONCE)
  │  filterPredicate(event)              (called per-event)
  ▼
processor.processEvent() — only receives matching events
```

## Key Files

| File | Purpose |
|------|---------|
| `processors/filters.ts` | Types, compiler, `FILTER_COMPILERS`, `compileFilters()`, `evaluateFilters()` |
| `FilterBlock.tsx` | Per-filter UI: type selector, value editor, applyTo, negate |
| `PanelFilterEditor.tsx` | Full filter list editor (flip-card back side) |
| `processors/filters.test.ts` | Unit tests for all filter types and combinators |
| `panelWorker.ts` | Web Worker that compiles and applies filters |
| `mainThreadProcessor.ts` | Main-thread fallback with filter cache |

All paths relative to `frontend/chronicle/src/pages/Instance/EventsPanels/`.

## Filters During Sync Mode

Applied filters keep running while Sync mode is active — incremental main-thread
processing and worker processing (for `syncDataMode: "full"` panels) both compile
and apply them. Only **filter editing** is paused while Sync runs
(`filteringSupported` in `EventsPanel.tsx` requires `!isSyncActive`).

## Core Types

```typescript
export type PanelFilterType =
  | "players" | "enemies"
  | "ability_name" | "ability_id"
  | "ability_school" | "ability_hittype"
  | "source_type" | "target_type"
  | "time_range" | "event_value" | "event_type";

export interface PanelFilter {
  type: PanelFilterType;
  value: string | string[];   // Single value or array (chip inputs)
  negate?: boolean;            // Invert result
  combinator?: "and" | "or";  // Logical connector to PREVIOUS filter
  applyTo?: string[];          // Event types to scope to (damage, heal, cast, etc)
}

export type FilterPredicate = (event: ProcessorEvent, streamType?: string) => boolean;
```

## Filter Types Reference

| Type | Value Format | Matching | UI Editor |
|------|-------------|----------|-----------|
| `players` | `"selected"` or GUIDs | Entity selection from context | — |
| `enemies` | `"selected"` or GUIDs | Entity selection from context | — |
| `ability_name` | `string[]` chips | Case-insensitive substring, OR'd | `AbilityNameEditor` (chip input) |
| `ability_id` | `string[]` chips (numbers) | Exact numeric match, OR'd | `AbilityIdEditor` (chip input + spell tooltip) |
| `ability_school` | `string[]` toggles | Bitmask OR (physical/holy/fire/nature/frost/shadow/arcane) | `SegmentedToggle` |
| `ability_hittype` | `string[]` toggles | Bitmask OR (hit/crit/miss/dodge/parry/etc) | `SegmentedToggle` |
| `source_type` | Mixed options + custom | Entity classification (player/pet/enemy/object/custom) | `EntityTypeEditor` |
| `target_type` | Mixed options + custom | Same as source_type | `EntityTypeEditor` |
| `time_range` | `"start,end"` ms or `"controller"` | Global offset within range; `"controller"` resolves from TimeRangeContext | `TimeRangeEditor` |
| `event_value` | `"<op>:<number>"` (e.g. `"!=:0"`, `">:1000"`) | Compares event amount; ops `>`, `>=`, `<`, `<=`, `=`, `!=` | `EventValueEditor` |
| `event_type` | `string[]` toggles | Exact `event.type` match, OR'd | `SegmentedToggle` |

### event_value semantics

For **heal events**, `event_value` compares **effective healing** (`amount - overheal`),
not the raw amount. A 500 heal that is 100% overheal has an event value of 0. This lets
panels omit pure-overheal noise with a default like Death Log's:

```typescript
{ type: "event_value", value: "!=:0", applyTo: ["heal"] }
```

All other event types compare the raw `amount`. Events without an `amount` field never match.
Empty or malformed values (e.g. `">:abc"`) compile to pass-through.

## Combinator Logic

Filters are grouped by combinator for evaluation:

```
(filter1 OR filter2 OR filter3)  AND  (filter4)  AND  (filter5 OR filter6)
 └─── OR group ─────────────┘         └─ single ─┘    └─── OR group ─────┘
```

- First filter's combinator is ignored (starts first group)
- `combinator: "or"` continues the current group
- `combinator: "and"` (or undefined) starts a new group
- Within a group: **any** filter passing = group passes
- Across groups: **all** groups must pass

## Compilation & Performance

`compileFilters()` is called **once** per context change, returning a `FilterPredicate`:

```typescript
const predicate = compileFilters(filters, context);
// Then in hot loop:
for (const event of events) {
  if (predicate(event, streamType)) {
    processor.processEvent(state, event, ...);
  }
}
```

**Optimizations:**
- Sets/bitmasks pre-computed at compile time
- n=1 fast paths: single ability_id uses `===` instead of `Set.has()`; single ability_name avoids `.some()`
- `mainThreadProcessor` caches compiled predicates by reference equality
- `applyTo` makes filters pass-through for non-matching event types (no overhead)
- `negate` applied before `applyTo` (filter logic, not scoping)

## Adding a New Filter Type

### Step 1: Add to `PanelFilterType` in `processors/filters.ts`

```typescript
export type PanelFilterType =
  | "players" | "enemies"
  | "ability_name" | "ability_id"
  // ...existing...
  | "my_filter";  // Add here
```

### Step 2: Add compiler in `FILTER_COMPILERS`

```typescript
// In processors/filters.ts, add to FILTER_COMPILERS:
my_filter: (value, context) => {
  const vals = toValues(value);  // handles string | string[] → string[]
  if (vals.length === 0) return () => true;  // empty = pass-through
  // ... build predicate
  return (event) => {
    // return true if event matches
  };
},
```

Key helpers:
- `toValues(value)` — normalize `string | string[]` → `string[]`
- `getEventAbilityName(event)` / `getEventAbilityId(event)` — extract spell info
- `getCasterTarget(event)` — get `{ caster, target }` from any event type

### Step 3: Add UI editor in `FilterBlock.tsx`

Add option to `FILTER_TYPES`:
```typescript
{ value: "my_filter", label: "My Filter" },
```

Add to `TYPES_WITH_APPLY_TO` if it should support event-type scoping.

Create editor component and add case to `ValueEditor`:
```typescript
if (filter.type === "my_filter") return <MyFilterEditor filter={filter} onChange={onChange} />;
```

### Step 4: Add label in `EventsPanel.tsx`

```typescript
// In FILTER_TYPE_LABELS:
my_filter: "My Filter",
```

### Step 5: Add tests in `processors/filters.test.ts`

Test the compiler with `evaluateFilters()`:
```typescript
it("matches my_filter", () => {
  const filters: PanelFilter[] = [{ type: "my_filter", value: "test" }];
  expect(evaluateFilters(filters, someEvent, createContext())).toBe(true);
});
```

## UI Editor Patterns

### Chip Input (multi-value text/number)
Used by `ability_name` and `ability_id`. Pattern:
- `toArrayValue(filter.value)` for current chips
- Enter/comma to add, backspace/× to remove, blur to commit
- Store as `string[]` in `filter.value`
- `ability_id` chips include `SpellIconWithTooltip` for hover tooltips

### Segmented Toggle (multi-select buttons)
Used by `ability_school` and `ability_hittype`. Pattern:
- Wide: row of toggle buttons
- Narrow: compact dropdown with checkboxes
- Values stored as comma-separated string or string[]

### Entity Type Editor (grouped options + custom)
Used by `source_type` and `target_type`. Pattern:
- Identity section: selected_players, selected_enemies, custom entries
- Type section: player, pet, enemy_pet, enemy, object
- Custom input accepts name or GUID strings

## Filter Persistence

Filters are persisted per-panel in layout state:
```typescript
// In InstancePageView state:
Record<string, PanelFilter[]>  // keyed by panel item ID

// Serialized to JSON for layout export/import
// Sent to worker via SerializableProcessorContext.filters
```

Panels can also define **fixed filters** (always active, shown with 🔒) via `panel.fixedFilters`.

## Anti-Patterns

- **Don't call `compileFilters()` per-event** — compile once, reuse the predicate
- **Don't import React in filter compilers** — `processors/filters.ts` runs in Web Worker
- **Don't forget `applyTo` semantics** — filters with `applyTo` pass-through non-matching event types (they don't reject them)
- **Don't assume `value` is always a string** — use `toValues()` / `toArrayValue()` to normalize
