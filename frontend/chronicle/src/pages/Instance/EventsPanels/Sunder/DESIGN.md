# Sunder Armor Panel

Tracks Sunder Armor effectiveness by warriors.

## What It Tracks

### Effective vs Ineffective Sunders
A sunder is considered **effective** only if:
1. A warrior casts "Sunder Armor" on a target
2. The target receives an "afflicted by Sunder Armor (N)" aura event within **500ms** of the cast

If no affliction occurs within the window, the sunder is marked as **ineffective** (wasted).

### Time to 5 Stacks
For each target, tracks how long from encounter start until they reach 5 stacks of Sunder Armor. This helps evaluate how quickly tanks/warriors are establishing threat.

### First 5 Contributors
Records which warriors contributed to getting a target to 5 stacks, in order. Useful for understanding sunder rotation/coordination.

## Data Flow

```
Combat Log Events
       │
       ▼
┌─────────────────┐    ┌─────────────────┐
│   Cast Stream   │    │   Aura Stream   │
│ "Casts Sunder"  │    │ "Afflicted by"  │
└────────┬────────┘    └────────┬────────┘
         │                      │
         ▼                      ▼
   ┌───────────┐          ┌───────────┐
   │  Pending  │◄─────────│  Match    │
   │   Casts   │  <500ms  │  Window   │
   └───────────┘          └───────────┘
         │                      │
         ▼                      ▼
   ┌───────────┐          ┌───────────┐
   │Ineffective│          │ Effective │
   │  (wasted) │          │ (matched) │
   └───────────┘          └───────────┘
```

## Event Matching Algorithm

1. When a Sunder Armor cast is seen, store it as a "pending" cast keyed by target GUID
2. When an affliction event is seen:
   - Look for pending casts on that target within 500ms
   - If multiple casts are pending, credit the **oldest** (first warrior to cast gets credit)
   - If found, mark the cast as effective and record the stack count
   - If not found, the affliction is ignored (could be from a different source)
3. Pending casts older than 500ms are marked as ineffective

### Why oldest cast gets credit

When multiple warriors cast Sunder on the same target in quick succession, only one stack is applied. The first warrior who successfully cast (not dodged/parried) should get credit for that stack, not the last one.

## Debug Breakout

Click on a target row to see a detailed timeline of all cast and affliction events for debugging the time-to-5 calculation.

## Views

### Warriors View (default)
Shows per-warrior stats:
- Effective sunders
- Wasted sunders  
- Total
- Effectiveness percentage (color coded: green ≥90%, yellow ≥70%, red <70%)

### Targets View (toggle "Show targets")
Shows per-target stats:
- Time to reach 5 stacks (from encounter start)
- Which warriors contributed to the first 5 stacks
- Collapsible list of targets that never reached 5 stacks

## Filtering

When enemies are selected in the UI, only sunders cast on those targets are shown.
